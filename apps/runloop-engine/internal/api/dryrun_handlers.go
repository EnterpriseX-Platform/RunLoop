package api

import (
	"encoding/json"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
	"github.com/runloop/runloop-engine/internal/idgen"
	"github.com/runloop/runloop-engine/internal/models"
	"github.com/runloop/runloop-engine/internal/worker"
)

// DryRunFlow accepts an ad-hoc flow definition, submits it to the worker pool
// with a short timeout, and returns the execution id. Dry-run executions are
// flagged so they don't get retention-protected and they don't update scheduler
// stats.
func (h *Handler) DryRunFlow(c *fiber.Ctx) error {
	type req struct {
		ProjectID  string             `json:"projectId"`
		FlowConfig *models.FlowConfig `json:"flowConfig"`
		Input      interface{}        `json:"input"`
	}
	var body req
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.FlowConfig == nil || len(body.FlowConfig.Nodes) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "flowConfig with nodes required"})
	}
	if body.ProjectID == "" {
		body.ProjectID = "dry-run"
	}

	executionID := idgen.New()
	now := time.Now()
	schedulerID := "dryrun_" + executionID

	// Persist a RUNNING row so the UI can surface dry-runs in the same
	// Executions list as scheduled runs. The `scheduler_id` FK was relaxed
	// to a plain string, so using the synthetic id is safe. The worker pool
	// updates this row when execution finishes.
	flowIDPtr := flowIDFromConfig(body.FlowConfig)
	inputBytes, _ := json.Marshal(models.JSONMap{"flowConfig": body.FlowConfig})
	tag, err := h.db.Pool.Exec(c.Context(), `
		INSERT INTO executions (id, scheduler_id, project_id, trigger_type, status, started_at, input, flow_id)
		VALUES ($1, $2, $3, 'MANUAL', 'RUNNING', $4, $5::jsonb, $6)
	`, executionID, schedulerID, body.ProjectID, now, string(inputBytes), flowIDPtr)
	if err != nil {
		log.Error().Err(err).Str("execution_id", executionID).Msg("dry-run: failed to create execution row (continuing)")
	} else {
		log.Info().Str("execution_id", executionID).Int64("rows", tag.RowsAffected()).Msg("dry-run: execution row created")
	}

	task := &worker.Task{
		ID:          idgen.New(),
		SchedulerID: schedulerID,
		ProjectID:   body.ProjectID,
		ExecutionID: executionID,
		Type:        models.JobTypeHTTP, // placeholder; flow executor dispatches per-node
		Config: func() models.JSONMap {
			// FlowExecutor reads task.Config["input"] to seed ${{input.X}}.
			// Pass the dry-run body's "input" through so callers can exercise
			// variable substitution from the test endpoint.
			cfg := models.JSONMap{}
			if body.Input != nil {
				cfg["input"] = body.Input
			}
			return cfg
		}(),
		FlowConfig:  body.FlowConfig,
		Timeout:     5 * time.Minute,
		RetryCount:  0,
		TriggerType: models.TriggerTypeManual,
		CreatedAt:   now,
	}

	if err := h.workerPool.Submit(task); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	log.Info().Str("execution_id", executionID).Msg("Dry-run submitted")
	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{
		"success":     true,
		"executionId": executionID,
		"dryRun":      true,
	})
}

// flowIDFromConfig looks for a "flowId" hint embedded in the config. We
// don't strictly need it for dry-runs — callers sometimes include it when
// running an already-saved flow, to preserve the link in the UI.
func flowIDFromConfig(cfg *models.FlowConfig) *string {
	if cfg == nil {
		return nil
	}
	// No such field today; reserved for future use when flowConfig includes
	// self-identifying metadata. Return nil to keep the INSERT working
	// against the nullable column.
	return nil
}
