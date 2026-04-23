// Package queue implements a durable job queue with pluggable backends.
//
// The design splits responsibilities:
//
//   - The abstraction layer (manager, producer, dedupe, reaper) owns the
//     cross-cutting policy: retry with exponential backoff, DLQ routing,
//     idempotency, concurrency caps, and metrics. This code is shared by
//     every backend.
//
//   - Backends (postgres, redis, rabbitmq, kafka) own the delivery mechanism:
//     how a message is stored, how a worker leases it, and how ack/nack
//     translate to the wire protocol. Each backend implements Backend below.
//
// Adding a new backend means implementing Backend and registering it in
// QueueManager.newBackend. No other part of the system should need to change.
package queue

import (
	"context"
	"time"
)

// Message is a single unit of work delivered from a Backend to the manager.
// It is backend-agnostic: the Handle opaquely identifies where the message
// lives for later Ack/Nack/DeadLetter calls.
type Message struct {
	// Handle identifies this message within the backend. Opaque to callers —
	// passed back to Ack/Nack/DeadLetter so the backend can locate it.
	Handle string

	// ID is a stable, backend-agnostic identifier (matches job_queue_items.id
	// for the PG backend; generated on enqueue for others).
	ID string

	// QueueName is the queue this message belongs to.
	QueueName string

	// Payload is the application-level job data. JSON-encodable.
	Payload map[string]interface{}

	// Attempts is the number of times this message has been delivered,
	// starting at 1 for the first delivery. Incremented by the backend
	// before each Deliver.
	Attempts int

	// IdempotencyKey, if present, was provided by the producer to dedupe.
	IdempotencyKey string

	// EnqueuedAt is when the job was first produced.
	EnqueuedAt time.Time
}

// Handler processes a single message. It must be idempotent (since we
// guarantee at-least-once delivery). Returning nil means success; returning
// an error triggers retry policy.
type Handler func(ctx context.Context, msg *Message) error

// Backend is the transport-specific implementation. Each backend stores
// messages somewhere and delivers them to workers on demand.
//
// Contract:
//   - Enqueue adds a single message. Idempotency is handled above this layer;
//     backends may assume the message should be stored unconditionally.
//   - Consume runs a long-lived loop that invokes the handler for each
//     delivered message. Must honor ctx.Done. Returns only on fatal error or
//     ctx cancellation.
//   - Ack permanently removes/commits the message.
//   - Nack requeues the message for delivery after `requeueAfter`. The
//     backend is responsible for the delay mechanism (visible_after column,
//     XCLAIM idle, TTL queue, topic chain, etc.).
//   - DeadLetter moves the message to a permanent failure store. The DLQ
//     entry should record the reason for later inspection.
type Backend interface {
	Name() string
	Enqueue(ctx context.Context, queue *QueueDef, job EnqueueRequest) (jobID string, err error)
	Consume(ctx context.Context, queue *QueueDef, handler Handler) error
	Ack(ctx context.Context, queue *QueueDef, handle string) error
	Nack(ctx context.Context, queue *QueueDef, handle string, requeueAfter time.Duration, lastError string) error
	DeadLetter(ctx context.Context, queue *QueueDef, handle string, reason string) error
	Ping(ctx context.Context, cfg map[string]interface{}) error
	Close() error
}

// EnqueueRequest is what a producer submits; the manager normalizes it
// (dedupe, validation) before handing to the backend.
type EnqueueRequest struct {
	Payload        map[string]interface{}
	IdempotencyKey string
	Priority       int
}

// QueueDef is the runtime view of a `job_queues` row used by the manager.
// Backends receive this so they can access their own config and apply
// per-queue policy (concurrency, max attempts, etc.).
type QueueDef struct {
	Name           string
	ProjectID      string
	FlowID         string
	Backend        string
	BackendConfig  map[string]interface{}
	Concurrency    int
	MaxAttempts    int
	VisibilitySec  int
	BackoffInitMs  int
	BackoffMaxMs   int
	BackoffMult    float64
	Enabled        bool
}
