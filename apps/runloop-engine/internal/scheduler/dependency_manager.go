package scheduler

import (
	"context"
	"fmt"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/runloop/runloop-engine/internal/db"
	"github.com/runloop/runloop-engine/internal/models"
)

// DependencyManager handles cross-scheduler dependency checking and triggering.
// It implements Control-M style scheduler chaining where the completion of one
// scheduler's execution can trigger dependent schedulers.
type DependencyManager struct {
	db      *db.Postgres
	manager *Manager
}

// NewDependencyManager creates a new DependencyManager
func NewDependencyManager(database *db.Postgres, manager *Manager) *DependencyManager {
	return &DependencyManager{
		db:      database,
		manager: manager,
	}
}

// CheckAndTriggerSuccessors is called after an execution completes.
// It finds all schedulers that depend on completedSchedulerID, checks whether
// their dependency conditions are met, and triggers them if all prerequisites
// are satisfied.
func (dm *DependencyManager) CheckAndTriggerSuccessors(ctx context.Context, completedSchedulerID string, executionStatus string) error {
	log.Debug().
		Str("completed_scheduler_id", completedSchedulerID).
		Str("execution_status", executionStatus).
		Msg("Checking successor dependencies")

	// Find all schedulers that depend on the completed scheduler
	query := `
		SELECT sd.scheduler_id, sd.condition, s.name
		FROM scheduler_dependencies sd
		JOIN schedulers s ON sd.scheduler_id = s.id
		WHERE sd.depends_on_scheduler_id = $1
		  AND s.deleted_at IS NULL
	`

	rows, err := dm.db.Pool.Query(ctx, query, completedSchedulerID)
	if err != nil {
		return fmt.Errorf("failed to query successor dependencies: %w", err)
	}
	defer rows.Close()

	type successor struct {
		schedulerID string
		condition   string
		name        string
	}

	var successors []successor
	for rows.Next() {
		var s successor
		if err := rows.Scan(&s.schedulerID, &s.condition, &s.name); err != nil {
			log.Error().Err(err).Msg("Failed to scan successor dependency")
			continue
		}
		successors = append(successors, s)
	}

	if len(successors) == 0 {
		log.Debug().
			Str("completed_scheduler_id", completedSchedulerID).
			Msg("No successor dependencies found")
		return nil
	}

	log.Info().
		Str("completed_scheduler_id", completedSchedulerID).
		Int("successor_count", len(successors)).
		Msg("Found successor dependencies to evaluate")

	for _, succ := range successors {
		// Check if the condition matches the execution status
		if !dm.conditionMatches(succ.condition, executionStatus) {
			log.Debug().
				Str("successor_id", succ.schedulerID).
				Str("condition", succ.condition).
				Str("execution_status", executionStatus).
				Msg("Condition not met for successor, skipping")
			continue
		}

		// Check if ALL prerequisites of the successor are met
		allMet, err := dm.AreAllPrerequisitesMet(ctx, succ.schedulerID)
		if err != nil {
			log.Error().Err(err).
				Str("successor_id", succ.schedulerID).
				Msg("Failed to check prerequisites")
			continue
		}

		if !allMet {
			log.Debug().
				Str("successor_id", succ.schedulerID).
				Str("name", succ.name).
				Msg("Not all prerequisites met, skipping trigger")
			continue
		}

		// All prerequisites met — trigger the dependent scheduler
		log.Info().
			Str("successor_id", succ.schedulerID).
			Str("name", succ.name).
			Str("triggered_by_scheduler", completedSchedulerID).
			Msg("All prerequisites met, triggering dependent scheduler")

		_, err = dm.manager.TriggerJob(ctx, succ.schedulerID, models.JSONMap{
			"triggeredBy":     "dependency",
			"sourceScheduler": completedSchedulerID,
		}, nil)
		if err != nil {
			log.Error().Err(err).
				Str("successor_id", succ.schedulerID).
				Msg("Failed to trigger dependent scheduler")
			continue
		}
	}

	return nil
}

// AreAllPrerequisitesMet checks if all dependencies of a scheduler have been satisfied.
// For each dependency, it checks whether the depends_on scheduler has a recent successful
// execution (within the last 24 hours) that matches the required condition.
func (dm *DependencyManager) AreAllPrerequisitesMet(ctx context.Context, schedulerID string) (bool, error) {
	// Get all dependencies of this scheduler
	query := `
		SELECT sd.depends_on_scheduler_id, sd.condition
		FROM scheduler_dependencies sd
		WHERE sd.scheduler_id = $1
	`

	rows, err := dm.db.Pool.Query(ctx, query, schedulerID)
	if err != nil {
		return false, fmt.Errorf("failed to query dependencies: %w", err)
	}
	defer rows.Close()

	type dependency struct {
		dependsOnID string
		condition   string
	}

	var deps []dependency
	for rows.Next() {
		var d dependency
		if err := rows.Scan(&d.dependsOnID, &d.condition); err != nil {
			return false, fmt.Errorf("failed to scan dependency: %w", err)
		}
		deps = append(deps, d)
	}

	if len(deps) == 0 {
		// No dependencies means all prerequisites are trivially met
		return true, nil
	}

	// Check each dependency
	cutoff := time.Now().Add(-24 * time.Hour)

	for _, dep := range deps {
		met, err := dm.isPrerequisiteMet(ctx, dep.dependsOnID, dep.condition, cutoff)
		if err != nil {
			return false, err
		}
		if !met {
			return false, nil
		}
	}

	return true, nil
}

// isPrerequisiteMet checks if a single prerequisite has been satisfied by looking
// at the most recent execution of the depends_on scheduler within the cutoff window.
func (dm *DependencyManager) isPrerequisiteMet(ctx context.Context, dependsOnSchedulerID string, condition string, cutoff time.Time) (bool, error) {
	query := `
		SELECT status FROM executions
		WHERE scheduler_id = $1 AND started_at >= $2
		ORDER BY started_at DESC
		LIMIT 1
	`

	var lastStatus string
	err := dm.db.Pool.QueryRow(ctx, query, dependsOnSchedulerID, cutoff).Scan(&lastStatus)
	if err != nil {
		// No recent execution found — prerequisite not met
		return false, nil
	}

	return dm.conditionMatches(condition, lastStatus), nil
}

// conditionMatches checks if an execution status satisfies a dependency condition.
func (dm *DependencyManager) conditionMatches(condition string, executionStatus string) bool {
	switch condition {
	case "ON_SUCCESS":
		return executionStatus == string(models.ExecutionStatusSuccess)
	case "ON_FAILURE":
		return executionStatus == string(models.ExecutionStatusFailed)
	case "ON_COMPLETION":
		// Matches any terminal status
		return executionStatus == string(models.ExecutionStatusSuccess) ||
			executionStatus == string(models.ExecutionStatusFailed) ||
			executionStatus == string(models.ExecutionStatusCancelled) ||
			executionStatus == string(models.ExecutionStatusTimeout)
	default:
		log.Warn().Str("condition", condition).Msg("Unknown dependency condition")
		return false
	}
}
