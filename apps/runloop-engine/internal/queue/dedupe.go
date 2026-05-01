package queue

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/runloop/runloop-engine/internal/db"
)

// Dedupe stores (queue, idempotency-key) → job-id for non-PG backends.
// The PG backend uses a UNIQUE constraint on job_queue_items directly
// and doesn't need this helper.
//
// Keys expire after the queue's visibility window × max-attempts, so a
// dedupe entry lives at least as long as the longest-lived delivery.
// Expired rows are cleaned by a background janitor (see Reap).
type Dedupe struct {
	db *db.Postgres
}

func NewDedupe(pg *db.Postgres) *Dedupe {
	return &Dedupe{db: pg}
}

// ErrDuplicate is returned by Claim when the key already exists. The caller
// should return the existing jobID rather than enqueueing again.
var ErrDuplicate = errors.New("duplicate idempotency key")

// Claim tries to insert (queue, key, jobID). Returns ErrDuplicate if the
// key is already claimed; in that case the caller should look up the
// existing jobID with ExistingJobID.
func (d *Dedupe) Claim(ctx context.Context, queue, key, jobID string, ttl time.Duration) error {
	if key == "" {
		return nil // no-op when no idempotency requested
	}
	// Note: `$4 || ' seconds'` in PG 14+ errors with int4 LHS ("operator
	// does not exist: integer || unknown"). Cast to text explicitly via
	// `$4::TEXT` or pass seconds pre-formatted — we use the latter for
	// clarity.
	ttlSpec := fmt.Sprintf("%d seconds", int(ttl.Seconds()))
	_, err := d.db.Pool.Exec(ctx, `
		INSERT INTO queue_dedupe_keys (queue_name, key, job_id, expires_at)
		VALUES ($1, $2, $3, NOW() + $4::INTERVAL)
		ON CONFLICT (queue_name, key) DO NOTHING
	`, queue, key, jobID, ttlSpec)
	if err != nil {
		return err
	}
	// ON CONFLICT hides whether insert actually happened — check existence.
	existing, err := d.ExistingJobID(ctx, queue, key)
	if err != nil {
		return err
	}
	if existing != jobID {
		return ErrDuplicate
	}
	return nil
}

// ExistingJobID returns the jobID previously claimed for this key, or ""
// if none.
func (d *Dedupe) ExistingJobID(ctx context.Context, queue, key string) (string, error) {
	if key == "" {
		return "", nil
	}
	var jobID string
	err := d.db.Pool.QueryRow(ctx,
		`SELECT job_id FROM queue_dedupe_keys WHERE queue_name=$1 AND key=$2`,
		queue, key,
	).Scan(&jobID)
	if err != nil {
		// pgx returns ErrNoRows; surface as empty string, not an error
		return "", nil
	}
	return jobID, nil
}

// Reap deletes expired dedupe rows. Safe to call on a timer from the
// janitor.
func (d *Dedupe) Reap(ctx context.Context) (int64, error) {
	tag, err := d.db.Pool.Exec(ctx, `DELETE FROM queue_dedupe_keys WHERE expires_at < NOW()`)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}
