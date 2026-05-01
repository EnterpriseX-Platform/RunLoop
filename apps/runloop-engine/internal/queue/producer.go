package queue

import (
	"context"
	"fmt"
	"time"
)

// Producer is the entry point for application code that wants to enqueue a
// job. It validates the request, handles idempotency, and dispatches to
// the right backend based on the queue's configuration.
type Producer struct {
	mgr *Manager
}

func NewProducer(mgr *Manager) *Producer {
	return &Producer{mgr: mgr}
}

// EnqueueResult is returned to the caller so they can tell whether the job
// was created fresh or was a dedupe hit.
type EnqueueResult struct {
	JobID     string
	Duplicate bool // true if the idempotency key matched an existing job
}

// Enqueue adds a job to the named queue. Returns (result, error).
//
// If `req.IdempotencyKey` is non-empty, duplicate submissions return the
// existing job's ID with Duplicate=true — the caller may treat this as
// success.
func (p *Producer) Enqueue(ctx context.Context, queueName string, req EnqueueRequest) (*EnqueueResult, error) {
	def, err := p.mgr.GetQueue(ctx, queueName)
	if err != nil {
		return nil, fmt.Errorf("queue %q: %w", queueName, err)
	}
	if !def.Enabled {
		return nil, fmt.Errorf("queue %q is disabled", queueName)
	}

	backend, err := p.mgr.getBackend(def)
	if err != nil {
		return nil, err
	}

	// PG backend's UNIQUE constraint dedupes transactionally; other backends
	// need the shared dedupe ledger.
	if def.Backend != "postgres" && req.IdempotencyKey != "" {
		if existing, _ := p.mgr.dedupe.ExistingJobID(ctx, queueName, req.IdempotencyKey); existing != "" {
			return &EnqueueResult{JobID: existing, Duplicate: true}, nil
		}
	}

	jobID, err := backend.Enqueue(ctx, def, req)
	if err != nil {
		return nil, err
	}

	if def.Backend != "postgres" && req.IdempotencyKey != "" {
		ttl := time.Duration(def.VisibilitySec*def.MaxAttempts+60) * time.Second
		if claimErr := p.mgr.dedupe.Claim(ctx, queueName, req.IdempotencyKey, jobID, ttl); claimErr == ErrDuplicate {
			// Lost the race — another producer claimed first. Return their ID.
			if existing, _ := p.mgr.dedupe.ExistingJobID(ctx, queueName, req.IdempotencyKey); existing != "" {
				return &EnqueueResult{JobID: existing, Duplicate: true}, nil
			}
		}
	}

	return &EnqueueResult{JobID: jobID}, nil
}
