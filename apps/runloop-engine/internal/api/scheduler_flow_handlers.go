package api

import (
	"context"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
	"github.com/runloop/runloop-engine/internal/idgen"
)

// SchedulerFlowEntry represents a flow attached to a scheduler
type SchedulerFlowEntry struct {
	ID             string    `json:"id"`
	SchedulerID    string    `json:"schedulerId"`
	FlowID         string    `json:"flowId"`
	ExecutionOrder int       `json:"executionOrder"`
	CreatedAt      time.Time `json:"createdAt"`
	// Joined fields from flows table
	FlowName   string  `json:"flowName"`
	FlowType   string  `json:"flowType"`
	FlowJobType *string `json:"flowJobType,omitempty"`
	FlowStatus string  `json:"flowStatus"`
}

// SchedulerFlowEdge represents an edge between two flows in a scheduler
type SchedulerFlowEdge struct {
	ID           string `json:"id"`
	SchedulerID  string `json:"schedulerId"`
	SourceFlowID string `json:"sourceFlowId"`
	TargetFlowID string `json:"targetFlowId"`
	Condition    string `json:"condition"`
}

// AttachFlowsRequest represents the request body for attaching flows
type AttachFlowsRequest struct {
	FlowIDs []string              `json:"flowIds"`
	Edges   []AttachFlowEdgeInput `json:"edges"`
}

// AttachFlowEdgeInput represents an edge in the attach request
type AttachFlowEdgeInput struct {
	SourceFlowID string `json:"sourceFlowId"`
	TargetFlowID string `json:"targetFlowId"`
	Condition    string `json:"condition"`
}

// GetSchedulerFlows returns all flows linked to a scheduler
func (h *Handler) GetSchedulerFlows(c *fiber.Ctx) error {
	ctx := context.Background()

	schedulerID := c.Params("id")
	if schedulerID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid scheduler ID",
		})
	}

	// Query scheduler flows with joined flow data
	query := `
		SELECT sf.id, sf.scheduler_id, sf.flow_id, sf.execution_order, sf.created_at,
		       f.name, f.type, f.job_type, f.status
		FROM scheduler_flows sf
		JOIN flows f ON sf.flow_id = f.id
		WHERE sf.scheduler_id = $1
		ORDER BY sf.execution_order
	`

	rows, err := h.db.Pool.Query(ctx, query, schedulerID)
	if err != nil {
		log.Error().Err(err).Str("scheduler_id", schedulerID).Msg("Failed to query scheduler flows")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch scheduler flows",
		})
	}
	defer rows.Close()

	var flows []SchedulerFlowEntry
	for rows.Next() {
		var entry SchedulerFlowEntry
		err := rows.Scan(
			&entry.ID, &entry.SchedulerID, &entry.FlowID, &entry.ExecutionOrder, &entry.CreatedAt,
			&entry.FlowName, &entry.FlowType, &entry.FlowJobType, &entry.FlowStatus,
		)
		if err != nil {
			log.Error().Err(err).Msg("Failed to scan scheduler flow")
			continue
		}
		flows = append(flows, entry)
	}

	// Query edges for this scheduler
	edgeQuery := `
		SELECT id, scheduler_id, source_flow_id, target_flow_id, condition
		FROM scheduler_flow_edges
		WHERE scheduler_id = $1
	`

	edgeRows, err := h.db.Pool.Query(ctx, edgeQuery, schedulerID)
	if err != nil {
		log.Error().Err(err).Str("scheduler_id", schedulerID).Msg("Failed to query scheduler flow edges")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch scheduler flow edges",
		})
	}
	defer edgeRows.Close()

	var edges []SchedulerFlowEdge
	for edgeRows.Next() {
		var edge SchedulerFlowEdge
		err := edgeRows.Scan(
			&edge.ID, &edge.SchedulerID, &edge.SourceFlowID, &edge.TargetFlowID, &edge.Condition,
		)
		if err != nil {
			log.Error().Err(err).Msg("Failed to scan scheduler flow edge")
			continue
		}
		edges = append(edges, edge)
	}

	return c.JSON(fiber.Map{
		"data": fiber.Map{
			"flows": flows,
			"edges": edges,
		},
	})
}

// AttachFlows replaces all flows and edges for a scheduler
func (h *Handler) AttachFlows(c *fiber.Ctx) error {
	ctx := context.Background()

	schedulerID := c.Params("id")
	if schedulerID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid scheduler ID",
		})
	}

	var req AttachFlowsRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if len(req.FlowIDs) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "At least one flow ID is required",
		})
	}

	// 1. Validate scheduler exists
	var exists bool
	err := h.db.Pool.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM schedulers WHERE id = $1 AND deleted_at IS NULL)",
		schedulerID,
	).Scan(&exists)
	if err != nil || !exists {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Scheduler not found",
		})
	}

	// 2. Validate all flow IDs exist
	for _, flowID := range req.FlowIDs {
		var flowExists bool
		err := h.db.Pool.QueryRow(ctx,
			"SELECT EXISTS(SELECT 1 FROM flows WHERE id = $1)",
			flowID,
		).Scan(&flowExists)
		if err != nil || !flowExists {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": fmt.Sprintf("Flow not found: %s", flowID),
			})
		}
	}

	// 3. Delete existing scheduler_flows and scheduler_flow_edges for this scheduler
	_, err = h.db.Pool.Exec(ctx, "DELETE FROM scheduler_flow_edges WHERE scheduler_id = $1", schedulerID)
	if err != nil {
		log.Error().Err(err).Str("scheduler_id", schedulerID).Msg("Failed to delete existing scheduler flow edges")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update scheduler flows",
		})
	}

	_, err = h.db.Pool.Exec(ctx, "DELETE FROM scheduler_flows WHERE scheduler_id = $1", schedulerID)
	if err != nil {
		log.Error().Err(err).Str("scheduler_id", schedulerID).Msg("Failed to delete existing scheduler flows")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update scheduler flows",
		})
	}

	// 4. Insert new scheduler_flows with execution_order based on array index
	now := time.Now()
	for i, flowID := range req.FlowIDs {
		sfID := idgen.New()
		_, err := h.db.Pool.Exec(ctx,
			`INSERT INTO scheduler_flows (id, scheduler_id, flow_id, execution_order, created_at)
			 VALUES ($1, $2, $3, $4, $5)`,
			sfID, schedulerID, flowID, i, now,
		)
		if err != nil {
			log.Error().Err(err).Str("scheduler_id", schedulerID).Str("flow_id", flowID).Msg("Failed to insert scheduler flow")
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to attach flows",
			})
		}
	}

	// 5. Insert new scheduler_flow_edges
	for _, edge := range req.Edges {
		edgeID := idgen.New()
		_, err := h.db.Pool.Exec(ctx,
			`INSERT INTO scheduler_flow_edges (id, scheduler_id, source_flow_id, target_flow_id, condition)
			 VALUES ($1, $2, $3, $4, $5)`,
			edgeID, schedulerID, edge.SourceFlowID, edge.TargetFlowID, edge.Condition,
		)
		if err != nil {
			log.Error().Err(err).Str("scheduler_id", schedulerID).Msg("Failed to insert scheduler flow edge")
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to attach flow edges",
			})
		}
	}

	log.Info().
		Str("scheduler_id", schedulerID).
		Int("flow_count", len(req.FlowIDs)).
		Int("edge_count", len(req.Edges)).
		Msg("Flows attached to scheduler")

	// Return the updated state
	return h.GetSchedulerFlows(c)
}

// DetachFlow removes a single flow from a scheduler
func (h *Handler) DetachFlow(c *fiber.Ctx) error {
	ctx := context.Background()

	schedulerID := c.Params("id")
	flowID := c.Params("flowId")

	if schedulerID == "" || flowID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid scheduler ID or flow ID",
		})
	}

	// Remove any edges that reference this flow
	_, err := h.db.Pool.Exec(ctx,
		`DELETE FROM scheduler_flow_edges
		 WHERE scheduler_id = $1 AND (source_flow_id = $2 OR target_flow_id = $2)`,
		schedulerID, flowID,
	)
	if err != nil {
		log.Error().Err(err).Str("scheduler_id", schedulerID).Str("flow_id", flowID).Msg("Failed to delete scheduler flow edges")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to detach flow edges",
		})
	}

	// Remove the flow from the scheduler
	result, err := h.db.Pool.Exec(ctx,
		"DELETE FROM scheduler_flows WHERE scheduler_id = $1 AND flow_id = $2",
		schedulerID, flowID,
	)
	if err != nil {
		log.Error().Err(err).Str("scheduler_id", schedulerID).Str("flow_id", flowID).Msg("Failed to delete scheduler flow")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to detach flow",
		})
	}

	if result.RowsAffected() == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Flow not attached to this scheduler",
		})
	}

	log.Info().
		Str("scheduler_id", schedulerID).
		Str("flow_id", flowID).
		Msg("Flow detached from scheduler")

	return c.Status(fiber.StatusNoContent).Send(nil)
}
