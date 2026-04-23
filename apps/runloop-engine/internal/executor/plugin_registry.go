package executor

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"

	"github.com/runloop/runloop-engine/internal/db"
	"github.com/runloop/runloop-engine/internal/models"
)

// PluginManifest describes a third-party node type. The UI renders the
// editor form from Inputs, the engine dispatches the node by POSTing to
// Handler.URL when the flow reaches it.
//
// Fields intentionally mirror a small subset of JSON Schema so the editor
// can generate forms without shipping a component per plugin.
type PluginManifest struct {
	Name        string         `json:"name"`        // logical id — unique, must not collide with built-in JobTypes
	Version     string         `json:"version"`
	DisplayName string         `json:"displayName"`
	Description string         `json:"description"`
	Category    string         `json:"category"`    // "Flow Control" | "Executors" | "Notifications" | "Utilities" | custom
	Icon        string         `json:"icon"`        // lucide icon name, e.g. "credit-card"
	Color       string         `json:"color"`       // hex, e.g. "#635BFF"

	Inputs  []PluginField     `json:"inputs"`
	Outputs []PluginField     `json:"outputs"`

	Handler PluginHandler     `json:"handler"`
}

// PluginField is one configurable property on the node (rendered as a form
// field in the properties panel).
type PluginField struct {
	Name        string  `json:"name"`
	Label       string  `json:"label,omitempty"`
	Type        string  `json:"type"`        // string | number | boolean | select | json | code
	Required    bool    `json:"required,omitempty"`
	Placeholder string  `json:"placeholder,omitempty"`
	Description string  `json:"description,omitempty"`
	Default     any     `json:"default,omitempty"`
	Options     []struct {
		Value string `json:"value"`
		Label string `json:"label"`
	} `json:"options,omitempty"` // for select
}

// PluginHandler picks how the engine invokes the plugin. Only "http" is
// supported in v1 — keeps the threat model simple and makes plugins
// language-agnostic.
type PluginHandler struct {
	Kind         string `json:"kind"`              // only "http" for now
	URL          string `json:"url"`               // POST target
	SecretHeader string `json:"secretHeader,omitempty"` // defaults to X-Plugin-Secret
	TimeoutSec   int    `json:"timeoutSec,omitempty"`   // defaults to 30
}

// PluginRegistry is a concurrent cache of installed plugins keyed by name.
// Loaded from the DB on startup; refreshed whenever install/uninstall runs.
type PluginRegistry struct {
	db     *db.Postgres
	mu     sync.RWMutex
	byName map[string]*loadedPlugin
	http   *http.Client
}

type loadedPlugin struct {
	Manifest   PluginManifest
	AuthSecret string
	Enabled    bool
}

// NewPluginRegistry constructs a registry and performs the initial load.
// Nil db is supported for tests — the registry just stays empty.
func NewPluginRegistry(pg *db.Postgres) *PluginRegistry {
	r := &PluginRegistry{
		db:     pg,
		byName: map[string]*loadedPlugin{},
		http:   &http.Client{Timeout: 60 * time.Second}, // per-call override below
	}
	return r
}

// Reload scans the `plugins` table and rebuilds the in-memory map. Safe to
// call any number of times; lives in its own goroutine-safe lock.
func (r *PluginRegistry) Reload(ctx context.Context) error {
	if r.db == nil {
		return nil
	}
	rows, err := r.db.Pool.Query(ctx, `SELECT name, manifest, auth_secret, enabled FROM plugins`)
	if err != nil {
		return fmt.Errorf("plugin registry load: %w", err)
	}
	defer rows.Close()

	next := map[string]*loadedPlugin{}
	for rows.Next() {
		var name string
		var manifestJSON []byte
		var authSecret *string
		var enabled bool
		if err := rows.Scan(&name, &manifestJSON, &authSecret, &enabled); err != nil {
			continue
		}
		var m PluginManifest
		if err := json.Unmarshal(manifestJSON, &m); err != nil {
			log.Error().Err(err).Str("plugin", name).Msg("skipping plugin with invalid manifest")
			continue
		}
		p := &loadedPlugin{Manifest: m, Enabled: enabled}
		if authSecret != nil {
			p.AuthSecret = *authSecret
		}
		next[strings.ToLower(name)] = p
	}

	r.mu.Lock()
	r.byName = next
	r.mu.Unlock()

	log.Info().Int("count", len(next)).Msg("plugin registry reloaded")
	return nil
}

// Lookup returns the plugin matching a node's `type` field. Returns nil if
// not installed or disabled. Case-insensitive.
func (r *PluginRegistry) Lookup(nodeType string) *loadedPlugin {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p := r.byName[strings.ToLower(nodeType)]
	if p == nil || !p.Enabled {
		return nil
	}
	return p
}

// All returns a snapshot list for the list-endpoint / UI palette. Caller
// must not mutate.
func (r *PluginRegistry) All() []PluginManifest {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]PluginManifest, 0, len(r.byName))
	for _, p := range r.byName {
		if p.Enabled {
			out = append(out, p.Manifest)
		}
	}
	return out
}

// PluginDispatchRequest is the payload the engine sends to every plugin
// handler. Kept stable so plugin authors can rely on the shape.
type PluginDispatchRequest struct {
	NodeID      string                 `json:"nodeId"`
	ExecutionID string                 `json:"executionId"`
	ProjectID   string                 `json:"projectId"`
	Config      map[string]interface{} `json:"config"`
	Variables   map[string]interface{} `json:"variables,omitempty"`
}

// PluginDispatchResponse — plugin replies with this. Missing success
// defaults to false so silent failures don't pass.
type PluginDispatchResponse struct {
	Success bool                   `json:"success"`
	Output  map[string]interface{} `json:"output"`
	Error   string                 `json:"error,omitempty"`
}

// Dispatch invokes the plugin's HTTP handler. The engine passes through
// context cancellation so long-running calls honor the flow's deadline.
// A non-2xx response is treated as failure without attempting to parse a
// success envelope — plugin authors should return JSON errors with 200.
func (r *PluginRegistry) Dispatch(ctx context.Context, p *loadedPlugin, req PluginDispatchRequest) (*models.JobResult, error) {
	if p.Manifest.Handler.Kind != "http" {
		return nil, fmt.Errorf("plugin handler kind %q not supported (use 'http')", p.Manifest.Handler.Kind)
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	timeout := time.Duration(p.Manifest.Handler.TimeoutSec) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(reqCtx, "POST", p.Manifest.Handler.URL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	if p.AuthSecret != "" {
		headerName := p.Manifest.Handler.SecretHeader
		if headerName == "" {
			headerName = "X-Plugin-Secret"
		}
		httpReq.Header.Set(headerName, p.AuthSecret)
	}

	resp, err := r.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("plugin %s: %w", p.Manifest.Name, err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := fmt.Sprintf("plugin %s HTTP %d: %s", p.Manifest.Name, resp.StatusCode, truncate(string(respBody), 500))
		return &models.JobResult{
			Success:      false,
			ErrorMessage: &msg,
		}, nil
	}

	var dr PluginDispatchResponse
	if err := json.Unmarshal(respBody, &dr); err != nil {
		// Tolerate plugins that return raw JSON as the output — wrap it.
		var raw map[string]interface{}
		if jerr := json.Unmarshal(respBody, &raw); jerr == nil {
			return &models.JobResult{Success: true, Output: raw}, nil
		}
		msg := fmt.Sprintf("plugin %s: invalid response: %v", p.Manifest.Name, err)
		return &models.JobResult{Success: false, ErrorMessage: &msg}, nil
	}

	result := &models.JobResult{Success: dr.Success, Output: dr.Output}
	if dr.Error != "" {
		result.ErrorMessage = &dr.Error
	}
	return result, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
