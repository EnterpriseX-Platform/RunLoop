package maintenance

import (
	"context"
	"sync"
	"time"

	"github.com/runloop/runloop-engine/internal/db"
	"github.com/rs/zerolog/log"
)

// RetentionJob periodically prunes old execution rows so the database doesn't
// grow unbounded. The retention window is per-project (projects.execution_retention_days).
type RetentionJob struct {
	db              *db.Postgres
	defaultDays     int
	tickInterval    time.Duration
	stop            chan struct{}
	stopOnce        sync.Once
	started         bool
	startMu         sync.Mutex
}

// NewRetentionJob creates a retention job. `defaultDays` is used when a project
// has no custom retention setting. `tickInterval` controls how often the job runs
// (24h in production; smaller for tests).
func NewRetentionJob(database *db.Postgres, defaultDays int, tickInterval time.Duration) *RetentionJob {
	if defaultDays <= 0 {
		defaultDays = 90
	}
	if tickInterval <= 0 {
		tickInterval = 24 * time.Hour
	}
	return &RetentionJob{
		db:           database,
		defaultDays:  defaultDays,
		tickInterval: tickInterval,
		stop:         make(chan struct{}),
	}
}

// Start launches the retention loop in a goroutine. Safe to call multiple
// times — subsequent calls are no-ops if already running.
func (r *RetentionJob) Start(ctx context.Context) {
	r.startMu.Lock()
	if r.started {
		r.startMu.Unlock()
		return
	}
	r.started = true
	// Reset the stop channel in case a previous Stop() closed it.
	r.stop = make(chan struct{})
	r.stopOnce = sync.Once{}
	r.startMu.Unlock()

	log.Info().
		Int("default_days", r.defaultDays).
		Dur("tick_interval", r.tickInterval).
		Msg("Retention job started")

	go func() {
		// Run once at startup, then on the configured interval.
		r.runOnce(ctx)
		ticker := time.NewTicker(r.tickInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-r.stop:
				return
			case <-ticker.C:
				r.runOnce(ctx)
			}
		}
	}()
}

// Stop signals the loop to exit. Safe to call multiple times.
func (r *RetentionJob) Stop() {
	r.stopOnce.Do(func() {
		r.startMu.Lock()
		if r.started && r.stop != nil {
			close(r.stop)
		}
		r.started = false
		r.startMu.Unlock()
	})
}

// runOnce performs one retention sweep. It tries to read per-project settings
// if the column exists; otherwise it falls back to the default retention window.
func (r *RetentionJob) runOnce(ctx context.Context) {
	start := time.Now()

	// Attempt per-project retention first. If the column doesn't exist (legacy
	// DBs), fall back to a single global sweep.
	rows, err := r.db.Pool.Query(ctx, `
		SELECT id, COALESCE(execution_retention_days, $1) AS days
		FROM projects
		WHERE deleted_at IS NULL OR deleted_at IS NOT NULL
	`, r.defaultDays)
	if err != nil {
		// Column probably missing — fallback to global sweep.
		r.globalSweep(ctx)
		return
	}
	defer rows.Close()

	total := int64(0)
	for rows.Next() {
		var projectID string
		var days int
		if err := rows.Scan(&projectID, &days); err != nil {
			continue
		}
		if days <= 0 {
			days = r.defaultDays
		}
		cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour)
		tag, err := r.db.Pool.Exec(ctx, `
			DELETE FROM executions
			WHERE project_id = $1
			  AND started_at < $2
			  AND status IN ('SUCCESS', 'FAILED', 'CANCELLED', 'TIMEOUT')
		`, projectID, cutoff)
		if err != nil {
			log.Error().Err(err).Str("project_id", projectID).Msg("Retention sweep failed for project")
			continue
		}
		total += tag.RowsAffected()
	}

	log.Info().
		Int64("deleted", total).
		Dur("duration", time.Since(start)).
		Msg("Retention sweep completed")
}

// globalSweep deletes old executions across all projects using the default window.
func (r *RetentionJob) globalSweep(ctx context.Context) {
	cutoff := time.Now().Add(-time.Duration(r.defaultDays) * 24 * time.Hour)
	tag, err := r.db.Pool.Exec(ctx, `
		DELETE FROM executions
		WHERE started_at < $1
		  AND status IN ('SUCCESS', 'FAILED', 'CANCELLED', 'TIMEOUT')
	`, cutoff)
	if err != nil {
		log.Error().Err(err).Msg("Global retention sweep failed")
		return
	}
	log.Info().Int64("deleted", tag.RowsAffected()).Msg("Global retention sweep completed")
}
