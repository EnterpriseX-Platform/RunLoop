package api

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
	"github.com/runloop/runloop-engine/internal/idgen"
)

// SchedulerDependency represents a dependency between two schedulers
type SchedulerDependency struct {
	ID                   string    `json:"id"`
	SchedulerID          string    `json:"schedulerId"`
	DependsOnSchedulerID string    `json:"dependsOnSchedulerId"`
	Condition            string    `json:"condition"` // ON_SUCCESS, ON_FAILURE, ON_COMPLETION
	CreatedAt            time.Time `json:"createdAt"`
	// Joined field
	SchedulerName string `json:"schedulerName"`
}

// AddDependencyRequest represents the request body for adding a dependency
type AddDependencyRequest struct {
	DependsOnSchedulerID string `json:"dependsOnSchedulerId"`
	Condition            string `json:"condition"` // ON_SUCCESS, ON_FAILURE, ON_COMPLETION
}

// ListDependencies returns both predecessors and successors for a scheduler
func (h *Handler) ListDependencies(c *fiber.Ctx) error {
	ctx := context.Background()

	schedulerID := c.Params("id")
	if schedulerID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid scheduler ID",
		})
	}

	// Query predecessors: schedulers that this scheduler depends on
	predQuery := `
		SELECT sd.id, sd.scheduler_id, sd.depends_on_scheduler_id, sd.condition, sd.created_at,
		       s.name
		FROM scheduler_dependencies sd
		JOIN schedulers s ON sd.depends_on_scheduler_id = s.id
		WHERE sd.scheduler_id = $1
		ORDER BY sd.created_at
	`

	predRows, err := h.db.Pool.Query(ctx, predQuery, schedulerID)
	if err != nil {
		log.Error().Err(err).Str("scheduler_id", schedulerID).Msg("Failed to query predecessor dependencies")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch dependencies",
		})
	}
	defer predRows.Close()

	var predecessors []SchedulerDependency
	for predRows.Next() {
		var dep SchedulerDependency
		err := predRows.Scan(
			&dep.ID, &dep.SchedulerID, &dep.DependsOnSchedulerID, &dep.Condition, &dep.CreatedAt,
			&dep.SchedulerName,
		)
		if err != nil {
			log.Error().Err(err).Msg("Failed to scan predecessor dependency")
			continue
		}
		predecessors = append(predecessors, dep)
	}

	// Query successors: schedulers that depend on this scheduler
	succQuery := `
		SELECT sd.id, sd.scheduler_id, sd.depends_on_scheduler_id, sd.condition, sd.created_at,
		       s.name
		FROM scheduler_dependencies sd
		JOIN schedulers s ON sd.scheduler_id = s.id
		WHERE sd.depends_on_scheduler_id = $1
		ORDER BY sd.created_at
	`

	succRows, err := h.db.Pool.Query(ctx, succQuery, schedulerID)
	if err != nil {
		log.Error().Err(err).Str("scheduler_id", schedulerID).Msg("Failed to query successor dependencies")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch dependencies",
		})
	}
	defer succRows.Close()

	var successors []SchedulerDependency
	for succRows.Next() {
		var dep SchedulerDependency
		err := succRows.Scan(
			&dep.ID, &dep.SchedulerID, &dep.DependsOnSchedulerID, &dep.Condition, &dep.CreatedAt,
			&dep.SchedulerName,
		)
		if err != nil {
			log.Error().Err(err).Msg("Failed to scan successor dependency")
			continue
		}
		successors = append(successors, dep)
	}

	return c.JSON(fiber.Map{
		"data": fiber.Map{
			"predecessors": predecessors,
			"successors":   successors,
		},
	})
}

// AddDependency creates a dependency between two schedulers
func (h *Handler) AddDependency(c *fiber.Ctx) error {
	ctx := context.Background()

	schedulerID := c.Params("id")
	if schedulerID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid scheduler ID",
		})
	}

	var req AddDependencyRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if req.DependsOnSchedulerID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "dependsOnSchedulerId is required",
		})
	}

	// Default condition to ON_SUCCESS
	if req.Condition == "" {
		req.Condition = "ON_SUCCESS"
	}

	// Validate condition value
	validConditions := map[string]bool{
		"ON_SUCCESS":    true,
		"ON_FAILURE":    true,
		"ON_COMPLETION": true,
	}
	if !validConditions[req.Condition] {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid condition. Must be ON_SUCCESS, ON_FAILURE, or ON_COMPLETION",
		})
	}

	// Prevent self-dependency
	if schedulerID == req.DependsOnSchedulerID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "A scheduler cannot depend on itself",
		})
	}

	// Validate both schedulers exist
	var schedulerExists bool
	err := h.db.Pool.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM schedulers WHERE id = $1 AND deleted_at IS NULL)",
		schedulerID,
	).Scan(&schedulerExists)
	if err != nil || !schedulerExists {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Scheduler not found",
		})
	}

	var dependsOnExists bool
	err = h.db.Pool.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM schedulers WHERE id = $1 AND deleted_at IS NULL)",
		req.DependsOnSchedulerID,
	).Scan(&dependsOnExists)
	if err != nil || !dependsOnExists {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Dependency scheduler not found",
		})
	}

	// Check for duplicate dependency
	var duplicateExists bool
	err = h.db.Pool.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM scheduler_dependencies WHERE scheduler_id = $1 AND depends_on_scheduler_id = $2)",
		schedulerID, req.DependsOnSchedulerID,
	).Scan(&duplicateExists)
	if err == nil && duplicateExists {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "Dependency already exists",
		})
	}

	// Check for circular dependency
	hasCycle, err := h.detectCycle(ctx, schedulerID, req.DependsOnSchedulerID)
	if err != nil {
		log.Error().Err(err).Msg("Failed to check for circular dependency")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to validate dependency",
		})
	}
	if hasCycle {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Circular dependency detected",
		})
	}

	// Insert dependency
	depID := idgen.New()
	now := time.Now()

	_, err = h.db.Pool.Exec(ctx,
		`INSERT INTO scheduler_dependencies (id, scheduler_id, depends_on_scheduler_id, condition, created_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		depID, schedulerID, req.DependsOnSchedulerID, req.Condition, now,
	)
	if err != nil {
		log.Error().Err(err).
			Str("scheduler_id", schedulerID).
			Str("depends_on", req.DependsOnSchedulerID).
			Msg("Failed to create dependency")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create dependency",
		})
	}

	log.Info().
		Str("dependency_id", depID).
		Str("scheduler_id", schedulerID).
		Str("depends_on", req.DependsOnSchedulerID).
		Str("condition", req.Condition).
		Msg("Scheduler dependency created")

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"data": SchedulerDependency{
			ID:                   depID,
			SchedulerID:          schedulerID,
			DependsOnSchedulerID: req.DependsOnSchedulerID,
			Condition:            req.Condition,
			CreatedAt:            now,
		},
	})
}

// RemoveDependency deletes a dependency
func (h *Handler) RemoveDependency(c *fiber.Ctx) error {
	ctx := context.Background()

	schedulerID := c.Params("id")
	depID := c.Params("depId")

	if schedulerID == "" || depID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid scheduler ID or dependency ID",
		})
	}

	result, err := h.db.Pool.Exec(ctx,
		"DELETE FROM scheduler_dependencies WHERE id = $1 AND scheduler_id = $2",
		depID, schedulerID,
	)
	if err != nil {
		log.Error().Err(err).
			Str("dependency_id", depID).
			Str("scheduler_id", schedulerID).
			Msg("Failed to delete dependency")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete dependency",
		})
	}

	if result.RowsAffected() == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Dependency not found",
		})
	}

	log.Info().
		Str("dependency_id", depID).
		Str("scheduler_id", schedulerID).
		Msg("Scheduler dependency removed")

	return c.Status(fiber.StatusNoContent).Send(nil)
}

// detectCycle uses BFS to check if adding a dependency from schedulerID -> newDependsOnID
// would create a circular dependency chain.
func (h *Handler) detectCycle(ctx context.Context, schedulerID, newDependsOnID string) (bool, error) {
	visited := map[string]bool{}
	queue := []string{newDependsOnID}

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		if current == schedulerID {
			return true, nil // cycle detected
		}

		if visited[current] {
			continue
		}
		visited[current] = true

		// Get dependencies of current scheduler
		rows, err := h.db.Pool.Query(ctx,
			"SELECT depends_on_scheduler_id FROM scheduler_dependencies WHERE scheduler_id = $1",
			current,
		)
		if err != nil {
			return false, err
		}

		for rows.Next() {
			var depID string
			if err := rows.Scan(&depID); err != nil {
				rows.Close()
				return false, err
			}
			queue = append(queue, depID)
		}
		rows.Close()
	}

	return false, nil
}
