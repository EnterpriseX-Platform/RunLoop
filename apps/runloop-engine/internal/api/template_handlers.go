package api

import (
	"encoding/json"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
)

// GetJobTemplates returns the catalog of public job templates, optionally
// filtered by `category`.
func (h *Handler) GetJobTemplates(c *fiber.Ctx) error {
	category := c.Query("category")

	query := `
		SELECT id, name, description, type, config, flow_config, is_flow, category, icon
		FROM job_templates
		WHERE is_public = true
	`
	args := []interface{}{}

	if category != "" {
		query += " AND category = $1"
		args = append(args, category)
	}

	query += " ORDER BY category, name"

	rows, err := h.db.Pool.Query(c.Context(), query, args...)
	if err != nil {
		log.Error().Err(err).Msg("Failed to query job templates")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch templates",
		})
	}
	defer rows.Close()

	type JobTemplate struct {
		ID          string          `json:"id"`
		Name        string          `json:"name"`
		Description *string         `json:"description"`
		Type        string          `json:"type"`
		Config      json.RawMessage `json:"config"`
		FlowConfig  json.RawMessage `json:"flowConfig,omitempty"`
		IsFlow      bool            `json:"isFlow"`
		Category    string          `json:"category"`
		Icon        *string         `json:"icon"`
	}

	var templates []JobTemplate
	for rows.Next() {
		var t JobTemplate
		var config, flowConfig []byte
		if err := rows.Scan(&t.ID, &t.Name, &t.Description, &t.Type, &config, &flowConfig, &t.IsFlow, &t.Category, &t.Icon); err != nil {
			continue
		}
		t.Config = config
		t.FlowConfig = flowConfig
		templates = append(templates, t)
	}

	return c.JSON(fiber.Map{
		"data": templates,
	})
}
