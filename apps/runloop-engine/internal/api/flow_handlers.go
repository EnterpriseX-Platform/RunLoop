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

// ListFlows returns a list of flows
func (h *Handler) ListFlows(c *fiber.Ctx) error {
	ctx := context.Background()

	projectID := c.Query("projectId")
	status := c.Query("status")
	limit := c.QueryInt("limit", 50)
	offset := c.QueryInt("offset", 0)

	query := `
		SELECT id, name, description, type, job_type, config, flow_config,
		       status, project_id, created_by, created_at, updated_at
		FROM flows
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
		log.Error().Err(err).Msg("Failed to query flows")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch flows",
		})
	}
	defer rows.Close()

	var flows []models.Flow
	for rows.Next() {
		var f models.Flow
		var configJSON, flowConfigJSON []byte

		err := rows.Scan(
			&f.ID, &f.Name, &f.Description, &f.Type, &f.JobType,
			&configJSON, &flowConfigJSON, &f.Status, &f.ProjectID,
			&f.CreatedBy, &f.CreatedAt, &f.UpdatedAt,
		)
		if err != nil {
			log.Error().Err(err).Msg("Failed to scan flow")
			continue
		}

		if len(configJSON) > 0 {
			json.Unmarshal(configJSON, &f.Config)
		}
		if len(flowConfigJSON) > 0 {
			json.Unmarshal(flowConfigJSON, &f.FlowConfig)
		}

		flows = append(flows, f)
	}

	return c.JSON(fiber.Map{
		"data": flows,
	})
}

// GetFlow returns a single flow
func (h *Handler) GetFlow(c *fiber.Ctx) error {
	ctx := context.Background()

	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid flow ID",
		})
	}

	query := `
		SELECT id, name, description, type, job_type, config, flow_config,
		       status, project_id, created_by, created_at, updated_at
		FROM flows
		WHERE id = $1
	`

	var f models.Flow
	var configJSON, flowConfigJSON []byte

	err := h.db.Pool.QueryRow(ctx, query, id).Scan(
		&f.ID, &f.Name, &f.Description, &f.Type, &f.JobType,
		&configJSON, &flowConfigJSON, &f.Status, &f.ProjectID,
		&f.CreatedBy, &f.CreatedAt, &f.UpdatedAt,
	)

	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Flow not found",
		})
	}

	if len(configJSON) > 0 {
		json.Unmarshal(configJSON, &f.Config)
	}
	if len(flowConfigJSON) > 0 {
		json.Unmarshal(flowConfigJSON, &f.FlowConfig)
	}

	return c.JSON(fiber.Map{
		"data": f,
	})
}

// CreateFlow creates a new flow
func (h *Handler) CreateFlow(c *fiber.Ctx) error {
	ctx := context.Background()

	var req models.CreateFlowRequest
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
	flowID := idgen.New()

	// Default status to DRAFT if not provided
	status := req.Status
	if status == "" {
		status = models.FlowStatusDraft
	}

	now := time.Now()

	flow := &models.Flow{
		ID:          flowID,
		Name:        req.Name,
		Description: req.Description,
		Type:        req.Type,
		JobType:     req.JobType,
		Config:      req.Config,
		FlowConfig:  req.FlowConfig,
		Status:      status,
		ProjectID:   req.ProjectID,
		CreatedBy:   userID,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	// Insert into database
	query := `
		INSERT INTO flows (id, name, description, type, job_type, config, flow_config,
		                   status, project_id, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`

	configJSON, _ := json.Marshal(flow.Config)
	flowConfigJSON, _ := json.Marshal(flow.FlowConfig)

	_, err := h.db.Pool.Exec(ctx, query,
		flow.ID, flow.Name, flow.Description, flow.Type, flow.JobType,
		configJSON, flowConfigJSON, flow.Status, flow.ProjectID,
		flow.CreatedBy, flow.CreatedAt, flow.UpdatedAt,
	)

	if err != nil {
		log.Error().Err(err).Msg("Failed to create flow")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create flow",
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"data": flow,
	})
}

// UpdateFlow updates a flow
func (h *Handler) UpdateFlow(c *fiber.Ctx) error {
	ctx := context.Background()

	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid flow ID",
		})
	}

	var req models.UpdateFlowRequest
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
	if req.Type != nil {
		updates = append(updates, "type = $"+string(rune('0'+argCount)))
		args = append(args, *req.Type)
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
	if req.FlowConfig != nil {
		updates = append(updates, "flow_config = $"+string(rune('0'+argCount)))
		flowConfigJSON, _ := json.Marshal(req.FlowConfig)
		args = append(args, flowConfigJSON)
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

	query := "UPDATE flows SET " + joinStrings(updates, ", ") + " WHERE id = $" + string(rune('0'+argCount))

	result, err := h.db.Pool.Exec(ctx, query, args...)
	if err != nil {
		log.Error().Err(err).Msg("Failed to update flow")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update flow",
		})
	}

	if result.RowsAffected() == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Flow not found",
		})
	}

	// Return updated flow
	return h.GetFlow(c)
}

// DeleteFlow deletes a flow
func (h *Handler) DeleteFlow(c *fiber.Ctx) error {
	ctx := context.Background()

	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid flow ID",
		})
	}

	query := `DELETE FROM flows WHERE id = $1`
	result, err := h.db.Pool.Exec(ctx, query, id)
	if err != nil {
		log.Error().Err(err).Msg("Failed to delete flow")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete flow",
		})
	}

	if result.RowsAffected() == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Flow not found",
		})
	}

	return c.Status(fiber.StatusNoContent).Send(nil)
}
