package queue

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/runloop/runloop-engine/internal/worker"
)

// RedisQueue uses a Redis list as a FIFO queue. LPUSH for enqueue, BRPOP for
// blocking dequeue. This is the fastest driver and scales to many engine
// instances easily, but requires Redis infrastructure.
//
// Semantics: at-most-once delivery (message is removed atomically on BRPOP).
// For at-least-once, use PostgresQueue instead.
type RedisQueue struct {
	client *redis.Client
	key    string
	mu     sync.Mutex
	closed bool
}

// NewRedisQueue connects to Redis with the given URL (e.g.
// `redis://localhost:6379/0`). `key` is the list name (default
// "runloop:taskqueue").
func NewRedisQueue(ctx context.Context, url, key string) (*RedisQueue, error) {
	if key == "" {
		key = "runloop:taskqueue"
	}
	opt, err := redis.ParseURL(url)
	if err != nil {
		return nil, err
	}
	client := redis.NewClient(opt)
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, err
	}
	return &RedisQueue{client: client, key: key}, nil
}

func (q *RedisQueue) Push(ctx context.Context, task *worker.Task) error {
	if q.isClosed() {
		return io.EOF
	}
	payload, err := json.Marshal(task)
	if err != nil {
		return err
	}
	return q.client.LPush(ctx, q.key, payload).Err()
}

func (q *RedisQueue) Pop(ctx context.Context) (*worker.Task, error) {
	if q.isClosed() {
		return nil, io.EOF
	}
	// BRPOP blocks until a value is available or timeout elapses. We use a
	// short timeout so we can detect Close() / context cancellation quickly.
	for {
		if q.isClosed() {
			return nil, io.EOF
		}
		res, err := q.client.BRPop(ctx, 2*time.Second, q.key).Result()
		if err != nil {
			if errors.Is(err, redis.Nil) {
				// Timeout — check ctx/close and retry.
				select {
				case <-ctx.Done():
					return nil, ctx.Err()
				default:
					continue
				}
			}
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return nil, err
			}
			return nil, err
		}
		// res[0] is the list key, res[1] is the payload.
		if len(res) < 2 {
			continue
		}
		var task worker.Task
		if err := json.Unmarshal([]byte(res[1]), &task); err != nil {
			continue // malformed — skip
		}
		return &task, nil
	}
}

func (q *RedisQueue) Len(ctx context.Context) (int, error) {
	n, err := q.client.LLen(ctx, q.key).Result()
	return int(n), err
}

func (q *RedisQueue) Close() error {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.closed {
		return nil
	}
	q.closed = true
	return q.client.Close()
}

func (q *RedisQueue) isClosed() bool {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.closed
}
