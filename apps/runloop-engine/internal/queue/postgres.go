package queue

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"sync"
	"time"

	"github.com/runloop/runloop-engine/internal/db"
	"github.com/runloop/runloop-engine/internal/worker"
	"github.com/rs/zerolog/log"
)

// PostgresQueue is a persistent queue stored in a `task_queue` table. It uses
// `SELECT … FOR UPDATE SKIP LOCKED` so multiple engine instances can pull
// concurrently without locking each other. This is the recommended driver for
// most deployments: no extra infrastructure, strong durability, at-least-once
// delivery semantics.
//
// Schema (auto-created on first use):
//
//	CREATE TABLE IF NOT EXISTS task_queue (
//	  id           BIGSERIAL PRIMARY KEY,
//	  payload      JSONB NOT NULL,
//	  enqueued_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
//	  picked_up_at TIMESTAMPTZ
//	);
//	CREATE INDEX IF NOT EXISTS idx_task_queue_pending
//	  ON task_queue (enqueued_at) WHERE picked_up_at IS NULL;
type PostgresQueue struct {
	db          *db.Postgres
	pollInterval time.Duration
	closeMu     sync.Mutex
	closed      bool
	closeCh     chan struct{}
}

// NewPostgresQueue initializes a Postgres-backed queue. It creates the table
// if it doesn't exist. `pollInterval` controls how often the Pop loop
// re-queries for new tasks when the table is empty.
func NewPostgresQueue(ctx context.Context, database *db.Postgres, pollInterval time.Duration) (*PostgresQueue, error) {
	if pollInterval <= 0 {
		pollInterval = 500 * time.Millisecond
	}

	if _, err := database.Pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS task_queue (
			id           BIGSERIAL PRIMARY KEY,
			payload      JSONB NOT NULL,
			enqueued_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			picked_up_at TIMESTAMPTZ
		);
		CREATE INDEX IF NOT EXISTS idx_task_queue_pending
			ON task_queue (enqueued_at) WHERE picked_up_at IS NULL;
	`); err != nil {
		return nil, err
	}

	return &PostgresQueue{
		db:           database,
		pollInterval: pollInterval,
		closeCh:      make(chan struct{}),
	}, nil
}

func (q *PostgresQueue) Push(ctx context.Context, task *worker.Task) error {
	if q.isClosed() {
		return io.EOF
	}
	payload, err := json.Marshal(task)
	if err != nil {
		return err
	}
	_, err = q.db.Pool.Exec(ctx,
		`INSERT INTO task_queue (payload) VALUES ($1)`, payload,
	)
	return err
}

// Pop polls the table until a row can be locked + deleted. Uses
// `FOR UPDATE SKIP LOCKED` so concurrent Pop calls from other engines don't
// block each other.
func (q *PostgresQueue) Pop(ctx context.Context) (*worker.Task, error) {
	for {
		if q.isClosed() {
			return nil, io.EOF
		}
		task, err := q.tryPop(ctx)
		if err != nil {
			return nil, err
		}
		if task != nil {
			return task, nil
		}
		// No task available — wait a bit and retry, or exit on cancel/close.
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-q.closeCh:
			return nil, io.EOF
		case <-time.After(q.pollInterval):
		}
	}
}

func (q *PostgresQueue) tryPop(ctx context.Context) (*worker.Task, error) {
	var payload []byte
	// CTE pattern: one atomic statement does SELECT+DELETE while holding a
	// row lock that other workers skip. Equivalent to classic message-queue
	// "receive and delete" semantics.
	err := q.db.Pool.QueryRow(ctx, `
		WITH next_task AS (
			SELECT id FROM task_queue
			WHERE picked_up_at IS NULL
			ORDER BY enqueued_at
			FOR UPDATE SKIP LOCKED
			LIMIT 1
		)
		DELETE FROM task_queue WHERE id = (SELECT id FROM next_task)
		RETURNING payload
	`).Scan(&payload)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return nil, err
		}
		// pgx returns ErrNoRows as a sentinel error when the DELETE deleted
		// nothing (no task available). We use string match because the pgx
		// sentinel varies by version.
		if err.Error() == "no rows in result set" {
			return nil, nil
		}
		log.Debug().Err(err).Msg("postgres queue: scan failed")
		return nil, nil
	}
	var task worker.Task
	if err := json.Unmarshal(payload, &task); err != nil {
		log.Warn().Err(err).Msg("postgres queue: malformed task payload, dropping")
		return nil, nil
	}
	return &task, nil
}

func (q *PostgresQueue) Len(ctx context.Context) (int, error) {
	var n int
	err := q.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM task_queue WHERE picked_up_at IS NULL`,
	).Scan(&n)
	return n, err
}

func (q *PostgresQueue) Close() error {
	q.closeMu.Lock()
	defer q.closeMu.Unlock()
	if q.closed {
		return nil
	}
	q.closed = true
	close(q.closeCh)
	return nil
}

func (q *PostgresQueue) isClosed() bool {
	q.closeMu.Lock()
	defer q.closeMu.Unlock()
	return q.closed
}
