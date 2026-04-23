package api

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v2"
	"github.com/robfig/cron/v3"
	"github.com/runloop/runloop-engine/internal/db"
	"github.com/runloop/runloop-engine/internal/executor"
	"github.com/runloop/runloop-engine/internal/idgen"
	"github.com/runloop/runloop-engine/internal/models"
	"github.com/runloop/runloop-engine/internal/queue"
	"github.com/runloop/runloop-engine/internal/scheduler"
	"github.com/runloop/runloop-engine/internal/websocket"
	"github.com/runloop/runloop-engine/internal/worker"
	"github.com/rs/zerolog/log"
)

// cronParser accepts standard 5-field cron (e.g. "0 * * * *") plus descriptors
// (@hourly, @daily, @weekly, etc.) used by gocron.
var cronParser = cron.NewParser(
	cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor,
)

// validateCron returns a user-friendly error if the expression is invalid.
func validateCron(expr string) error {
	_, err := cronParser.Parse(expr)
	return err
}

// Handler handles API requests
type Handler struct {
	db         *db.Postgres
	scheduler  *scheduler.Manager
	workerPool *worker.Pool
	validate   *validator.Validate
	hub        *websocket.Hub
	queue      *queue.Manager
	plugins    *executor.PluginRegistry
}

// NewHandler creates a new API handler
func NewHandler(database *db.Postgres, sched *scheduler.Manager, wp *worker.Pool, hub *websocket.Hub, qm *queue.Manager, plugins *executor.PluginRegistry) *Handler {
	return &Handler{
		db:         database,
		scheduler:  sched,
		workerPool: wp,
		validate:   validator.New(),
		hub:        hub,
		queue:      qm,
		plugins:    plugins,
	}
}

// HealthCheck returns health status
func (h *Handler) HealthCheck(c *fiber.Ctx) error {
	ctx := context.Background()

	// Check database
	dbHealthy := true
	if err := h.db.Health(ctx); err != nil {
		dbHealthy = false
		log.Error().Err(err).Msg("Database health check failed")
	}

	return c.JSON(fiber.Map{
		"status":    "healthy",
		"database":  dbHealthy,
		"timestamp": time.Now().Unix(),
	})
}

// GetStats returns system statistics
func (h *Handler) GetStats(c *fiber.Ctx) error {
	ctx := context.Background()

	// Get worker pool stats
	workerStats := h.workerPool.GetStats()

	// Get execution counts
	var totalExecutions, successCount, failureCount int64
	row := h.db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM executions")
	row.Scan(&totalExecutions)

	row = h.db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM executions WHERE status = 'SUCCESS'")
	row.Scan(&successCount)

	row = h.db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM executions WHERE status = 'FAILED'")
	row.Scan(&failureCount)

	// Get scheduler count
	var schedulerCount int64
	row = h.db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM schedulers WHERE deleted_at IS NULL")
	row.Scan(&schedulerCount)

	// Get active scheduler count
	var activeSchedulerCount int64
	row = h.db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM schedulers WHERE status = 'ACTIVE' AND deleted_at IS NULL")
	row.Scan(&activeSchedulerCount)

	return c.JSON(fiber.Map{
		"workers": workerStats,
		"executions": fiber.Map{
			"total":   totalExecutions,
			"success": successCount,
			"failed":  failureCount,
		},
		"schedulers": fiber.Map{
			"total":  schedulerCount,
			"active": activeSchedulerCount,
		},
	})
}

// ListSchedulers returns a list of schedulers
func (h *Handler) ListSchedulers(c *fiber.Ctx) error {
	ctx := context.Background()

	projectID := c.Query("projectId")
	status := c.Query("status")

	query := `
		SELECT id, name, description, type, schedule, timezone, status,
		       last_run_at, next_run_at, success_count, failure_count, created_at
		FROM schedulers 
		WHERE deleted_at IS NULL
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

	rows, err := h.db.Pool.Query(ctx, query, args...)
	if err != nil {
		log.Error().Err(err).Msg("Failed to query schedulers")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch schedulers",
		})
	}
	defer rows.Close()

	var schedulers []models.Scheduler
	for rows.Next() {
		var s models.Scheduler
		err := rows.Scan(
			&s.ID, &s.Name, &s.Description, &s.Type, &s.Schedule, &s.Timezone,
			&s.Status, &s.LastRunAt, &s.NextRunAt, &s.SuccessCount, &s.FailureCount,
			&s.CreatedAt,
		)
		if err != nil {
			log.Error().Err(err).Msg("Failed to scan scheduler")
			continue
		}
		schedulers = append(schedulers, s)
	}

	return c.JSON(fiber.Map{
		"data": schedulers,
	})
}

// GetScheduler returns a single scheduler
func (h *Handler) GetScheduler(c *fiber.Ctx) error {
	ctx := context.Background()

	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid scheduler ID",
		})
	}

	query := `
		SELECT id, name, description, type, trigger_type, schedule, timezone, status,
		       config, timeout, retry_count, retry_delay, last_run_at, next_run_at,
		       success_count, failure_count, project_id, created_by, created_at, updated_at,
		       flow_config, is_flow, COALESCE(max_concurrency, 1), paused_until
		FROM schedulers
		WHERE id = $1 AND deleted_at IS NULL
	`

	var s models.Scheduler
	var configJSON, flowConfigJSON []byte

	err := h.db.Pool.QueryRow(ctx, query, id).Scan(
		&s.ID, &s.Name, &s.Description, &s.Type, &s.TriggerType, &s.Schedule, &s.Timezone,
		&s.Status, &configJSON, &s.Timeout, &s.RetryCount, &s.RetryDelay, &s.LastRunAt,
		&s.NextRunAt, &s.SuccessCount, &s.FailureCount, &s.ProjectID, &s.CreatedBy,
		&s.CreatedAt, &s.UpdatedAt, &flowConfigJSON, &s.IsFlow,
		&s.MaxConcurrency, &s.PausedUntil,
	)

	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Scheduler not found",
		})
	}

	// Parse config
	if len(configJSON) > 0 {
		json.Unmarshal(configJSON, &s.Config)
	}
	if len(flowConfigJSON) > 0 {
		json.Unmarshal(flowConfigJSON, &s.FlowConfig)
	}

	return c.JSON(fiber.Map{
		"data": s,
	})
}

// CreateScheduler creates a new scheduler
func (h *Handler) CreateScheduler(c *fiber.Ctx) error {
	ctx := context.Background()

	var req models.CreateSchedulerRequest
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

	// Validate cron expression if provided
	if req.Schedule != nil && *req.Schedule != "" {
		if err := validateCron(*req.Schedule); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error":   "Invalid cron expression",
				"details": err.Error(),
			})
		}
	}

	// Get user ID from context
	userID, _ := c.Locals("userID").(string)
	if userID == "" {
		userID = "system" // Fallback
	}

	// Generate ID
	schedulerID := idgen.New()

	// Default trigger type to SCHEDULE if not provided
	triggerType := req.TriggerType
	if triggerType == "" {
		triggerType = models.TriggerTypeSchedule
	}

	// Create scheduler
	scheduler := &models.Scheduler{
		ID:             schedulerID,
		Name:           req.Name,
		Description:    req.Description,
		Type:           req.Type,
		TriggerType:    triggerType,
		Schedule:       req.Schedule,
		Timezone:       req.Timezone,
		Status:         models.JobStatusActive,
		Config:         req.Config,
		Timeout:        req.Timeout,
		RetryCount:     req.RetryCount,
		RetryDelay:     req.RetryDelay,
		MaxConcurrency: req.MaxConcurrency,
		ProjectID:      req.ProjectID,
		CreatedBy:      userID,
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
		IsFlow:         req.IsFlow,
		FlowConfig:     req.FlowConfig,
	}

	if scheduler.MaxConcurrency <= 0 {
		scheduler.MaxConcurrency = 1
	}

	// Set defaults
	if scheduler.Timeout == 0 {
		scheduler.Timeout = 300 // 5 minutes
	}

	// Insert into database
	query := `
		INSERT INTO schedulers (id, name, description, type, trigger_type, schedule, timezone,
		                       status, config, timeout, retry_count, retry_delay,
		                       project_id, created_by, created_at, updated_at, is_flow, flow_config,
		                       max_concurrency)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
	`

	configJSON, _ := json.Marshal(scheduler.Config)
	flowConfigJSON, _ := json.Marshal(scheduler.FlowConfig)

	_, err := h.db.Pool.Exec(ctx, query,
		scheduler.ID, scheduler.Name, scheduler.Description, scheduler.Type,
		scheduler.TriggerType, scheduler.Schedule, scheduler.Timezone, scheduler.Status,
		configJSON, scheduler.Timeout, scheduler.RetryCount, scheduler.RetryDelay,
		scheduler.ProjectID, scheduler.CreatedBy, scheduler.CreatedAt, scheduler.UpdatedAt,
		scheduler.IsFlow, flowConfigJSON, scheduler.MaxConcurrency,
	)

	if err != nil {
		log.Error().Err(err).Msg("Failed to create scheduler")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create scheduler",
		})
	}

	// Add to scheduler manager if active and has schedule
	if scheduler.Status == models.JobStatusActive && scheduler.Schedule != nil {
		if err := h.scheduler.AddJob(scheduler); err != nil {
			log.Error().Err(err).Str("scheduler_id", scheduler.ID).Msg("Failed to schedule job")
		}
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"data": scheduler,
	})
}

// UpdateScheduler updates a scheduler
func (h *Handler) UpdateScheduler(c *fiber.Ctx) error {
	ctx := context.Background()

	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid scheduler ID",
		})
	}

	var req models.UpdateSchedulerRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Validate cron expression if schedule is being updated
	if req.Schedule != nil && *req.Schedule != "" {
		if err := validateCron(*req.Schedule); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error":   "Invalid cron expression",
				"details": err.Error(),
			})
		}
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
	if req.Schedule != nil {
		updates = append(updates, "schedule = $"+string(rune('0'+argCount)))
		args = append(args, *req.Schedule)
		argCount++
	}
	if req.Timezone != nil {
		updates = append(updates, "timezone = $"+string(rune('0'+argCount)))
		args = append(args, *req.Timezone)
		argCount++
	}
	if req.Status != nil {
		updates = append(updates, "status = $"+string(rune('0'+argCount)))
		args = append(args, *req.Status)
		argCount++
	}
	if req.Config != nil {
		updates = append(updates, "config = $"+string(rune('0'+argCount)))
		configJSON, _ := json.Marshal(req.Config)
		args = append(args, configJSON)
		argCount++
	}
	if req.Timeout != nil {
		updates = append(updates, "timeout = $"+string(rune('0'+argCount)))
		args = append(args, *req.Timeout)
		argCount++
	}
	if req.RetryCount != nil {
		updates = append(updates, "retry_count = $"+string(rune('0'+argCount)))
		args = append(args, *req.RetryCount)
		argCount++
	}
	if req.RetryDelay != nil {
		updates = append(updates, "retry_delay = $"+string(rune('0'+argCount)))
		args = append(args, *req.RetryDelay)
		argCount++
	}
	if req.IsFlow != nil {
		updates = append(updates, "is_flow = $"+string(rune('0'+argCount)))
		args = append(args, *req.IsFlow)
		argCount++
	}
	if req.FlowConfig != nil {
		updates = append(updates, "flow_config = $"+string(rune('0'+argCount)))
		flowConfigJSON, _ := json.Marshal(req.FlowConfig)
		args = append(args, flowConfigJSON)
		argCount++
	}
	if req.MaxConcurrency != nil {
		updates = append(updates, "max_concurrency = $"+string(rune('0'+argCount)))
		args = append(args, *req.MaxConcurrency)
		argCount++
	}
	// pausedUntil supports setting (time) or clearing (null).
	// Detect explicit null from the raw body by checking if the key exists.
	if req.PausedUntil != nil {
		updates = append(updates, "paused_until = $"+string(rune('0'+argCount)))
		args = append(args, *req.PausedUntil)
		argCount++
	} else if rawBody := string(c.Body()); rawBody != "" && (bytesContains(rawBody, "\"pausedUntil\":null") || bytesContains(rawBody, "\"pausedUntil\": null")) {
		updates = append(updates, "paused_until = NULL")
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

	query := "UPDATE schedulers SET " + joinStrings(updates, ", ") + " WHERE id = $" + string(rune('0'+argCount))

	_, err := h.db.Pool.Exec(ctx, query, args...)
	if err != nil {
		log.Error().Err(err).Msg("Failed to update scheduler")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update scheduler",
		})
	}

	// Refresh scheduler in manager
	h.scheduler.RemoveJob(id)

	// Get updated scheduler
	scheduler, _ := h.getSchedulerByID(ctx, id)
	if scheduler != nil && scheduler.Status == models.JobStatusActive && scheduler.Schedule != nil {
		h.scheduler.AddJob(scheduler)
	}

	return c.JSON(fiber.Map{
		"data": scheduler,
	})
}

// DeleteScheduler deletes a scheduler
func (h *Handler) DeleteScheduler(c *fiber.Ctx) error {
	ctx := context.Background()

	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid scheduler ID",
		})
	}

	// Remove from scheduler manager
	h.scheduler.RemoveJob(id)

	// Soft delete
	query := `UPDATE schedulers SET deleted_at = $1 WHERE id = $2`
	_, err := h.db.Pool.Exec(ctx, query, time.Now(), id)
	if err != nil {
		log.Error().Err(err).Msg("Failed to delete scheduler")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete scheduler",
		})
	}

	return c.Status(fiber.StatusNoContent).Send(nil)
}

// TriggerScheduler manually triggers a scheduler
func (h *Handler) TriggerScheduler(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid scheduler ID",
		})
	}

	var req models.TriggerJobRequest
	if err := c.BodyParser(&req); err != nil {
		req.Input = models.JSONMap{}
	}

	// Get IP address
	ipAddress := c.IP()
	req.IPAddress = &ipAddress

	// Trigger job
	execution, err := h.scheduler.TriggerJob(c.Context(), id, req.Input, req.IPAddress)
	if err != nil {
		log.Error().Err(err).Msg("Failed to trigger job")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"data": execution,
	})
}

// ListExecutions returns a list of executions
func (h *Handler) ListExecutions(c *fiber.Ctx) error {
	ctx := context.Background()

	projectID := c.Query("projectId")
	schedulerID := c.Query("schedulerId")
	status := c.Query("status")
	limit := c.QueryInt("limit", 50)
	offset := c.QueryInt("offset", 0)

	query := `
		SELECT e.id, e.scheduler_id, e.project_id, e.trigger_type, e.status,
		       e.started_at, e.completed_at, e.duration_ms, e.error_message, e.retry_attempt,
		       s.name as scheduler_name
		FROM executions e
		LEFT JOIN schedulers s ON e.scheduler_id = s.id
		WHERE 1=1
	`
	args := []interface{}{}
	argCount := 1

	if projectID != "" {
		query += " AND e.project_id = $" + string(rune('0'+argCount))
		args = append(args, projectID)
		argCount++
	}

	if schedulerID != "" {
		query += " AND e.scheduler_id = $" + string(rune('0'+argCount))
		args = append(args, schedulerID)
		argCount++
	}

	if status != "" {
		query += " AND e.status = $" + string(rune('0'+argCount))
		args = append(args, status)
		argCount++
	}

	query += " ORDER BY e.started_at DESC"

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
		log.Error().Err(err).Msg("Failed to query executions")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch executions",
		})
	}
	defer rows.Close()

	type ExecutionWithName struct {
		models.Execution
		SchedulerName *string `json:"schedulerName,omitempty"`
	}

	var executions []ExecutionWithName
	for rows.Next() {
		var e ExecutionWithName
		err := rows.Scan(
			&e.ID, &e.SchedulerID, &e.ProjectID, &e.TriggerType, &e.Status,
			&e.StartedAt, &e.CompletedAt, &e.DurationMs, &e.ErrorMessage, &e.RetryAttempt,
			&e.SchedulerName,
		)
		if err != nil {
			log.Error().Err(err).Msg("Failed to scan execution")
			continue
		}
		executions = append(executions, e)
	}

	return c.JSON(fiber.Map{
		"data": executions,
	})
}

// GetExecution returns a single execution with logs
func (h *Handler) GetExecution(c *fiber.Ctx) error {
	ctx := context.Background()

	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid execution ID",
		})
	}

	query := `
		SELECT e.id, e.scheduler_id, e.project_id, e.trigger_type, e.triggered_by, e.status,
		       e.started_at, e.completed_at, e.duration_ms, e.input, e.output,
		       e.error_message, e.logs, e.retry_attempt, e.worker_id, e.ip_address,
		       e.replay_count, e.replayed_from,
		       s.name as scheduler_name
		FROM executions e
		LEFT JOIN schedulers s ON e.scheduler_id = s.id
		WHERE e.id = $1
	`

	type ExecutionDetail struct {
		models.Execution
		SchedulerName *string `json:"schedulerName,omitempty"`
	}

	var e ExecutionDetail
	var inputJSON, outputJSON []byte

	err := h.db.Pool.QueryRow(ctx, query, id).Scan(
		&e.ID, &e.SchedulerID, &e.ProjectID, &e.TriggerType, &e.TriggeredBy, &e.Status,
		&e.StartedAt, &e.CompletedAt, &e.DurationMs, &inputJSON, &outputJSON,
		&e.ErrorMessage, &e.Logs, &e.RetryAttempt, &e.WorkerID, &e.IPAddress,
		&e.ReplayCount, &e.ReplayedFrom,
		&e.SchedulerName,
	)

	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Execution not found",
		})
	}

	// Parse JSON fields
	if len(inputJSON) > 0 {
		json.Unmarshal(inputJSON, &e.Input)
	}
	if len(outputJSON) > 0 {
		json.Unmarshal(outputJSON, &e.Output)
	}

	return c.JSON(fiber.Map{
		"data": e,
	})
}

// GetExecutionMetrics returns execution metrics
func (h *Handler) GetExecutionMetrics(c *fiber.Ctx) error {
	ctx := context.Background()

	schedulerID := c.Query("schedulerId")

	query := `
		SELECT 
			COUNT(*) as total,
			COUNT(*) FILTER (WHERE status = 'SUCCESS') as success,
			COUNT(*) FILTER (WHERE status = 'FAILED') as failed,
			AVG(duration_ms) FILTER (WHERE status = 'SUCCESS') as avg_duration,
			COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
			COUNT(*) FILTER (WHERE status = 'RUNNING') as running
		FROM executions
		WHERE 1=1
	`
	args := []interface{}{}

	if schedulerID != "" {
		query += " AND scheduler_id = $1"
		args = append(args, schedulerID)
	}

	var metrics models.ExecutionMetrics
	var avgDuration *float64

	err := h.db.Pool.QueryRow(ctx, query, args...).Scan(
		&metrics.TotalExecutions,
		&metrics.SuccessCount,
		&metrics.FailureCount,
		&avgDuration,
		&metrics.PendingExecutions,
		&metrics.RunningExecutions,
	)

	if err != nil {
		log.Error().Err(err).Msg("Failed to get metrics")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to get metrics",
		})
	}

	if avgDuration != nil {
		metrics.AvgDurationMs = *avgDuration
	}

	// Calculate success rate
	if metrics.TotalExecutions > 0 {
		metrics.SuccessRate = float64(metrics.SuccessCount) / float64(metrics.TotalExecutions) * 100
	}

	return c.JSON(fiber.Map{
		"data": metrics,
	})
}

// BulkDeleteExecutions deletes multiple executions by ID.
func (h *Handler) BulkDeleteExecutions(c *fiber.Ctx) error {
	var req struct {
		IDs []string `json:"ids"`
	}
	if err := c.BodyParser(&req); err != nil || len(req.IDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ids array required"})
	}

	tag, err := h.db.Pool.Exec(c.Context(),
		`DELETE FROM executions WHERE id = ANY($1) AND status != 'RUNNING'`,
		req.IDs,
	)
	if err != nil {
		log.Error().Err(err).Msg("Bulk delete failed")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"success": true, "deleted": tag.RowsAffected()})
}

// BulkRetryExecutions re-triggers multiple failed executions.
func (h *Handler) BulkRetryExecutions(c *fiber.Ctx) error {
	var req struct {
		IDs []string `json:"ids"`
	}
	if err := c.BodyParser(&req); err != nil || len(req.IDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ids array required"})
	}

	retried := 0
	errors := []string{}
	for _, id := range req.IDs {
		var schedulerID string
		var input models.JSONMap
		var inputJSON []byte
		err := h.db.Pool.QueryRow(c.Context(),
			`SELECT scheduler_id, input FROM executions WHERE id = $1`, id,
		).Scan(&schedulerID, &inputJSON)
		if err != nil {
			errors = append(errors, fmt.Sprintf("%s: %v", id, err))
			continue
		}
		if len(inputJSON) > 0 {
			json.Unmarshal(inputJSON, &input)
		}
		if _, err := h.scheduler.TriggerJob(c.Context(), schedulerID, input, nil); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %v", id, err))
			continue
		}
		retried++
	}

	return c.JSON(fiber.Map{
		"success": true,
		"retried": retried,
		"errors":  errors,
	})
}

// CancelExecution cancels a running execution
func (h *Handler) CancelExecution(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "execution id required"})
	}

	// Try to cancel the in-memory running context
	cancelled := h.workerPool.CancelExecution(id)

	// Mark as CANCELLED in DB regardless (so stale rows also get resolved)
	now := time.Now()
	_, err := h.db.Pool.Exec(c.Context(), `
		UPDATE executions
		SET status = $1, completed_at = $2, error_message = $3
		WHERE id = $4 AND status IN ('PENDING', 'RUNNING')
	`, models.ExecutionStatusCancelled, now, "Cancelled by user", id)

	if err != nil {
		log.Error().Err(err).Str("execution_id", id).Msg("Failed to update execution status")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update execution"})
	}

	return c.JSON(fiber.Map{
		"success":   true,
		"cancelled": cancelled,
		"message":   "Execution cancellation requested",
	})
}

// bytesContains is a small helper for detecting JSON literals without
// reparsing. Used for detecting `"pausedUntil": null` in PATCH bodies.
func bytesContains(haystack, needle string) bool {
	return len(haystack) >= len(needle) && (func() bool {
		for i := 0; i+len(needle) <= len(haystack); i++ {
			if haystack[i:i+len(needle)] == needle {
				return true
			}
		}
		return false
	})()
}

// Helper function
func (h *Handler) getSchedulerByID(ctx context.Context, id string) (*models.Scheduler, error) {
	query := `
		SELECT id, name, description, type, trigger_type, schedule, timezone, status,
		       config, timeout, retry_count, retry_delay, project_id, created_by,
		       COALESCE(max_concurrency, 1), paused_until
		FROM schedulers
		WHERE id = $1 AND deleted_at IS NULL
	`

	var s models.Scheduler
	var configJSON []byte

	err := h.db.Pool.QueryRow(ctx, query, id).Scan(
		&s.ID, &s.Name, &s.Description, &s.Type, &s.TriggerType, &s.Schedule, &s.Timezone,
		&s.Status, &configJSON, &s.Timeout, &s.RetryCount, &s.RetryDelay, &s.ProjectID, &s.CreatedBy,
		&s.MaxConcurrency, &s.PausedUntil,
	)
	if err != nil {
		return nil, err
	}

	if len(configJSON) > 0 {
		json.Unmarshal(configJSON, &s.Config)
	}

	return &s, nil
}

func joinStrings(strs []string, sep string) string {
	if len(strs) == 0 {
		return ""
	}
	result := strs[0]
	for i := 1; i < len(strs); i++ {
		result += sep + strs[i]
	}
	return result
}
