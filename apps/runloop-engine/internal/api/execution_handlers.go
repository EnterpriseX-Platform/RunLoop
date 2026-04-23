package api

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
)

// ReplayExecution creates a new execution that re-runs a previous one with
// the same inputs. Returns the new execution id alongside the original.
func (h *Handler) ReplayExecution(c *fiber.Ctx) error {
	executionID := c.Params("id")
	if executionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Execution ID is required",
		})
	}

	userID, _ := c.Locals("userID").(string)

	newExecutionID, err := h.db.ReplayExecution(executionID, userID)
	if err != nil {
		log.Error().Err(err).Str("execution_id", executionID).Msg("Failed to replay execution")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to replay execution",
		})
	}

	return c.JSON(fiber.Map{
		"success":      true,
		"execution_id": newExecutionID,
		"original_id":  executionID,
		"message":      "Execution replay created successfully",
	})
}

// GetRealtimeLogs returns the buffered realtime log rows for an execution.
// The log stream itself is pushed over WebSocket; this endpoint is for
// clients that connected late and want to catch up.
func (h *Handler) GetRealtimeLogs(c *fiber.Ctx) error {
	executionID := c.Params("id")
	if executionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Execution ID is required",
		})
	}

	query := `
		SELECT id, timestamp, level, message
		FROM realtime_logs
		WHERE execution_id = $1
		ORDER BY timestamp ASC
	`

	rows, err := h.db.Pool.Query(c.Context(), query, executionID)
	if err != nil {
		log.Error().Err(err).Msg("Failed to query realtime logs")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch logs",
		})
	}
	defer rows.Close()

	type LogEntry struct {
		ID        string    `json:"id"`
		Timestamp time.Time `json:"timestamp"`
		Level     string    `json:"level"`
		Message   string    `json:"message"`
	}

	var logs []LogEntry
	for rows.Next() {
		var log LogEntry
		if err := rows.Scan(&log.ID, &log.Timestamp, &log.Level, &log.Message); err != nil {
			continue
		}
		logs = append(logs, log)
	}

	return c.JSON(fiber.Map{
		"data": logs,
	})
}
