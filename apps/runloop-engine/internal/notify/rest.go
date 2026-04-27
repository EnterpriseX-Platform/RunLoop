package notify

import (
	"strings"

	"github.com/gofiber/fiber/v2"
)

// API exposes REST endpoints for inspecting and test-publishing to channels.
type API struct {
	hub *Hub
}

func NewAPI(hub *Hub) *API { return &API{hub: hub} }

// Register attaches the API routes under /api/channels (group must
// already be JWT-authenticated; the project scope is read from locals).
func (a *API) Register(router fiber.Router) {
	router.Get("/channels", a.list)
	router.Post("/channels/:name/publish", a.publish)
}

// projectIDFor extracts the project scope. API-key tokens populate
// c.Locals("projectID") with the key's bound project; session JWTs (web
// UI) don't, so callers pass ?projectId=. Same pattern as /api/dlq.
func projectIDFor(c *fiber.Ctx) string {
	if pid, _ := c.Locals("projectID").(string); pid != "" {
		return pid
	}
	if pid := c.Query("projectId"); pid != "" {
		return pid
	}
	if pid := c.Query("projectID"); pid != "" {
		return pid
	}
	return ""
}

// list returns active channels for the caller's project, with subscriber counts.
func (a *API) list(c *fiber.Ctx) error {
	projectID := projectIDFor(c)
	if projectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "projectId required (query param or API-key scope)"})
	}
	prefix := projectID + ":"
	out := make([]fiber.Map, 0)
	for key, count := range a.hub.Channels() {
		if !strings.HasPrefix(key, prefix) {
			continue
		}
		out = append(out, fiber.Map{
			"name":        strings.TrimPrefix(key, prefix),
			"subscribers": count,
		})
	}
	return c.JSON(fiber.Map{"data": out, "totalPublishes": a.hub.TotalPublishes()})
}

// publish lets an operator (or the test-publish UI) push a message
// directly without going through a flow. Useful for diagnosing
// subscriber connectivity.
func (a *API) publish(c *fiber.Ctx) error {
	name := c.Params("name")
	if name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name required"})
	}
	var body struct {
		Payload   map[string]interface{} `json:"payload"`
		ProjectID string                 `json:"projectId"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	projectID := projectIDFor(c)
	if projectID == "" {
		projectID = body.ProjectID
	}
	if projectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "projectId required (query, body, or API-key scope)"})
	}
	if body.Payload == nil {
		body.Payload = map[string]interface{}{}
	}
	delivered, err := a.hub.Publish(ChannelKey(projectID, name), body.Payload)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"delivered": delivered, "channel": name})
}
