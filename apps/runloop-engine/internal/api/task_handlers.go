package api

import (
	"context"
	"encoding/json"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
	"github.com/runloop/runloop-engine/internal/idgen"
	"github.com/runloop/runloop-engine/internal/models"
)

// ListTasks returns a list of tasks
func (h *Handler) ListTasks(c *fiber.Ctx) error {
	ctx := context.Background()

	projectID := c.Query("projectId")
	status := c.Query("status")
	limit := c.QueryInt("limit", 50)
	offset := c.QueryInt("offset", 0)

	query := `
		SELECT id, name, description, job_type, config,
		       status, project_id, created_by, created_at, updated_at
		FROM tasks
		WHERE 1=1
	`
	args := []interface{}{}
	argCount := 1

	if projectID != "" {
		query += " AND project_id = $" + string(rune('0'+argCount))
		args = append(args, projectID)
		argCount++
	}

	if status != "" {
		query += " AND status = $" + string(rune('0'+argCount))
		args = append(args, status)
		argCount++
	}

	query += " ORDER BY created_at DESC"

	if limit > 0 {
		query += " LIMIT $" + string(rune('0'+argCount))
		args = append(args, limit)
		argCount++
	}

	if offset > 0 {
		query += " OFFSET $" + string(rune('0'+argCount))
		args = append(args, offset)
		argCount++
	}

	rows, err := h.db.Pool.Query(ctx, query, args...)
	if err != nil {
		log.Error().Err(err).Msg("Failed to query tasks")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch tasks",
		})
	}
	defer rows.Close()

	var tasks []models.Task
	for rows.Next() {
		var t models.Task
		var configJSON []byte

		err := rows.Scan(
			&t.ID, &t.Name, &t.Description, &t.JobType,
			&configJSON, &t.Status, &t.ProjectID,
			&t.CreatedBy, &t.CreatedAt, &t.UpdatedAt,
		)
		if err != nil {
			log.Error().Err(err).Msg("Failed to scan task")
			continue
		}

		if len(configJSON) > 0 {
			json.Unmarshal(configJSON, &t.Config)
		}

		tasks = append(tasks, t)
	}

	return c.JSON(fiber.Map{
		"data": tasks,
	})
}

// GetTask returns a single task
func (h *Handler) GetTask(c *fiber.Ctx) error {
	ctx := context.Background()

	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid task ID",
		})
	}

	query := `
		SELECT id, name, description, job_type, config,
		       status, project_id, created_by, created_at, updated_at
		FROM tasks
		WHERE id = $1
	`

	var t models.Task
	var configJSON []byte

	err := h.db.Pool.QueryRow(ctx, query, id).Scan(
		&t.ID, &t.Name, &t.Description, &t.JobType,
		&configJSON, &t.Status, &t.ProjectID,
		&t.CreatedBy, &t.CreatedAt, &t.UpdatedAt,
	)

	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Task not found",
		})
	}

	if len(configJSON) > 0 {
		json.Unmarshal(configJSON, &t.Config)
	}

	return c.JSON(fiber.Map{
		"data": t,
	})
}

// CreateTask creates a new task
func (h *Handler) CreateTask(c *fiber.Ctx) error {
	ctx := context.Background()

	var req models.CreateTaskRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Validate request
	if err := h.validate.Struct(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Validation failed",
			"details": err.Error(),
		})
	}

	// Get user ID from context
	userID, _ := c.Locals("userID").(string)
	if userID == "" {
		userID = "system" // Fallback
	}

	// Generate ID
	taskID := idgen.New()

	// Default status to ACTIVE if not provided
	status := req.Status
	if status == "" {
		status = models.TaskStatusActive
	}

	now := time.Now()

	task := &models.Task{
		ID:          taskID,
		Name:        req.Name,
		Description: req.Description,
		JobType:     req.JobType,
		Config:      req.Config,
		Status:      status,
		ProjectID:   req.ProjectID,
		CreatedBy:   userID,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	// Insert into database
	query := `
		INSERT INTO tasks (id, name, description, job_type, config,
		                   status, project_id, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`

	configJSON, _ := json.Marshal(task.Config)

	_, err := h.db.Pool.Exec(ctx, query,
		task.ID, task.Name, task.Description, task.JobType,
		configJSON, task.Status, task.ProjectID,
		task.CreatedBy, task.CreatedAt, task.UpdatedAt,
	)

	if err != nil {
		log.Error().Err(err).Msg("Failed to create task")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create task",
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"data": task,
	})
}

// UpdateTask updates a task
func (h *Handler) UpdateTask(c *fiber.Ctx) error {
	ctx := context.Background()

	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid task ID",
		})
	}

	var req models.UpdateTaskRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Build update query dynamically
	updates := []string{}
	args := []interface{}{}
	argCount := 1

	if req.Name != nil {
		updates = append(updates, "name = $"+string(rune('0'+argCount)))
		args = append(args, *req.Name)
		argCount++
	}
	if req.Description != nil {
		updates = append(updates, "description = $"+string(rune('0'+argCount)))
		args = append(args, *req.Description)
		argCount++
	}
	if req.JobType != nil {
		updates = append(updates, "job_type = $"+string(rune('0'+argCount)))
		args = append(args, *req.JobType)
		argCount++
	}
	if req.Config != nil {
		updates = append(updates, "config = $"+string(rune('0'+argCount)))
		configJSON, _ := json.Marshal(req.Config)
		args = append(args, configJSON)
		argCount++
	}
	if req.Status != nil {
		updates = append(updates, "status = $"+string(rune('0'+argCount)))
		args = append(args, *req.Status)
		argCount++
	}

	if len(updates) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "No fields to update",
		})
	}

	updates = append(updates, "updated_at = $"+string(rune('0'+argCount)))
	args = append(args, time.Now())
	argCount++

	args = append(args, id)

	query := "UPDATE tasks SET " + joinStrings(updates, ", ") + " WHERE id = $" + string(rune('0'+argCount))

	result, err := h.db.Pool.Exec(ctx, query, args...)
	if err != nil {
		log.Error().Err(err).Msg("Failed to update task")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update task",
		})
	}

	if result.RowsAffected() == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Task not found",
		})
	}

	// Return updated task
	return h.GetTask(c)
}

// DeleteTask deletes a task
func (h *Handler) DeleteTask(c *fiber.Ctx) error {
	ctx := context.Background()

	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid task ID",
		})
	}

	query := `DELETE FROM tasks WHERE id = $1`
	result, err := h.db.Pool.Exec(ctx, query, id)
	if err != nil {
		log.Error().Err(err).Msg("Failed to delete task")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete task",
		})
	}

	if result.RowsAffected() == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Task not found",
		})
	}

	return c.Status(fiber.StatusNoContent).Send(nil)
}
