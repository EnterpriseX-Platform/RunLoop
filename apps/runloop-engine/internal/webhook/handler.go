package webhook

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"

	"github.com/runloop/runloop-engine/internal/db"
	"github.com/runloop/runloop-engine/internal/models"
	"github.com/runloop/runloop-engine/internal/scheduler"
)

// Handler handles webhook requests
type Handler struct {
	db      *db.Postgres
	manager *scheduler.Manager
}

// NewHandler creates a new webhook handler
func NewHandler(database *db.Postgres, manager *scheduler.Manager) *Handler {
	return &Handler{
		db:      database,
		manager: manager,
	}
}

// WebhookPayload represents the incoming webhook payload
type WebhookPayload struct {
	Event     string          `json:"event"`
	Data      json.RawMessage `json:"data"`
	WebhookID string          `json:"webhook_id"`
}

// TriggerRequest represents a manual trigger request
type TriggerRequest struct {
	SchedulerID string          `json:"scheduler_id" validate:"required"`
	Input       json.RawMessage `json:"input"`
}

// HandleWebhook handles incoming webhook requests
func (h *Handler) HandleWebhook(c *fiber.Ctx) error {
	webhookID := c.Params("id")
	if webhookID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Webhook ID is required",
		})
	}

	// Get webhook from database
	webhook, err := h.db.GetWebhookByID(webhookID)
	if err != nil {
		log.Error().Err(err).Str("webhook_id", webhookID).Msg("Failed to get webhook")
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Webhook not found",
		})
	}

	// Check if webhook is active
	if webhook.Status != "ACTIVE" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "Webhook is inactive",
		})
	}

	// Verify signature if secret is set
	if webhook.Secret != nil && *webhook.Secret != "" {
		signature := c.Get("X-Webhook-Signature")
		if signature == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Missing signature",
			})
		}

		body := c.Body()
		if !verifySignature(body, *webhook.Secret, signature) {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid signature",
			})
		}
	}

	// Update last called timestamp
	h.db.UpdateWebhookLastCalled(webhookID)

	// Trigger scheduler
	if webhook.SchedulerID != nil && *webhook.SchedulerID != "" {
		var input models.JSONMap
		if webhook.CustomPayload != nil {
			json.Unmarshal(webhook.CustomPayload, &input)
		}
		if input == nil {
			input = make(models.JSONMap)
		}

		// Merge with incoming payload
		var payload map[string]interface{}
		if err := c.BodyParser(&payload); err == nil {
			for k, v := range payload {
				input[k] = v
			}
		}

		execution, err := h.manager.TriggerJob(context.Background(), *webhook.SchedulerID, input, nil)
		if err != nil {
			log.Error().Err(err).Str("scheduler_id", *webhook.SchedulerID).Msg("Failed to trigger scheduler")
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to trigger scheduler",
			})
		}

		return c.JSON(fiber.Map{
			"success":      true,
			"execution_id": execution.ID,
			"message":      "Scheduler triggered successfully",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Webhook received",
	})
}

// verifySignature verifies the HMAC signature
func verifySignature(body []byte, secret, signature string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(signature), []byte(expected))
}

// RegisterRoutes registers webhook routes
func (h *Handler) RegisterRoutes(app *fiber.App, basePath string) {
	// Public webhook endpoint (no auth required)
	app.Post(basePath+"/webhooks/:id", h.HandleWebhook)
}
