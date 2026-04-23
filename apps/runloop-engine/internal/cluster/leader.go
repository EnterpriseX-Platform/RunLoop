package cluster

import (
	"context"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/runloop/runloop-engine/internal/db"
	"github.com/rs/zerolog/log"
)

// Leader implements a very simple leader election using Postgres session-scoped
// advisory locks. Session-scoped means the lock is bound to a specific DB
// connection; if that connection dies the lock is released automatically.
//
// Because pgxpool hands out arbitrary connections, we *must* pin one
// connection for the leader's lifetime — otherwise the lock-check query may
// run on a different connection than the lock-acquire query, making
// `pg_try_advisory_lock` return false (lock is held by a *different* session).
//
// The simplest robust approach: `Acquire()` a connection when trying to
// acquire the lock, keep it for as long as we're leader, and `Release()` it
// when we lose leadership or shut down.
type Leader struct {
	db       *db.Postgres
	lockKey  int64
	isLeader bool
	mu       sync.RWMutex
	onBecome func(ctx context.Context)
	onLose   func()
	stop     chan struct{}
	stopOnce sync.Once

	// held is the pinned connection that holds the advisory lock.
	held *pgxpool.Conn
}

// NewLeader creates a leader with a unique lock key.
func NewLeader(database *db.Postgres, lockKey int64) *Leader {
	return &Leader{
		db:      database,
		lockKey: lockKey,
		stop:    make(chan struct{}),
	}
}

func (l *Leader) OnBecomeLeader(fn func(ctx context.Context)) { l.onBecome = fn }
func (l *Leader) OnLoseLeader(fn func())                       { l.onLose = fn }

func (l *Leader) IsLeader() bool {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.isLeader
}

// Run starts the leader-election loop.
func (l *Leader) Run(ctx context.Context) { go l.loop(ctx) }

// Stop signals the loop to exit and releases the lock connection.
func (l *Leader) Stop() {
	l.stopOnce.Do(func() {
		close(l.stop)
		l.release()
	})
}

func (l *Leader) loop(ctx context.Context) {
	interval := 10 * time.Second
	for {
		select {
		case <-ctx.Done():
			l.release()
			return
		case <-l.stop:
			return
		default:
		}

		if !l.IsLeader() {
			if l.tryAcquire(ctx) {
				l.mu.Lock()
				l.isLeader = true
				l.mu.Unlock()
				log.Info().Int64("lock_key", l.lockKey).Msg("Became leader")
				if l.onBecome != nil {
					go l.onBecome(ctx)
				}
			}
		} else {
			// Ping the pinned connection to verify it's still alive.
			if l.held == nil || l.held.Ping(ctx) != nil {
				l.mu.Lock()
				l.isLeader = false
				l.mu.Unlock()
				log.Warn().Int64("lock_key", l.lockKey).Msg("Lost leader lock")
				l.release()
				if l.onLose != nil {
					l.onLose()
				}
			}
		}

		select {
		case <-ctx.Done():
			l.release()
			return
		case <-l.stop:
			return
		case <-time.After(interval):
		}
	}
}

// tryAcquire pins a connection from the pool and calls
// `pg_try_advisory_lock` on it. If the lock is acquired, we keep the
// connection open for the lifetime of the leadership; releasing it (or
// connection loss) releases the lock.
func (l *Leader) tryAcquire(ctx context.Context) bool {
	conn, err := l.db.Pool.Acquire(ctx)
	if err != nil {
		log.Debug().Err(err).Msg("Leader: failed to acquire pooled conn")
		return false
	}
	var ok bool
	if err := conn.QueryRow(ctx, `SELECT pg_try_advisory_lock($1)`, l.lockKey).Scan(&ok); err != nil {
		conn.Release()
		log.Debug().Err(err).Msg("Leader: advisory-lock query failed")
		return false
	}
	if !ok {
		// Another instance holds it — return the conn to the pool.
		conn.Release()
		return false
	}
	l.held = conn
	return true
}

// release unlocks and returns the pinned connection to the pool.
func (l *Leader) release() {
	if l.held == nil {
		return
	}
	// Best-effort unlock; even if this fails, releasing the connection back
	// to the pool makes it available for re-use. The lock auto-releases when
	// the backend session terminates.
	_, _ = l.held.Exec(context.Background(), `SELECT pg_advisory_unlock($1)`, l.lockKey)
	l.held.Release()
	l.held = nil
}
