package queue

import (
	"context"
	"fmt"
	"strings"

	"github.com/runloop/runloop-engine/internal/db"
)

// Config holds queue-driver selection. Read from env by the caller, not here.
type Config struct {
	Driver     string // "memory" | "postgres" | "redis"
	Capacity   int    // memory queue buffer size (default 100)
	RedisURL   string // required when Driver=="redis"
	RedisKey   string // optional list name, default "runloop:taskqueue"
}

// New constructs the queue driver selected by cfg.Driver. Falls back to
// memory when the driver name is unrecognized so dev setups still work.
func New(ctx context.Context, cfg Config, database *db.Postgres) (Queue, error) {
	switch Driver(strings.ToLower(cfg.Driver)) {
	case DriverPostgres:
		return NewPostgresQueue(ctx, database, 0) // default poll interval
	case DriverRedis:
		if cfg.RedisURL == "" {
			return nil, fmt.Errorf("queue: REDIS_URL required when QUEUE_DRIVER=redis")
		}
		return NewRedisQueue(ctx, cfg.RedisURL, cfg.RedisKey)
	case DriverMemory, "":
		return NewMemoryQueue(cfg.Capacity), nil
	default:
		return nil, fmt.Errorf("queue: unknown driver %q (expected memory|postgres|redis)", cfg.Driver)
	}
}
