package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Config is persisted at ~/.runloop/config.
type Config struct {
	BaseURL   string `json:"base_url"`
	Token     string `json:"token,omitempty"`      // JWT from /auth/login
	APIKey    string `json:"api_key,omitempty"`    // Alternative to JWT
	ProjectID string `json:"project_id,omitempty"` // Default project for scoped commands
	Email     string `json:"email,omitempty"`
}

func defaultBaseURL() string {
	if v := os.Getenv("RUNLOOP_URL"); v != "" {
		return v
	}
	return "http://localhost:3000/runloop"
}

func configPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".runloop", "config"), nil
}

// LoadConfig reads config from disk, layering env vars on top.
func LoadConfig() (*Config, error) {
	p, err := configPath()
	if err != nil {
		return nil, err
	}
	var cfg Config
	data, err := os.ReadFile(p)
	if err == nil {
		_ = json.Unmarshal(data, &cfg)
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = defaultBaseURL()
	}
	// Env overrides
	if v := os.Getenv("RUNLOOP_URL"); v != "" {
		cfg.BaseURL = v
	}
	if v := os.Getenv("RUNLOOP_API_KEY"); v != "" {
		cfg.APIKey = v
	}
	if v := os.Getenv("RUNLOOP_PROJECT"); v != "" {
		cfg.ProjectID = v
	}
	return &cfg, nil
}

// Save writes the config to disk with 0600 perms.
func (c *Config) Save() error {
	p, err := configPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0600)
}

// Clear removes stored credentials (but keeps the URL).
func (c *Config) Clear() {
	c.Token = ""
	c.APIKey = ""
	c.Email = ""
	c.ProjectID = ""
}

// AuthHeaders returns headers for an authenticated request.
func (c *Config) AuthHeaders() (map[string]string, error) {
	h := map[string]string{"Content-Type": "application/json"}
	if c.APIKey != "" {
		h["Authorization"] = "Bearer " + c.APIKey
		return h, nil
	}
	if c.Token != "" {
		h["Authorization"] = "Bearer " + c.Token
		h["Cookie"] = "token=" + c.Token
		return h, nil
	}
	return nil, fmt.Errorf("not authenticated — run `runloop login` or set RUNLOOP_API_KEY")
}
