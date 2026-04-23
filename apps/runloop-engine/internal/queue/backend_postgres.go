package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

	"github.com/runloop/runloop-engine/internal/db"
	"github.com/runloop/runloop-engine/internal/idgen"
)

// PostgresBackend stores jobs in job_queue_items and uses
// `SELECT ... FOR UPDATE SKIP LOCKED` for contention-free parallel dequeue.
//
// This is the same pattern used by river, oban, graphile-worker, and
// neoq. On modern Postgres it handles ~5k jobs/s per queue before
// contention bites — more than enough for most application workloads.
//
// Lease model: when a worker picks up a job, it UPDATEs the row to
// status='PROCESSING', sets locked_until = NOW() + visibility_sec, and
// bumps attempts. If the worker crashes, the reaper (manager.runReaper)
// resets leases whose locked_until has passed.
type PostgresBackend struct {
	db       *db.Postgres
	workerID string

	// Ongoing Nack/DeadLetter don't go through Consume, so we don't need a
	// pool here — the pgxpool inside db handles concurrency. A mutex
	// protects the handle map that maps a backend-opaque "handle" to a row
	// id (they're the same string for this backend, but we keep the
	// indirection so the abstraction holds).
	_ sync.Mutex
}

func NewPostgresBackend(pg *db.Postgres, workerID string) *PostgresBackend {
	return &PostgresBackend{db: pg, workerID: workerID}
}

func (p *PostgresBackend) Name() string { return "postgres" }

func (p *PostgresBackend) Enqueue(ctx context.Context, q *QueueDef, req EnqueueRequest) (string, error) {
	id := idgen.New()
	payloadBytes, err := json.Marshal(req.Payload)
	if err != nil {
		return "", fmt.Errorf("marshal payload: %w", err)
	}

	var existingID string
	err = p.db.Pool.QueryRow(ctx, `
		INSERT INTO job_queue_items (id, queue_name, project_id, payload, idempotency_key, priority)
		VALUES ($1, $2, $3, $4::jsonb, $5, $6)
		ON CONFLICT (queue_name, idempotency_key) DO UPDATE SET queue_name = EXCLUDED.queue_name
		RETURNING id
	`, id, q.Name, q.ProjectID, string(payloadBytes), nullIfEmpty(req.IdempotencyKey), req.Priority).Scan(&existingID)
	if err != nil {
		return "", err
	}
	return existingID, nil
}

// Consume runs one poll loop. We batch-claim up to concurrency rows per
// tick, spawn goroutines to handle them, and re-poll when the batch
// drains. Idle polling interval starts at 1s and backs off to 5s when
// there's no work.
func (p *PostgresBackend) Consume(ctx context.Context, q *QueueDef, handler Handler) error {
	sem := make(chan struct{}, q.Concurrency)
	var wg sync.WaitGroup

	pollInterval := 1 * time.Second
	const maxInterval = 5 * time.Second

	defer wg.Wait()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		msgs, err := p.claimBatch(ctx, q, q.Concurrency)
		if err != nil {
			if errors.Is(err, context.Canceled) {
				return err
			}
			log.Error().Err(err).Str("queue", q.Name).Msg("claim batch failed")
			time.Sleep(time.Second)
			continue
		}

		if len(msgs) == 0 {
			// No work — back off up to maxInterval.
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(pollInterval):
			}
			if pollInterval < maxInterval {
				pollInterval *= 2
				if pollInterval > maxInterval {
					pollInterval = maxInterval
				}
			}
			continue
		}
		// Work found — reset poll interval.
		pollInterval = 1 * time.Second

		for _, msg := range msgs {
			sem <- struct{}{}
			wg.Add(1)
			go func(m *Message) {
				defer wg.Done()
				defer func() { <-sem }()

				// Per-job context with the visibility window as timeout.
				jobCtx, cancel := context.WithTimeout(ctx, time.Duration(q.VisibilitySec)*time.Second)
				defer cancel()

				if err := handler(jobCtx, m); err != nil {
					log.Error().Err(err).Str("job", m.ID).Msg("handler error (backend.Nack already called by manager)")
				}
			}(msg)
		}
	}
}

// claimBatch atomically marks up to `limit` ready jobs as PROCESSING and
// returns them. Uses SKIP LOCKED so concurrent workers don't serialize.
func (p *PostgresBackend) claimBatch(ctx context.Context, q *QueueDef, limit int) ([]*Message, error) {
	rows, err := p.db.Pool.Query(ctx, `
		UPDATE job_queue_items SET
			status='PROCESSING',
			locked_by=$1,
			locked_until=NOW() + ($2::INT || ' seconds')::INTERVAL,
			attempts=attempts+1
		WHERE id IN (
			SELECT id FROM job_queue_items
			WHERE queue_name=$3 AND status='PENDING' AND visible_after <= NOW()
			ORDER BY priority DESC, created_at
			LIMIT $4
			FOR UPDATE SKIP LOCKED
		)
		RETURNING id, payload, idempotency_key, attempts, created_at
	`, p.workerID, q.VisibilitySec, q.Name, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*Message
	for rows.Next() {
		var id string
		var payloadRaw []byte
		var idKey *string
		var attempts int
		var enq time.Time
		if err := rows.Scan(&id, &payloadRaw, &idKey, &attempts, &enq); err != nil {
			return nil, err
		}
		var payload map[string]interface{}
		if len(payloadRaw) > 0 {
			_ = json.Unmarshal(payloadRaw, &payload)
		}
		key := ""
		if idKey != nil {
			key = *idKey
		}
		out = append(out, &Message{
			Handle:         id,
			ID:             id,
			QueueName:      q.Name,
			Payload:        payload,
			Attempts:       attempts,
			IdempotencyKey: key,
			EnqueuedAt:     enq,
		})
	}
	return out, rows.Err()
}

func (p *PostgresBackend) Ack(ctx context.Context, q *QueueDef, handle string) error {
	_, err := p.db.Pool.Exec(ctx, `
		UPDATE job_queue_items
		SET status='COMPLETED', locked_by=NULL, locked_until=NULL, completed_at=NOW()
		WHERE id=$1 AND queue_name=$2
	`, handle, q.Name)
	return err
}

func (p *PostgresBackend) Nack(ctx context.Context, q *QueueDef, handle string, requeueAfter time.Duration, lastErr string) error {
	_, err := p.db.Pool.Exec(ctx, `
		UPDATE job_queue_items
		SET status='PENDING',
		    locked_by=NULL, locked_until=NULL,
		    visible_after = NOW() + ($1::INT || ' milliseconds')::INTERVAL,
		    last_error=$2
		WHERE id=$3 AND queue_name=$4
	`, requeueAfter.Milliseconds(), lastErr, handle, q.Name)
	return err
}

func (p *PostgresBackend) DeadLetter(ctx context.Context, q *QueueDef, handle string, reason string) error {
	_, err := p.db.Pool.Exec(ctx, `
		UPDATE job_queue_items
		SET status='DLQ', locked_by=NULL, locked_until=NULL, last_error=$1, completed_at=NOW()
		WHERE id=$2 AND queue_name=$3
	`, reason, handle, q.Name)
	return err
}

func (p *PostgresBackend) Ping(ctx context.Context, _ map[string]interface{}) error {
	return p.db.Pool.Ping(ctx)
}

func (p *PostgresBackend) Close() error { return nil }

// Helpers.

func nullIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// Suppress unused import warning for pgx — we use pgx.Row type via
// manager.go but this file doesn't import it directly.
var _ = pgx.ErrNoRows
