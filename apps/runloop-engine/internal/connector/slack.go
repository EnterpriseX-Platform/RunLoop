package connector

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// SlackConnector implements Slack integration
type SlackConnector struct {
	webhookURL string
	token      string
	channel    string
	client     *http.Client
}

// NewSlackConnector creates a new Slack connector
func NewSlackConnector() *SlackConnector {
	return &SlackConnector{
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// Metadata returns connector metadata
func (s *SlackConnector) Metadata() ConnectorMetadata {
	return ConnectorMetadata{
		Type:        TypeSlack,
		Name:        "Slack",
		Description: "Send notifications to Slack channels",
		Category:    CategoryNotification,
		Icon:        "slack",
		Version:     "1.0.0",
		ConfigSchema: ConfigSchema{
			Fields: []ConfigField{
				{
					Name:        "webhook_url",
					Type:        "string",
					Label:       "Webhook URL",
					Description: "Slack Incoming Webhook URL",
					Required:    true,
					Secret:      true,
				},
				{
					Name:        "token",
					Type:        "string",
					Label:       "Bot Token",
					Description: "Slack Bot User OAuth Token (optional, for API actions)",
					Required:    false,
					Secret:      true,
				},
				{
					Name:        "channel",
					Type:        "string",
					Label:       "Default Channel",
					Description: "Default channel to send messages (e.g., #general)",
					Required:    false,
				},
			},
		},
		SupportsWebhook: true,
		SupportsActions: true,
	}
}

// ValidateConfig validates the configuration. Accepts both
// `webhook_url` (canonical / docs) and `webhookUrl` (UI flow editor).
func (s *SlackConnector) ValidateConfig(config map[string]interface{}) error {
	if pickStr(config, "webhook_url", "webhookUrl", "webhookURL") == "" {
		return fmt.Errorf("webhook_url is required")
	}
	return nil
}

// Initialize initializes the connector
func (s *SlackConnector) Initialize(ctx context.Context, config map[string]interface{}) error {
	if err := s.ValidateConfig(config); err != nil {
		return err
	}

	s.webhookURL = pickStr(config, "webhook_url", "webhookUrl", "webhookURL")
	s.token = pickStr(config, "token", "botToken", "bot_token")
	s.channel = pickStr(config, "channel")
	return nil
}

// HealthCheck checks if the connector is healthy
func (s *SlackConnector) HealthCheck(ctx context.Context) error {
	if s.webhookURL == "" {
		return fmt.Errorf("not initialized")
	}
	return nil
}

// Close closes the connector
func (s *SlackConnector) Close() error {
	return nil
}

// GetActions returns available actions
func (s *SlackConnector) GetActions() []ActionDefinition {
	return []ActionDefinition{
		{
			Name:        "send_message",
			Label:       "Send Message",
			Description: "Send a message to a Slack channel",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "channel",
						Type:        "string",
						Label:       "Channel",
						Description: "Channel to send to (overrides default)",
						Required:    false,
					},
					{
						Name:        "text",
						Type:        "string",
						Label:       "Message Text",
						Description: "Plain text message",
						Required:    false,
					},
					{
						Name:        "blocks",
						Type:        "string",
						Label:       "Block Kit JSON",
						Description: "Slack Block Kit JSON for rich formatting",
						Required:    false,
					},
					{
						Name:        "username",
						Type:        "string",
						Label:       "Username",
						Description: "Bot username",
						Required:    false,
					},
					{
						Name:        "icon_emoji",
						Type:        "string",
						Label:       "Icon Emoji",
						Description: "Emoji icon (e.g., :robot_face:)",
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
						Name:        "ts",
						Type:        "string",
						Label:       "Timestamp",
						Required:    false,
					},
				},
			},
		},
		{
			Name:        "send_notification",
			Label:       "Send Execution Notification",
			Description: "Send formatted execution status notification",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "channel",
						Type:        "string",
						Label:       "Channel",
						Required:    false,
					},
					{
						Name:        "status",
						Type:        "select",
						Label:       "Status",
						Description: "Execution status",
						Required:    true,
						Options:     []string{"success", "failure", "started"},
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
						Name:        "duration",
						Type:        "string",
						Label:       "Duration",
						Required:    false,
					},
					{
						Name:        "error_message",
						Type:        "string",
						Label:       "Error Message",
						Required:    false,
					},
				},
			},
		},
	}
}

// ExecuteAction executes an action
func (s *SlackConnector) ExecuteAction(ctx context.Context, action string, params map[string]interface{}) (*ActionResult, error) {
	switch action {
	case "send", "send_message", "message":
		return s.sendMessage(ctx, params)
	case "send_notification", "notification":
		return s.sendNotification(ctx, params)
	default:
		return nil, fmt.Errorf("unknown action: %s (expected send, send_message, send_notification)", action)
	}
}

func (s *SlackConnector) sendMessage(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	payload := map[string]interface{}{}

	// Add text or blocks. Accept "message" as an alias for "text" — flow nodes
	// (and most users) reach for "message" first; treating it as a synonym
	// avoids silent empty-text payloads.
	if text, ok := params["text"].(string); ok && text != "" {
		payload["text"] = text
	} else if msg, ok := params["message"].(string); ok && msg != "" {
		payload["text"] = msg
	}

	if blocksStr, ok := params["blocks"].(string); ok && blocksStr != "" {
		var blocks interface{}
		if err := json.Unmarshal([]byte(blocksStr), &blocks); err == nil {
			payload["blocks"] = blocks
		}
	}

	// Add optional fields
	if username, ok := params["username"].(string); ok && username != "" {
		payload["username"] = username
	}
	if iconEmoji, ok := params["icon_emoji"].(string); ok && iconEmoji != "" {
		payload["icon_emoji"] = iconEmoji
	}
	if channel, ok := params["channel"].(string); ok && channel != "" {
		payload["channel"] = channel
	} else if s.channel != "" {
		payload["channel"] = s.channel
	}

	// Send to webhook
	jsonBody, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", s.webhookURL, bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send message: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("slack API error: %s - %s", resp.Status, string(body))
	}

	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"status": resp.Status,
		},
	}, nil
}

func (s *SlackConnector) sendNotification(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	status := params["status"].(string)
	executionID := params["execution_id"].(string)
	schedulerName := params["scheduler_name"].(string)

	// Determine color based on status
	var color, emoji string
	switch status {
	case "success":
		color = "#36a64f" // Green
		emoji = "✅"
	case "failure":
		color = "#ff0000" // Red
		emoji = "❌"
	case "started":
		color = "#007bff" // Blue
		emoji = "🚀"
	default:
		color = "#808080"
		emoji = "ℹ️"
	}

	// Build Block Kit message
	blocks := map[string]interface{}{
		"attachments": []map[string]interface{}{
			{
				"color": color,
				"blocks": []map[string]interface{}{
					{
						"type": "header",
						"text": map[string]string{
							"type": "plain_text",
							"text": fmt.Sprintf("%s Execution %s", emoji, status),
						},
					},
					{
						"type": "section",
						"fields": []map[string]string{
							{
								"type": "mrkdwn",
								"text": fmt.Sprintf("*Scheduler:*\n%s", schedulerName),
							},
							{
								"type": "mrkdwn",
								"text": fmt.Sprintf("*Execution ID:*\n%s", executionID),
							},
						},
					},
				},
			},
		},
	}

	// Add duration if provided
	if duration, ok := params["duration"].(string); ok && duration != "" {
		attachments := blocks["attachments"].([]map[string]interface{})
		blocksList := attachments[0]["blocks"].([]map[string]interface{})
		blocksList[1]["fields"] = append(
			blocksList[1]["fields"].([]map[string]string),
			map[string]string{
				"type": "mrkdwn",
				"text": fmt.Sprintf("*Duration:*\n%s", duration),
			},
		)
	}

	// Add error message if provided
	if errorMsg, ok := params["error_message"].(string); ok && errorMsg != "" {
		attachments := blocks["attachments"].([]map[string]interface{})
		blocksList := attachments[0]["blocks"].([]map[string]interface{})
		blocksList = append(blocksList, map[string]interface{}{
			"type": "section",
			"text": map[string]string{
				"type": "mrkdwn",
				"text": fmt.Sprintf("*Error:*\n```%s```", errorMsg),
			},
		})
		attachments[0]["blocks"] = blocksList
	}

	// Send message
	jsonBody, _ := json.Marshal(blocks)

	req, err := http.NewRequestWithContext(ctx, "POST", s.webhookURL, bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("slack API error: %s - %s", resp.Status, string(body))
	}

	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"status": resp.Status,
		},
	}, nil
}
