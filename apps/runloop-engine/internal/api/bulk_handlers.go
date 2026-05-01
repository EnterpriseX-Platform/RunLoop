package api

import (
	"time"

	"github.com/gofiber/fiber/v2"
)

// BulkOperationRequest describes a batch action on a set of schedulers.
type BulkOperationRequest struct {
	SchedulerIDs []string `json:"scheduler_ids" validate:"required,min=1"`
	Action       string   `json:"action" validate:"required,oneof=pause resume delete trigger"`
}

// BulkOperations applies one action (pause/resume/delete/trigger) to many
// schedulers in a single call. Individual failures are collected and
// reported alongside the success count.
func (h *Handler) BulkOperations(c *fiber.Ctx) error {
	var req BulkOperationRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if err := h.validate.Struct(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Validation failed",
			"details": err.Error(),
		})
	}

	results := fiber.Map{
		"success": 0,
		"failed":  0,
		"errors":  []string{},
	}

	for _, schedulerID := range req.SchedulerIDs {
		if schedulerID == "" {
			results["failed"] = results["failed"].(int) + 1
			results["errors"] = append(results["errors"].([]string), "Invalid ID: empty string")
			continue
		}

		var err error
		switch req.Action {
		case "pause":
			err = h.updateSchedulerStatus(schedulerID, "PAUSED")
		case "resume":
			err = h.updateSchedulerStatus(schedulerID, "ACTIVE")
		case "delete":
			err = h.deleteScheduler(schedulerID)
		case "trigger":
			_, err = h.scheduler.TriggerJob(c.Context(), schedulerID, nil, nil)
		}

		if err != nil {
			results["failed"] = results["failed"].(int) + 1
			results["errors"] = append(results["errors"].([]string), err.Error())
		} else {
			results["success"] = results["success"].(int) + 1
		}
	}

	return c.JSON(results)
}

func (h *Handler) updateSchedulerStatus(id string, status string) error {
	query := "UPDATE schedulers SET status = $1, updated_at = $2 WHERE id = $3"
	_, err := h.db.Pool.Exec(nil, query, status, time.Now(), id)
	return err
}

func (h *Handler) deleteScheduler(id string) error {
	query := "UPDATE schedulers SET deleted_at = $1 WHERE id = $2"
	_, err := h.db.Pool.Exec(nil, query, time.Now(), id)
	return err
}
