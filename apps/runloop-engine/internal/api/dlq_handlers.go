package api

import (
	"encoding/json"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/runloop/runloop-engine/internal/executor"
	"github.com/runloop/runloop-engine/internal/models"
	"github.com/runloop/runloop-engine/internal/queue"
	"github.com/rs/zerolog/log"
)

// ListDLQ returns DLQ entries for a project.
//
// Query params:
//   - projectId (required)
//   - status   (optional: PENDING|REVIEWING|RESOLVED|DISCARDED|REPLAYED)
//   - reason   (optional: MAX_RETRIES_EXCEEDED|...|DEPENDENCY_FAILED)
//   - limit    (default 50, max 200)
//   - offset   (default 0)
func (h *Handler) ListDLQ(c *fiber.Ctx) error {
	projectID := c.Query("projectId")
	if projectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "projectId is required"})
	}

	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	offset, _ := strconv.Atoi(c.Query("offset", "0"))
	if offset < 0 {
		offset = 0
	}

	var statusPtr *executor.DLQStatus
	if s := c.Query("status"); s != "" {
		st := executor.DLQStatus(strings.ToUpper(s))
		statusPtr = &st
	}
	var reasonPtr *executor.DeadLetterReason
	if r := c.Query("reason"); r != "" {
		rs := executor.DeadLetterReason(strings.ToUpper(r))
		reasonPtr = &rs
	}

	entries, err := h.dlq.GetEntries(c.Context(), projectID, statusPtr, reasonPtr, limit, offset)
	if err != nil {
		log.Error().Err(err).Msg("Failed to list DLQ entries")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list dlq entries"})
	}

	if entries == nil {
		entries = []*executor.DeadLetterEntry{}
	}
	return c.JSON(fiber.Map{"data": entries, "count": len(entries)})
}

// GetDLQStats returns aggregate counts by status for a project.
func (h *Handler) GetDLQStats(c *fiber.Ctx) error {
	projectID := c.Query("projectId")
	if projectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "projectId is required"})
	}
	stats, err := h.dlq.GetStats(c.Context(), projectID)
	if err != nil {
		log.Error().Err(err).Msg("Failed to get DLQ stats")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get dlq stats"})
	}
	return c.JSON(fiber.Map{"data": stats})
}

// GetDLQEntry returns a single entry by id.
func (h *Handler) GetDLQEntry(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	entry, err := h.dlq.GetEntry(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "dlq entry not found"})
	}
	return c.JSON(fiber.Map{"data": entry})
}

// ReviewDLQ flips a PENDING entry to REVIEWING (operator triage).
func (h *Handler) ReviewDLQ(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	reviewer, _ := c.Locals("userID").(string)
	if reviewer == "" {
		reviewer = "system"
	}
	if err := h.dlq.MarkAsReviewing(c.Context(), id, reviewer); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to mark reviewing"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// DiscardDLQ marks a DLQ entry as DISCARDED with an optional reason.
func (h *Handler) DiscardDLQ(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = c.BodyParser(&body)
	if body.Reason == "" {
		body.Reason = "discarded by operator"
	}
	if err := h.dlq.Discard(c.Context(), id, body.Reason); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to discard"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ResolveDLQ marks a DLQ entry as RESOLVED (operator handled it externally).
func (h *Handler) ResolveDLQ(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}
	resolver, _ := c.Locals("userID").(string)
	if resolver == "" {
		resolver = "system"
	}
	var body struct {
		Resolution string `json:"resolution"`
	}
	_ = c.BodyParser(&body)
	if body.Resolution == "" {
		body.Resolution = "resolved by operator"
	}
	if err := h.dlq.Resolve(c.Context(), id, resolver, body.Resolution); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to resolve"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ReplayDLQ re-runs the failed work that produced this DLQ entry.
//
// Routing:
//   - If the entry came from a queue (scheduler_id begins with "queue:"),
//     re-enqueue the original input into that queue. The queue consumer
//     picks it up and runs the bound flow, producing a fresh execution.
//   - Otherwise (real scheduler), call scheduler.TriggerJob with the
//     original input. The scheduler runs its attached flows or its own
//     direct task.
//
// In both cases we mark the DLQ entry REPLAYED and record the new
// execution id so the operator can follow the trail.
func (h *Handler) ReplayDLQ(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "id is required"})
	}

	entry, err := h.dlq.GetEntry(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "dlq entry not found"})
	}
	if entry.Status == executor.DLQReplayed {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error":            "entry already replayed",
			"new_execution_id": entry.NewExecutionID,
		})
	}

	// Decode original_input back into a JSONMap. DLQ stores it as raw bytes
	// because at write time the engine doesn't always have a typed map.
	var input models.JSONMap
	if len(entry.OriginalInput) > 0 {
		_ = json.Unmarshal(entry.OriginalInput, &input)
	}

	var newExecutionID string

	if strings.HasPrefix(entry.SchedulerID, "queue:") {
		queueName := strings.TrimPrefix(entry.SchedulerID, "queue:")
		payload := map[string]interface{}(input)
		if payload == nil {
			payload = map[string]interface{}{}
		}
		// Mark the replay so consumers / observability can tell this isn't
		// fresh user traffic — and so dedupe doesn't collapse it with the
		// original message.
		payload["_replay_of_dlq"] = entry.ID

		res, qerr := h.queue.Producer().Enqueue(c.Context(), queueName, queue.EnqueueRequest{
			Payload:        payload,
			IdempotencyKey: "dlq-replay-" + entry.ID,
		})
		if qerr != nil {
			log.Error().Err(qerr).Str("queue", queueName).Str("dlq_id", entry.ID).Msg("DLQ replay: re-enqueue failed")
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "failed to re-enqueue: " + qerr.Error(),
			})
		}
		// Re-enqueued jobs don't produce an execution id until the consumer
		// picks them up. Use the queue job id as a stable replay reference.
		newExecutionID = "queue-job:" + res.JobID
	} else {
		// Scheduler-backed entry — re-fire through the scheduler so attached
		// flows + direct mode both work the same way they did originally.
		ipStr := c.IP()
		ipPtr := &ipStr
		exec, terr := h.scheduler.TriggerJob(c.Context(), entry.SchedulerID, input, ipPtr)
		if terr != nil {
			log.Error().Err(terr).Str("scheduler_id", entry.SchedulerID).Str("dlq_id", entry.ID).Msg("DLQ replay: trigger failed")
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "failed to trigger scheduler: " + terr.Error(),
			})
		}
		newExecutionID = exec.ID
	}

	if err := h.dlq.MarkAsReplayed(c.Context(), entry.ID, newExecutionID); err != nil {
		log.Error().Err(err).Str("dlq_id", entry.ID).Msg("Replay succeeded but marking DLQ failed")
		// Don't fail the request — the work was started; the marker is just
		// bookkeeping. The operator can still see the new execution.
	}

	return c.JSON(fiber.Map{
		"success":          true,
		"new_execution_id": newExecutionID,
		"dlq_id":           entry.ID,
	})
}
