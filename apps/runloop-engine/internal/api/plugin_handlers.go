package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"

	"github.com/runloop/runloop-engine/internal/executor"
	"github.com/runloop/runloop-engine/internal/idgen"
)

// builtInNodeTypes is the set of reserved names that plugins cannot use.
// Keep in sync with models.JobType constants; the check is case-insensitive.
var builtInNodeTypes = []string{
	"HTTP", "DATABASE", "SHELL", "PYTHON", "NODEJS", "DOCKER", "SLACK", "EMAIL",
	"START", "END", "CONDITION", "DELAY", "LOOP", "TRANSFORM", "MERGE", "SWITCH",
	"LOG", "SET_VARIABLE", "SUBFLOW", "WEBHOOK_OUT", "WAIT_WEBHOOK",
}

// ListPlugins returns every installed plugin (enabled or not). UI uses this
// to render the palette and the settings page.
func (h *Handler) ListPlugins(c *fiber.Ctx) error {
	rows, err := h.db.Pool.Query(c.Context(), `
		SELECT name, version, manifest, enabled, installed_at
		FROM plugins ORDER BY installed_at DESC
	`)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	type row struct {
		Name        string                 `json:"name"`
		Version     string                 `json:"version"`
		Manifest    map[string]interface{} `json:"manifest"`
		Enabled     bool                   `json:"enabled"`
		InstalledAt interface{}            `json:"installedAt"`
	}
	var out []row
	for rows.Next() {
		var r row
		var mbytes []byte
		if err := rows.Scan(&r.Name, &r.Version, &mbytes, &r.Enabled, &r.InstalledAt); err != nil {
			continue
		}
		_ = json.Unmarshal(mbytes, &r.Manifest)
		out = append(out, r)
	}
	return c.JSON(fiber.Map{"data": out})
}

// InstallPlugin accepts either an inline manifest or a URL to fetch one.
// Validation: required fields, no collision with built-ins, unique name.
func (h *Handler) InstallPlugin(c *fiber.Ctx) error {
	type req struct {
		URL        string                    `json:"url"`
		Manifest   *executor.PluginManifest  `json:"manifest"`
		AuthSecret string                    `json:"authSecret"`
	}
	var body req
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}

	manifest := body.Manifest
	if manifest == nil && body.URL != "" {
		fetched, err := fetchManifest(c.Context(), body.URL)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "fetch manifest: " + err.Error()})
		}
		manifest = fetched
	}
	if manifest == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "provide 'url' or 'manifest'"})
	}

	if err := validateManifest(manifest); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	mbytes, _ := json.Marshal(manifest)
	authSecret := nullIfEmptyStr(body.AuthSecret)
	_, err := h.db.Pool.Exec(c.Context(), `
		INSERT INTO plugins (name, version, manifest, auth_secret, enabled, updated_at)
		VALUES ($1, $2, $3::jsonb, $4, TRUE, NOW())
		ON CONFLICT (name) DO UPDATE SET
		  version = EXCLUDED.version,
		  manifest = EXCLUDED.manifest,
		  auth_secret = COALESCE(EXCLUDED.auth_secret, plugins.auth_secret),
		  updated_at = NOW()
	`, strings.ToLower(manifest.Name), manifest.Version, string(mbytes), authSecret)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	if err := h.plugins.Reload(c.Context()); err != nil {
		log.Error().Err(err).Msg("plugin reload after install failed")
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": manifest})
}

// SetPluginEnabled flips enabled without uninstalling.
func (h *Handler) SetPluginEnabled(c *fiber.Ctx) error {
	name := strings.ToLower(c.Params("name"))
	type req struct {
		Enabled bool `json:"enabled"`
	}
	var body req
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	tag, err := h.db.Pool.Exec(c.Context(),
		`UPDATE plugins SET enabled=$1, updated_at=NOW() WHERE name=$2`, body.Enabled, name,
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if tag.RowsAffected() == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "plugin not found"})
	}
	_ = h.plugins.Reload(c.Context())
	return c.JSON(fiber.Map{"success": true})
}

// UninstallPlugin removes the row + reloads. Flows using this plugin's
// nodes will start failing on next execution — by design; surface it in UI
// with a warning before allowing uninstall.
func (h *Handler) UninstallPlugin(c *fiber.Ctx) error {
	name := strings.ToLower(c.Params("name"))
	if _, err := h.db.Pool.Exec(c.Context(), `DELETE FROM plugins WHERE name=$1`, name); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	_ = h.plugins.Reload(c.Context())
	return c.JSON(fiber.Map{"success": true})
}

// TestPlugin invokes the handler with an arbitrary test payload so the
// user can verify connectivity + auth without wiring the node into a flow.
func (h *Handler) TestPlugin(c *fiber.Ctx) error {
	name := strings.ToLower(c.Params("name"))
	type req struct {
		Config map[string]interface{} `json:"config"`
	}
	var body req
	_ = c.BodyParser(&body)

	p := h.plugins.Lookup(name)
	if p == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "plugin not found or disabled"})
	}
	if body.Config == nil {
		body.Config = map[string]interface{}{}
	}
	res, err := h.plugins.Dispatch(c.Context(), p, executor.PluginDispatchRequest{
		NodeID:      "test",
		ExecutionID: "test",
		ProjectID:   c.Query("projectId", "test"),
		Config:      body.Config,
	})
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"result": res})
}

// ─────────────────────────────────────────────────────────────────────────
// Node templates (L1 — preset configs)
// ─────────────────────────────────────────────────────────────────────────

// ListTemplates returns project-scoped and global templates. Global rows
// (project_id IS NULL) show up for every project.
func (h *Handler) ListTemplates(c *fiber.Ctx) error {
	projectID := c.Query("projectId")
	var rows interface {
		Next() bool
		Scan(...any) error
		Close()
	}
	var err error
	if projectID != "" {
		rows, err = h.db.Pool.Query(c.Context(), `
			SELECT id, project_id, name, description, node_type, config, icon, color, created_at
			FROM node_templates WHERE project_id=$1 OR project_id IS NULL
			ORDER BY created_at DESC
		`, projectID)
	} else {
		rows, err = h.db.Pool.Query(c.Context(), `
			SELECT id, project_id, name, description, node_type, config, icon, color, created_at
			FROM node_templates ORDER BY created_at DESC
		`)
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	type t struct {
		ID          string                 `json:"id"`
		ProjectID   *string                `json:"projectId"`
		Name        string                 `json:"name"`
		Description *string                `json:"description"`
		NodeType    string                 `json:"nodeType"`
		Config      map[string]interface{} `json:"config"`
		Icon        *string                `json:"icon"`
		Color       *string                `json:"color"`
		CreatedAt   interface{}            `json:"createdAt"`
	}
	var out []t
	for rows.Next() {
		var r t
		var cfgBytes []byte
		if err := rows.Scan(&r.ID, &r.ProjectID, &r.Name, &r.Description, &r.NodeType, &cfgBytes, &r.Icon, &r.Color, &r.CreatedAt); err != nil {
			continue
		}
		_ = json.Unmarshal(cfgBytes, &r.Config)
		out = append(out, r)
	}
	return c.JSON(fiber.Map{"data": out})
}

// CreateTemplate stores a preset. `projectId` can be omitted to create a
// global template (visible to all projects) — restrict this via auth at a
// later date if needed.
func (h *Handler) CreateTemplate(c *fiber.Ctx) error {
	type req struct {
		ProjectID   string                 `json:"projectId"`
		Name        string                 `json:"name"`
		Description string                 `json:"description"`
		NodeType    string                 `json:"nodeType"`
		Config      map[string]interface{} `json:"config"`
		Icon        string                 `json:"icon"`
		Color       string                 `json:"color"`
		CreatedBy   string                 `json:"createdBy"`
	}
	var body req
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid body"})
	}
	if body.Name == "" || body.NodeType == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name and nodeType are required"})
	}

	cfgBytes, _ := json.Marshal(body.Config)
	id := idgen.New()
	_, err := h.db.Pool.Exec(c.Context(), `
		INSERT INTO node_templates (id, project_id, name, description, node_type, config, icon, color, created_by, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, NOW())
	`,
		id, nullIfEmptyStr(body.ProjectID), body.Name, nullIfEmptyStr(body.Description),
		body.NodeType, string(cfgBytes), nullIfEmptyStr(body.Icon), nullIfEmptyStr(body.Color),
		nullIfEmptyStr(body.CreatedBy),
	)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": fiber.Map{"id": id}})
}

// DeleteTemplate removes a template. No soft-delete — they're user-created
// and easy to recreate.
func (h *Handler) DeleteTemplate(c *fiber.Ctx) error {
	id := c.Params("id")
	if _, err := h.db.Pool.Exec(c.Context(), `DELETE FROM node_templates WHERE id=$1`, id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

func fetchManifest(ctx context.Context, url string) (*executor.PluginManifest, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, &manifestError{status: resp.StatusCode, body: string(body)}
	}
	var m executor.PluginManifest
	if err := json.Unmarshal(body, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

type manifestError struct {
	status int
	body   string
}

func (e *manifestError) Error() string {
	return "HTTP " + http.StatusText(e.status) + ": " + e.body
}

func validateManifest(m *executor.PluginManifest) error {
	if m.Name == "" {
		return errBadRequest("manifest.name is required")
	}
	name := strings.ToUpper(strings.TrimSpace(m.Name))
	for _, b := range builtInNodeTypes {
		if b == name {
			return errBadRequest("plugin name collides with built-in type: " + b)
		}
	}
	if m.Version == "" {
		return errBadRequest("manifest.version is required")
	}
	if m.Handler.Kind != "http" {
		return errBadRequest("handler.kind must be 'http' (got " + m.Handler.Kind + ")")
	}
	if m.Handler.URL == "" {
		return errBadRequest("handler.url is required")
	}
	return nil
}

func errBadRequest(msg string) error { return &userError{msg: msg} }

type userError struct{ msg string }

func (e *userError) Error() string { return e.msg }

func nullIfEmptyStr(p string) *string {
	if p == "" {
		return nil
	}
	return &p
}
