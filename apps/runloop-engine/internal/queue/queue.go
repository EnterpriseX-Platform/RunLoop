// Package queue provides a pluggable task queue abstraction so RunLoop can
// run on in-memory channels (dev), a Postgres-backed queue (single-DB
// deployments), or Redis (horizontal scale across many engine replicas).
//
// The interface is intentionally minimal:
//
//	Push(ctx, task)    → enqueue one task
//	Pop(ctx)           → blocking dequeue, returns when a task is available
//	                     or the context is cancelled
//	Close()            → release resources
//	Len()              → best-effort queue depth (for /stats)
//
// Implementations:
//   - MemoryQueue   — thin wrapper around a Go channel (default)
//   - PostgresQueue — uses `SELECT … FOR UPDATE SKIP LOCKED` so multiple
//                     engine instances can safely pull from the same queue
//   - RedisQueue    — LPUSH/BRPOP on a Redis list (fastest for high volume)
package queue

import (
	"context"

	"github.com/runloop/runloop-engine/internal/worker"
)

// Queue is a FIFO-ish task queue. Implementations should be safe for concurrent
// Push/Pop from many goroutines.
type Queue interface {
	// Push enqueues a task. Non-blocking; returns an error if the queue is
	// full (memory) or the backend is unreachable.
	Push(ctx context.Context, task *worker.Task) error

	// Pop blocks until a task is available, the context is cancelled, or the
	// queue is closed. Returns (nil, ctx.Err()) on cancellation and
	// (nil, io.EOF) when the queue is closed.
	Pop(ctx context.Context) (*worker.Task, error)

	// Len returns the best-effort current queue depth. May be stale by the
	// time the caller reads it.
	Len(ctx context.Context) (int, error)

	// Close releases resources. Safe to call multiple times.
	Close() error
}

// Driver identifies a queue backend. Add a new driver constant when adding a
// new implementation and wire it in the factory.
type Driver string

const (
	DriverMemory   Driver = "memory"
	DriverPostgres Driver = "postgres"
	DriverRedis    Driver = "redis"
)
