package api

import (
	"context"
	"encoding/json"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

	"github.com/runloop/runloop-engine/internal/queue"
)

// ─────────────────────────────────────────────────────────────────────────────
// Queue CRUD
// ─────────────────────────────────────────────────────────────────────────────

type createQueueRequest struct {
	Name           string                 `json:"name" validate:"required"`
	ProjectID      string                 `json:"projectId" validate:"required"`
	FlowID         string                 `json:"flowId" validate:"required"`
	Backend        string                 `json:"backend" validate:"required,oneof=postgres redis rabbitmq kafka"`
	BackendConfig  map[string]interface{} `json:"backendConfig"`
	Concurrency    int                    `json:"concurrency"`
	MaxAttempts    int                    `json:"maxAttempts"`
	VisibilitySec  int                    `json:"visibilitySec"`
	BackoffInitMs  int                    `json:"backoffInitMs"`
	BackoffMaxMs   int                    `json:"backoffMaxMs"`
	BackoffMult    float64                `json:"backoffMult"`
	Enabled        *bool                  `json:"enabled"`
}

// CreateQueue registers a new queue and — if enabled — starts a consumer.
// It also pings the backend (when applicable) to catch bad config up
// front rather than at first delivery.
func (h *Handler) CreateQueue(c *fiber.Ctx) error {
	var req createQueueRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	if err := h.validate.Struct(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	// Defaults for optional numeric fields.
	if req.Concurrency <= 0 {
		req.Concurrency = 1
	}
	if req.MaxAttempts <= 0 {
		req.MaxAttempts = 3
	}
	if req.VisibilitySec <= 0 {
		req.VisibilitySec = 300
	}
	if req.BackoffInitMs <= 0 {
		req.BackoffInitMs = 1000
	}
	if req.BackoffMaxMs <= 0 {
		req.BackoffMaxMs = 60000
	}
	if req.BackoffMult <= 0 {
		req.BackoffMult = 2.0
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	if req.BackendConfig == nil {
		req.BackendConfig = map[string]interface{}{}
	}
	cfgBytes, _ := json.Marshal(req.BackendConfig)

	_, err := h.db.Pool.Exec(c.Context(), `
		INSERT INTO job_queues
			(name, project_id, flow_id, backend, backend_config,
			 concurrency, max_attempts, visibility_sec,
			 backoff_init_ms, backoff_max_ms, backoff_mult, enabled, updated_at)
		VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12, NOW())
	`,
		req.Name, req.ProjectID, req.FlowID, req.Backend, string(cfgBytes),
		req.Concurrency, req.MaxAttempts, req.VisibilitySec,
		req.BackoffInitMs, req.BackoffMaxMs, req.BackoffMult, enabled,
	)
	if err != nil {
		log.Error().Err(err).Msg("create queue failed")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	if enabled {
		def, err := h.queue.GetQueue(c.Context(), req.Name)
		if err == nil {
			if startErr := h.queue.StartQueue(context.Background(), def); startErr != nil {
				log.Error().Err(startErr).Str("queue", req.Name).Msg("StartQueue failed after create")
			}
		}
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": fiber.Map{"name": req.Name}})
}

// ListQueues returns all queues, optionally filtered by project.
func (h *Handler) ListQueues(c *fiber.Ctx) error {
	projectID := c.Query("projectId")
	query := `SELECT name, project_id, flow_id, backend, concurrency, max_attempts, enabled
	          FROM job_queues`
	args := []interface{}{}
	if projectID != "" {
		query += ` WHERE project_id=$1`
		args = append(args, projectID)
	}
	query += ` ORDER BY name`

	rows, err := h.db.Pool.Query(c.Context(), query, args...)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	type row struct {
		Name        string `json:"name"`
		ProjectID   string `json:"projectId"`
		FlowID      string `json:"flowId"`
		Backend     string `json:"backend"`
		Concurrency int    `json:"concurrency"`
		MaxAttempts int    `json:"maxAttempts"`
		Enabled     bool   `json:"enabled"`
	}
	var out []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.Name, &r.ProjectID, &r.FlowID, &r.Backend, &r.Concurrency, &r.MaxAttempts, &r.Enabled); err != nil {
			continue
		}
		out = append(out, r)
	}
	return c.JSON(fiber.Map{"data": out})
}

// GetQueue returns full queue definition including backend_config.
func (h *Handler) GetQueue(c *fiber.Ctx) error {
	name := c.Params("name")
	def, err := h.queue.GetQueue(c.Context(), name)
	if err == pgx.ErrNoRows {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "queue not found"})
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"data": def})
}

// updateQueueRequest carries the subset of queue config that's safe to
// change without recreating the queue. Pointer fields = optional patch:
// nil leaves the existing value, non-nil overwrites it.
//
// Why these and not all fields:
//   * `name` is the primary key — renaming would invalidate every job
//     row and every existing API key URL pointing at this queue.
//   * `backend` requires a different consumer wiring; safer to recreate.
//   * `backendConfig` ditto for non-postgres backends.
// Fields you CAN patch live:
//   * flowId — every subsequent pickup runs the new flow. In-flight
//     pickups continue with the flow they already started.
//   * concurrency — bumped/lowered on next consumer cycle.
//   * maxAttempts, visibilitySec — applies to new deliveries.
//   * enabled — toggle pause without losing the queue or its jobs.
type updateQueueRequest struct {
	FlowID        *string `json:"flowId,omitempty"`
	Concurrency   *int    `json:"concurrency,omitempty"`
	MaxAttempts   *int    `json:"maxAttempts,omitempty"`
	VisibilitySec *int    `json:"visibilitySec,omitempty"`
	Enabled       *bool   `json:"enabled,omitempty"`
}

// UpdateQueue patches the queue config. After a successful update we
// stop the consumer and restart it with the new def — that's the
// cleanest way to pick up concurrency / enabled changes without a
// process restart. flow_id changes don't need a restart (the worker
// reads it per-pickup) but we restart anyway for consistency.
func (h *Handler) UpdateQueue(c *fiber.Ctx) error {
	name := c.Params("name")
	if name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name required"})
	}
	var req updateQueueRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	if req.FlowID == nil && req.Concurrency == nil && req.MaxAttempts == nil && req.VisibilitySec == nil && req.Enabled == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "no fields to update"})
	}

	// Build the SET clause dynamically so we only touch fields the caller
	// supplied. Easier than juggling COALESCE in SQL.
	sets := []string{}
	args := []interface{}{}
	idx := 1
	if req.FlowID != nil {
		sets = append(sets, "flow_id=$"+strconv.Itoa(idx))
		args = append(args, *req.FlowID)
		idx++
	}
	if req.Concurrency != nil {
		if *req.Concurrency < 1 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "concurrency must be >= 1"})
		}
		sets = append(sets, "concurrency=$"+strconv.Itoa(idx))
		args = append(args, *req.Concurrency)
		idx++
	}
	if req.MaxAttempts != nil {
		if *req.MaxAttempts < 1 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "maxAttempts must be >= 1"})
		}
		sets = append(sets, "max_attempts=$"+strconv.Itoa(idx))
		args = append(args, *req.MaxAttempts)
		idx++
	}
	if req.VisibilitySec != nil {
		if *req.VisibilitySec < 1 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "visibilitySec must be >= 1"})
		}
		sets = append(sets, "visibility_sec=$"+strconv.Itoa(idx))
		args = append(args, *req.VisibilitySec)
		idx++
	}
	if req.Enabled != nil {
		sets = append(sets, "enabled=$"+strconv.Itoa(idx))
		args = append(args, *req.Enabled)
		idx++
	}
	sets = append(sets, "updated_at=NOW()")
	args = append(args, name)

	q := "UPDATE job_queues SET " + joinComma(sets) + " WHERE name=$" + strconv.Itoa(idx)
	tag, err := h.db.Pool.Exec(c.Context(), q, args...)
	if err != nil {
		log.Error().Err(err).Str("queue", name).Msg("update queue failed")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "queue not found"})
	}

	// Restart the consumer so concurrency/enabled changes take effect.
	// Reads the freshly-saved row back from DB.
	h.queue.StopQueue(name)
	if def, gerr := h.queue.GetQueue(c.Context(), name); gerr == nil && def.Enabled {
		if startErr := h.queue.StartQueue(context.Background(), def); startErr != nil {
			log.Error().Err(startErr).Str("queue", name).Msg("StartQueue failed after update")
		}
	}

	return c.JSON(fiber.Map{"data": fiber.Map{"name": name, "updated": true}})
}

// joinComma is a tiny string helper kept local to the file. Avoids the
// reflective overhead of strings.Join for our small slice.
func joinComma(ss []string) string {
	out := ""
	for i, s := range ss {
		if i > 0 {
			out += ", "
		}
		out += s
	}
	return out
}

// DeleteQueue removes the queue config and stops its consumer. Existing
// items (PG backend) are cascade-deleted by FK.
func (h *Handler) DeleteQueue(c *fiber.Ctx) error {
	name := c.Params("name")
	h.queue.StopQueue(name)
	_, err := h.db.Pool.Exec(c.Context(), `DELETE FROM job_queues WHERE name=$1`, name)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ─────────────────────────────────────────────────────────────────────────────
// Producer API + job ops
// ─────────────────────────────────────────────────────────────────────────────

type enqueueRequest struct {
	Payload        map[string]interface{} `json:"payload"`
	IdempotencyKey string                 `json:"idempotencyKey"`
	Priority       int                    `json:"priority"`
}

// EnqueueJob accepts a single job payload and hands it to the backend.
// On idempotency-key conflict, returns the existing jobID with
// duplicate=true — callers may treat this as success.
func (h *Handler) EnqueueJob(c *fiber.Ctx) error {
	var req enqueueRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	if req.Payload == nil {
		req.Payload = map[string]interface{}{}
	}

	res, err := h.queue.Producer().Enqueue(c.Context(), c.Params("name"), queue.EnqueueRequest{
		Payload:        req.Payload,
		IdempotencyKey: req.IdempotencyKey,
		Priority:       req.Priority,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{
		"jobId":     res.JobID,
		"duplicate": res.Duplicate,
	})
}

// ListJobs returns jobs for a queue, filtered by status.
// Works only for PG-backed queues (other backends keep state in the broker,
// not in our DB — except for DLQ rows, which all backends mirror into PG).
func (h *Handler) ListJobs(c *fiber.Ctx) error {
	name := c.Params("name")
	status := c.Query("status", "")
	limitQ := c.Query("limit", "100")
	limit, err := strconv.Atoi(limitQ)
	if err != nil || limit < 1 || limit > 1000 {
		limit = 100
	}

	sql := `SELECT id, status, attempts, priority, idempotency_key, last_error,
	               visible_after, created_at, completed_at
	        FROM job_queue_items WHERE queue_name=$1`
	args := []interface{}{name}
	if status != "" {
		sql += ` AND status=$2`
		args = append(args, status)
	}
	sql += ` ORDER BY created_at DESC LIMIT ` + strconv.Itoa(limit)

	rows, err := h.db.Pool.Query(c.Context(), sql, args...)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	type jobRow struct {
		ID             string      `json:"id"`
		Status         string      `json:"status"`
		Attempts       int         `json:"attempts"`
		Priority       int         `json:"priority"`
		IdempotencyKey *string     `json:"idempotencyKey,omitempty"`
		LastError      *string     `json:"lastError,omitempty"`
		VisibleAfter   interface{} `json:"visibleAfter"`
		CreatedAt      interface{} `json:"createdAt"`
		CompletedAt    interface{} `json:"completedAt,omitempty"`
	}
	var out []jobRow
	for rows.Next() {
		var r jobRow
		if err := rows.Scan(&r.ID, &r.Status, &r.Attempts, &r.Priority, &r.IdempotencyKey, &r.LastError,
			&r.VisibleAfter, &r.CreatedAt, &r.CompletedAt); err != nil {
			continue
		}
		out = append(out, r)
	}
	return c.JSON(fiber.Map{"data": out})
}

// QueueStats returns counts grouped by status plus the oldest-pending age.
func (h *Handler) QueueStats(c *fiber.Ctx) error {
	name := c.Params("name")

	type row struct {
		Status string
		Count  int
	}
	rows, err := h.db.Pool.Query(c.Context(),
		`SELECT status, COUNT(*) FROM job_queue_items WHERE queue_name=$1 GROUP BY status`,
		name,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()
	stats := map[string]int{"PENDING": 0, "PROCESSING": 0, "COMPLETED": 0, "FAILED": 0, "DLQ": 0}
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.Status, &r.Count); err == nil {
			stats[r.Status] = r.Count
		}
	}

	// Oldest pending age (seconds). Null-safe — COALESCE returns 0 when empty.
	var oldestSec float64
	_ = h.db.Pool.QueryRow(c.Context(), `
		SELECT COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))), 0)
		FROM job_queue_items WHERE queue_name=$1 AND status='PENDING'
	`, name).Scan(&oldestSec)

	return c.JSON(fiber.Map{"data": fiber.Map{
		"counts":           stats,
		"oldestPendingSec": oldestSec,
	}})
}

// RetryJob moves a FAILED/DLQ job back to PENDING (resets visible_after).
// PG-backend only. For other backends, producer should re-enqueue from
// source of truth.
func (h *Handler) RetryJob(c *fiber.Ctx) error {
	name := c.Params("name")
	id := c.Params("id")
	tag, err := h.db.Pool.Exec(c.Context(), `
		UPDATE job_queue_items
		SET status='PENDING', attempts=0, visible_after=NOW(), last_error=NULL,
		    locked_by=NULL, locked_until=NULL, completed_at=NULL
		WHERE id=$1 AND queue_name=$2 AND status IN ('FAILED','DLQ','COMPLETED')
	`, id, name)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "job not found or not in retryable state"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// DeleteJob permanently removes one job row (PG backend only).
func (h *Handler) DeleteJob(c *fiber.Ctx) error {
	name := c.Params("name")
	id := c.Params("id")
	_, err := h.db.Pool.Exec(c.Context(),
		`DELETE FROM job_queue_items WHERE id=$1 AND queue_name=$2`, id, name,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}
