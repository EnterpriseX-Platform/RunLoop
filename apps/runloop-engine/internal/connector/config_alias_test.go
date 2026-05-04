package connector

import "testing"

func TestPickStr_FirstNonEmpty(t *testing.T) {
	cfg := map[string]interface{}{"webhookUrl": "u1", "webhook_url": "u2"}
	if v := pickStr(cfg, "webhook_url", "webhookUrl"); v != "u2" {
		t.Errorf("expected u2 (first key wins), got %q", v)
	}
	if v := pickStr(cfg, "webhookUrl", "webhook_url"); v != "u1" {
		t.Errorf("expected u1 (first key wins), got %q", v)
	}
}

func TestPickStr_FallsThroughEmpty(t *testing.T) {
	cfg := map[string]interface{}{"a": "", "b": "found", "c": "other"}
	if v := pickStr(cfg, "a", "b", "c"); v != "found" {
		t.Errorf("expected 'found', got %q", v)
	}
}

func TestPickStr_AllMissingOrEmpty(t *testing.T) {
	cfg := map[string]interface{}{"x": ""}
	if v := pickStr(cfg, "x", "y"); v != "" {
		t.Errorf("expected empty, got %q", v)
	}
}

func TestPickStr_NonString(t *testing.T) {
	cfg := map[string]interface{}{"a": 42, "b": "ok"}
	if v := pickStr(cfg, "a", "b"); v != "ok" {
		t.Errorf("expected 'ok' (skip non-string), got %q", v)
	}
}

func TestPickBool_FirstFound(t *testing.T) {
	cfg := map[string]interface{}{"useTLS": true, "use_tls": false}
	if v := pickBool(cfg, false, "use_tls", "useTLS"); v != false {
		t.Errorf("expected false (first key wins), got %v", v)
	}
}

func TestPickBool_Default(t *testing.T) {
	cfg := map[string]interface{}{}
	if v := pickBool(cfg, true, "x"); v != true {
		t.Errorf("expected default true, got %v", v)
	}
}

func TestPickInt_AcceptsTypes(t *testing.T) {
	cases := []struct {
		val  interface{}
		want int
	}{
		{42, 42},
		{int64(7), 7},
		{float64(3306.0), 3306},
		{"587", 587},
		{"oops", 0}, // falls to default
		{nil, 0},
	}
	for _, c := range cases {
		got := pickInt(map[string]interface{}{"k": c.val}, 0, "k")
		if got != c.want {
			t.Errorf("pickInt(%v) = %d, want %d", c.val, got, c.want)
		}
	}
}

func TestPickInt_Default(t *testing.T) {
	if v := pickInt(map[string]interface{}{}, 99, "x"); v != 99 {
		t.Errorf("expected 99, got %d", v)
	}
}

// Slack: UI emits camelCase, validator must still accept it.
func TestSlackConnector_AcceptsCamelCase(t *testing.T) {
	c := NewSlackConnector()
	cfg := map[string]interface{}{
		"webhookUrl": "https://hooks.slack.com/services/X/Y/Z",
		"channel":    "#alerts",
	}
	if err := c.ValidateConfig(cfg); err != nil {
		t.Fatalf("UI-format config rejected: %v", err)
	}
}

func TestSlackConnector_AcceptsSnakeCase(t *testing.T) {
	c := NewSlackConnector()
	cfg := map[string]interface{}{
		"webhook_url": "https://hooks.slack.com/services/X/Y/Z",
	}
	if err := c.ValidateConfig(cfg); err != nil {
		t.Fatalf("snake-case config rejected: %v", err)
	}
}

func TestSlackConnector_RequiresURL(t *testing.T) {
	c := NewSlackConnector()
	if err := c.ValidateConfig(map[string]interface{}{"channel": "#x"}); err == nil {
		t.Fatalf("expected error for missing webhook url")
	}
}

func TestEmailConnector_AcceptsCamelCase(t *testing.T) {
	c := NewEmailConnector()
	cfg := map[string]interface{}{
		"smtpHost":     "smtp.example.com",
		"smtpUser":     "u",
		"smtpPassword": "p",
		"fromAddress":  "noreply@example.com",
		"smtpPort":     "587",
	}
	if err := c.ValidateConfig(cfg); err != nil {
		t.Fatalf("UI-format config rejected: %v", err)
	}
}

func TestEmailConnector_AcceptsSnakeCase(t *testing.T) {
	c := NewEmailConnector()
	cfg := map[string]interface{}{
		"host":     "smtp.example.com",
		"username": "u",
		"password": "p",
		"from":     "noreply@example.com",
	}
	if err := c.ValidateConfig(cfg); err != nil {
		t.Fatalf("snake-case config rejected: %v", err)
	}
}

func TestEmailConnector_MissingHostFails(t *testing.T) {
	c := NewEmailConnector()
	cfg := map[string]interface{}{
		"username": "u",
		"password": "p",
		"from":     "x@y.com",
	}
	if err := c.ValidateConfig(cfg); err == nil {
		t.Fatal("expected host required error")
	}
}

func TestDatabaseConnector_AcceptsCamelCaseDbType(t *testing.T) {
	c := NewDatabaseConnector()
	cfg := map[string]interface{}{
		"dbType":   "postgres",
		"host":     "db.example.com",
		"database": "app",
		"username": "u",
		"password": "p",
	}
	if err := c.ValidateConfig(cfg); err != nil {
		t.Fatalf("camel-case dbType rejected: %v", err)
	}
}

func TestDatabaseConnector_AcceptsConnectionStringMode(t *testing.T) {
	c := NewDatabaseConnector()
	cfg := map[string]interface{}{
		"useConnectionString": true,
		"connectionString":    "postgres://u:p@h/d",
		"dbType":              "postgres",
	}
	if err := c.ValidateConfig(cfg); err != nil {
		t.Fatalf("connection-string mode rejected: %v", err)
	}
}

func TestDatabaseConnector_RejectsBadType(t *testing.T) {
	c := NewDatabaseConnector()
	cfg := map[string]interface{}{
		"dbType":   "oracle",
		"host":     "h",
		"database": "d",
		"username": "u",
		"password": "p",
	}
	if err := c.ValidateConfig(cfg); err == nil {
		t.Fatal("expected unsupported-type error")
	}
}
