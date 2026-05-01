package queue

import (
	"context"
	"errors"
	"io"
	"sync"

	"github.com/runloop/runloop-engine/internal/worker"
)

// MemoryQueue is a channel-backed queue. This is the original RunLoop
// behavior — zero external dependencies, but tasks are lost on restart
// and don't coordinate across multiple engine processes. Use Postgres or
// Redis for anything beyond single-instance dev/local.
type MemoryQueue struct {
	ch     chan *worker.Task
	mu     sync.Mutex
	closed bool
}

// NewMemoryQueue allocates an in-memory queue with the given buffer capacity.
// Push returns ErrQueueFull when the buffer is full.
func NewMemoryQueue(capacity int) *MemoryQueue {
	if capacity <= 0 {
		capacity = 100
	}
	return &MemoryQueue{ch: make(chan *worker.Task, capacity)}
}

// ErrQueueFull is returned from Push when the buffer has no space.
var ErrQueueFull = errors.New("queue: buffer full")

func (q *MemoryQueue) Push(ctx context.Context, task *worker.Task) error {
	q.mu.Lock()
	if q.closed {
		q.mu.Unlock()
		return io.EOF
	}
	q.mu.Unlock()

	select {
	case q.ch <- task:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	default:
		// Non-blocking: prefer fast failure over silently backing up.
		return ErrQueueFull
	}
}

func (q *MemoryQueue) Pop(ctx context.Context) (*worker.Task, error) {
	select {
	case task, ok := <-q.ch:
		if !ok {
			return nil, io.EOF
		}
		return task, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (q *MemoryQueue) Len(_ context.Context) (int, error) {
	return len(q.ch), nil
}

func (q *MemoryQueue) Close() error {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.closed {
		return nil
	}
	q.closed = true
	close(q.ch)
	return nil
}
