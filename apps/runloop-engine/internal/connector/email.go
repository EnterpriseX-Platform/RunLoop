package connector

import (
	"context"
	"fmt"
	"net/smtp"
	"strings"
)

// EmailConnector implements SMTP email sending
type EmailConnector struct {
	host     string
	port     string
	username string
	password string
	from     string
	useTLS   bool
}

// NewEmailConnector creates a new email connector
func NewEmailConnector() *EmailConnector {
	return &EmailConnector{
		port:   "587",
		useTLS: true,
	}
}

// Metadata returns connector metadata
func (e *EmailConnector) Metadata() ConnectorMetadata {
	return ConnectorMetadata{
		Type:        TypeEmail,
		Name:        "Email (SMTP)",
		Description: "Send emails via SMTP",
		Category:    CategoryNotification,
		Icon:        "mail",
		Version:     "1.0.0",
		ConfigSchema: ConfigSchema{
			Fields: []ConfigField{
				{
					Name:        "host",
					Type:        "string",
					Label:       "SMTP Host",
					Description: "SMTP server hostname (e.g., smtp.gmail.com)",
					Required:    true,
				},
				{
					Name:        "port",
					Type:        "string",
					Label:       "SMTP Port",
					Description: "SMTP server port (default: 587)",
					Required:    false,
				},
				{
					Name:        "username",
					Type:        "string",
					Label:       "Username",
					Description: "SMTP username (usually your email)",
					Required:    true,
				},
				{
					Name:        "password",
					Type:        "string",
					Label:       "Password",
					Description: "SMTP password or app-specific password",
					Required:    true,
					Secret:      true,
				},
				{
					Name:        "from",
					Type:        "string",
					Label:       "From Address",
					Description: "Default sender email address",
					Required:    true,
				},
				{
					Name:        "use_tls",
					Type:        "boolean",
					Label:       "Use TLS",
					Description: "Use TLS encryption (recommended)",
					Required:    false,
				},
			},
		},
		SupportsActions: true,
	}
}

// ValidateConfig validates the configuration. Accepts both snake_case
// (canonical) and camelCase (UI flow editor) field names.
func (e *EmailConnector) ValidateConfig(config map[string]interface{}) error {
	checks := []struct {
		label   string
		aliases []string
	}{
		{"host", []string{"host", "smtpHost", "smtp_host"}},
		{"username", []string{"username", "smtpUser", "smtp_user", "user"}},
		{"password", []string{"password", "smtpPassword", "smtp_password", "pass"}},
		{"from", []string{"from", "fromAddress", "from_address"}},
	}
	for _, c := range checks {
		if pickStr(config, c.aliases...) == "" {
			return fmt.Errorf("%s is required", c.label)
		}
	}
	return nil
}

// Initialize initializes the connector
func (e *EmailConnector) Initialize(ctx context.Context, config map[string]interface{}) error {
	if err := e.ValidateConfig(config); err != nil {
		return err
	}

	e.host = pickStr(config, "host", "smtpHost", "smtp_host")
	e.username = pickStr(config, "username", "smtpUser", "smtp_user", "user")
	e.password = pickStr(config, "password", "smtpPassword", "smtp_password", "pass")
	e.from = pickStr(config, "from", "fromAddress", "from_address")

	if port := pickStr(config, "port", "smtpPort", "smtp_port"); port != "" {
		e.port = port
	} else if p := pickInt(config, 0, "port", "smtpPort", "smtp_port"); p > 0 {
		e.port = fmt.Sprintf("%d", p)
	}

	e.useTLS = pickBool(config, e.useTLS, "use_tls", "useTLS", "tls", "useTls")
	return nil
}

// HealthCheck checks if the connector is healthy
func (e *EmailConnector) HealthCheck(ctx context.Context) error {
	// Try to connect to SMTP server
	addr := e.host + ":" + e.port
	conn, err := smtp.Dial(addr)
	if err != nil {
		return fmt.Errorf("failed to connect to SMTP server: %w", err)
	}
	defer conn.Close()
	return nil
}

// Close closes the connector
func (e *EmailConnector) Close() error {
	return nil
}

// GetActions returns available actions
func (e *EmailConnector) GetActions() []ActionDefinition {
	return []ActionDefinition{
		{
			Name:        "send_email",
			Label:       "Send Email",
			Description: "Send an email to one or more recipients",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "to",
						Type:        "string",
						Label:       "To",
						Description: "Recipient email address(es), comma-separated for multiple",
						Required:    true,
					},
					{
						Name:        "cc",
						Type:        "string",
						Label:       "CC",
						Description: "CC recipients, comma-separated",
						Required:    false,
					},
					{
						Name:        "bcc",
						Type:        "string",
						Label:       "BCC",
						Description: "BCC recipients, comma-separated",
						Required:    false,
					},
					{
						Name:        "subject",
						Type:        "string",
						Label:       "Subject",
						Description: "Email subject",
						Required:    true,
					},
					{
						Name:        "body",
						Type:        "string",
						Label:       "Body",
						Description: "Email body (plain text or HTML)",
						Required:    true,
					},
					{
						Name:        "html",
						Type:        "boolean",
						Label:       "Is HTML",
						Description: "Send as HTML email",
						Required:    false,
					},
					{
						Name:        "from",
						Type:        "string",
						Label:       "From Address",
						Description: "Override sender address",
						Required:    false,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "success",
						Type:        "boolean",
						Label:       "Success",
						Required:    true,
					},
					{
						Name:        "message_id",
						Type:        "string",
						Label:       "Message ID",
						Required:    false,
					},
				},
			},
		},
		{
			Name:        "send_execution_report",
			Label:       "Send Execution Report",
			Description: "Send formatted execution status email",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "to",
						Type:        "string",
						Label:       "To",
						Description: "Recipient email address",
						Required:    true,
					},
					{
						Name:        "execution_id",
						Type:        "string",
						Label:       "Execution ID",
						Required:    true,
					},
					{
						Name:        "scheduler_name",
						Type:        "string",
						Label:       "Scheduler Name",
						Required:    true,
					},
					{
						Name:        "status",
						Type:        "select",
						Label:       "Status",
						Options:     []string{"success", "failure", "started"},
						Required:    true,
					},
					{
						Name:        "logs",
						Type:        "string",
						Label:       "Execution Logs",
						Required:    false,
					},
				},
			},
		},
	}
}

// ExecuteAction executes an action
func (e *EmailConnector) ExecuteAction(ctx context.Context, action string, params map[string]interface{}) (*ActionResult, error) {
	switch action {
	case "send_email":
		return e.sendEmail(ctx, params)
	case "send_execution_report":
		return e.sendExecutionReport(ctx, params)
	default:
		return nil, fmt.Errorf("unknown action: %s", action)
	}
}

func (e *EmailConnector) sendEmail(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	to := params["to"].(string)
	subject := params["subject"].(string)
	body := params["body"].(string)
	
	from := e.from
	if fromOverride, ok := params["from"].(string); ok && fromOverride != "" {
		from = fromOverride
	}

	// Build recipients list
	var recipients []string
	recipients = append(recipients, strings.Split(to, ",")...)
	
	if cc, ok := params["cc"].(string); ok && cc != "" {
		recipients = append(recipients, strings.Split(cc, ",")...)
	}
	if bcc, ok := params["bcc"].(string); ok && bcc != "" {
		recipients = append(recipients, strings.Split(bcc, ",")...)
	}

	// Clean up recipients
	for i := range recipients {
		recipients[i] = strings.TrimSpace(recipients[i])
	}

	// Determine if HTML
	isHTML := false
	if html, ok := params["html"].(bool); ok {
		isHTML = html
	}

	// Build message
	var msg strings.Builder
	
	// Headers
	msg.WriteString(fmt.Sprintf("From: %s\r\n", from))
	msg.WriteString(fmt.Sprintf("To: %s\r\n", to))
	
	if cc, ok := params["cc"].(string); ok && cc != "" {
		msg.WriteString(fmt.Sprintf("Cc: %s\r\n", cc))
	}
	
	msg.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	
	if isHTML {
		msg.WriteString("MIME-Version: 1.0\r\n")
		msg.WriteString("Content-Type: text/html; charset=\"UTF-8\"\r\n")
	}
	
	msg.WriteString("\r\n")
	msg.WriteString(body)

	// Send email
	addr := e.host + ":" + e.port
	auth := smtp.PlainAuth("", e.username, e.password, e.host)

	err := smtp.SendMail(addr, auth, from, recipients, []byte(msg.String()))
	if err != nil {
		return &ActionResult{
			Success: false,
			Error:   err.Error(),
		}, nil
	}

	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"success": true,
		},
	}, nil
}

func (e *EmailConnector) sendExecutionReport(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	status := params["status"].(string)
	executionID := params["execution_id"].(string)
	schedulerName := params["scheduler_name"].(string)

	var subject, body, statusColor string
	switch status {
	case "success":
		subject = fmt.Sprintf("✅ [%s] Execution Successful", schedulerName)
		statusColor = "#28a745"
	case "failure":
		subject = fmt.Sprintf("❌ [%s] Execution Failed", schedulerName)
		statusColor = "#dc3545"
	default:
		subject = fmt.Sprintf("🚀 [%s] Execution Started", schedulerName)
		statusColor = "#007bff"
	}

	body = fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: %s; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
        .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 5px 5px; }
        .detail { margin: 10px 0; }
        .label { font-weight: bold; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>Execution Report: %s</h2>
        </div>
        <div class="content">
            <div class="detail"><span class="label">Scheduler:</span> %s</div>
            <div class="detail"><span class="label">Execution ID:</span> %s</div>
            <div class="detail"><span class="label">Status:</span> %s</div>
        </div>
    </div>
</body>
</html>`, statusColor, schedulerName, schedulerName, executionID, strings.ToUpper(status))

	return e.sendEmail(ctx, map[string]interface{}{
		"to":       params["to"],
		"subject":  subject,
		"body":     body,
		"html":     true,
	})
}
