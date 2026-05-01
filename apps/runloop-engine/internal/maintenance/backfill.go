package maintenance

import (
	"context"
	"time"

	"github.com/robfig/cron/v3"
	"github.com/runloop/runloop-engine/internal/db"
	"github.com/runloop/runloop-engine/internal/models"
	"github.com/rs/zerolog/log"
)

// TriggerFn is invoked to actually run a backfill execution. It matches the
// signature of scheduler.Manager.TriggerJob.
type TriggerFn func(ctx context.Context, schedulerID string, input models.JSONMap, ipAddress *string) (*models.Execution, error)

// BackfillRunner catches up schedulers whose cron run was missed because the
// engine was offline. On startup, it scans active SCHEDULE schedulers, compares
// `last_run_at` to what the cron should have fired, and optionally triggers
// catchup runs.
type BackfillRunner struct {
	db        *db.Postgres
	trigger   TriggerFn
	maxPerJob int
}

// NewBackfillRunner creates a backfill runner. `maxPerJob` caps how many
// catchup runs a single scheduler can get (default 5) to avoid storms.
func NewBackfillRunner(database *db.Postgres, trigger TriggerFn, maxPerJob int) *BackfillRunner {
	if maxPerJob <= 0 {
		maxPerJob = 5
	}
	return &BackfillRunner{db: database, trigger: trigger, maxPerJob: maxPerJob}
}

// Run scans and triggers backfills in one shot (intended to be called at startup).
func (b *BackfillRunner) Run(ctx context.Context) {
	rows, err := b.db.Pool.Query(ctx, `
		SELECT id, schedule, timezone, last_run_at
		FROM schedulers
		WHERE status = 'ACTIVE'
		  AND trigger_type = 'SCHEDULE'
		  AND schedule IS NOT NULL
		  AND (deleted_at IS NULL)
	`)
	if err != nil {
		log.Error().Err(err).Msg("Backfill scan failed")
		return
	}
	defer rows.Close()

	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor)
	now := time.Now()
	missed := 0
	triggered := 0

	for rows.Next() {
		var id, schedule string
		var tz *string
		var lastRunAt *time.Time
		if err := rows.Scan(&id, &schedule, &tz, &lastRunAt); err != nil {
			continue
		}
		sched, err := parser.Parse(schedule)
		if err != nil {
			continue
		}

		// Start from last_run_at (or 24h ago if never ran)
		start := now.Add(-24 * time.Hour)
		if lastRunAt != nil && lastRunAt.After(start) {
			start = *lastRunAt
		}

		// Walk forward through scheduled times until we reach now, but cap count
		count := 0
		cur := sched.Next(start)
		for cur.Before(now) && count < b.maxPerJob {
			if _, terr := b.trigger(ctx, id, models.JSONMap{"catchup": true, "scheduled_time": cur.Format(time.RFC3339)}, nil); terr != nil {
				log.Warn().Err(terr).Str("scheduler_id", id).Time("scheduled_time", cur).Msg("Backfill trigger skipped")
				break
			}
			log.Info().Str("scheduler_id", id).Time("scheduled_time", cur).Msg("Backfill triggered")
			count++
			triggered++
			cur = sched.Next(cur)
		}
		if count > 0 {
			missed++
		}
	}

	log.Info().Int("schedulers_missed", missed).Int("triggered", triggered).Msg("Backfill scan complete")
}
