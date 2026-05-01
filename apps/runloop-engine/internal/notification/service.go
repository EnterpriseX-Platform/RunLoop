package notification

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/smtp"
	"os"
	"time"

	"github.com/rs/zerolog/log"
)

// Service handles notifications
type Service struct {
	smtpHost     string
	smtpPort     string
	smtpUsername string
	smtpPassword string
	fromEmail    string
	publicURL    string // e.g. https://runloop.example.com/runloop
}

// NewService creates a new notification service
func NewService() *Service {
	return &Service{
		smtpHost:     getEnv("SMTP_HOST", ""),
		smtpPort:     getEnv("SMTP_PORT", "587"),
		smtpUsername: getEnv("SMTP_USERNAME", ""),
		smtpPassword: getEnv("SMTP_PASSWORD", ""),
		fromEmail:    getEnv("FROM_EMAIL", "noreply@runloop.io"),
		publicURL:    getEnv("RUNLOOP_PUBLIC_URL", "http://localhost:3081/runloop"),
	}
}

// executionURL builds a link to the execution detail UI. Falls back to empty
// string when the execution or project id is missing.
func (s *Service) executionURL(projectID, executionID string) string {
	if executionID == "" {
		return ""
	}
	if projectID == "" {
		return fmt.Sprintf("%s/executions/%s", s.publicURL, executionID)
	}
	return fmt.Sprintf("%s/p/%s/executions/%s", s.publicURL, projectID, executionID)
}

// NotificationData represents notification data
type NotificationData struct {
	ExecutionID   string
	ProjectID     string
	SchedulerName string
	ProjectName   string
	Status        string
	StartedAt     time.Time
	CompletedAt   *time.Time
	Duration      string
	ErrorMessage  string
	Logs          string
}

// SendEmail sends an email notification
func (s *Service) SendEmail(to, subject, body string) error {
	if s.smtpHost == "" {
		log.Warn().Msg("SMTP not configured, skipping email")
		return nil
	}

	msg := fmt.Sprintf("From: %s\nTo: %s\nSubject: %s\n\n%s",
		s.fromEmail, to, subject, body)

	addr := fmt.Sprintf("%s:%s", s.smtpHost, s.smtpPort)
	auth := smtp.PlainAuth("", s.smtpUsername, s.smtpPassword, s.smtpHost)

	if err := smtp.SendMail(addr, auth, s.fromEmail, []string{to}, []byte(msg)); err != nil {
		log.Error().Err(err).Str("to", to).Msg("Failed to send email")
		return err
	}

	log.Info().Str("to", to).Str("subject", subject).Msg("Email sent")
	return nil
}

// SendSlack sends a Slack webhook notification
func (s *Service) SendSlack(webhookURL string, data *NotificationData) error {
	color := "#36a64f" // green for success
	if data.Status == "FAILED" {
		color = "#ff0000" // red for failure
	}

	execURL := s.executionURL(data.ProjectID, data.ExecutionID)
	payload := map[string]interface{}{
		"attachments": []map[string]interface{}{
			{
				"color":      color,
				"title":      fmt.Sprintf("RunLoop: %s", data.SchedulerName),
				"title_link": execURL,
				"fields": []map[string]string{
					{"title": "Project", "value": data.ProjectName, "short": "true"},
					{"title": "Status", "value": data.Status, "short": "true"},
					{"title": "Duration", "value": data.Duration, "short": "true"},
					{"title": "Execution ID", "value": data.ExecutionID, "short": "true"},
				},
				"footer": "RunLoop",
				"ts":     time.Now().Unix(),
			},
		},
	}

	if execURL != "" {
		payload["attachments"].([]map[string]interface{})[0]["fields"] = append(
			payload["attachments"].([]map[string]interface{})[0]["fields"].([]map[string]string),
			map[string]string{"title": "View Execution", "value": fmt.Sprintf("<%s|Open in RunLoop>", execURL), "short": "false"},
		)
	}

	if data.ErrorMessage != "" {
		payload["attachments"].([]map[string]interface{})[0]["fields"] = append(
			payload["attachments"].([]map[string]interface{})[0]["fields"].([]map[string]string),
			map[string]string{"title": "Error", "value": data.ErrorMessage, "short": "false"},
		)
	}

	jsonPayload, _ := json.Marshal(payload)
	resp, err := http.Post(webhookURL, "application/json", bytes.NewBuffer(jsonPayload))
	if err != nil {
		log.Error().Err(err).Msg("Failed to send Slack notification")
		return err
	}
	defer resp.Body.Close()

	log.Info().Str("webhook", webhookURL).Str("status", data.Status).Msg("Slack notification sent")
	return nil
}

// SendDiscord sends a Discord webhook notification
func (s *Service) SendDiscord(webhookURL string, data *NotificationData) error {
	color := 3066993 // green
	if data.Status == "FAILED" {
		color = 15158332 // red
	}

	payload := map[string]interface{}{
		"embeds": []map[string]interface{}{
			{
				"title":       fmt.Sprintf("RunLoop: %s", data.SchedulerName),
				"description": fmt.Sprintf("Execution **%s**", data.Status),
				"color":       color,
				"fields": []map[string]interface{}{
					{"name": "Project", "value": data.ProjectName, "inline": true},
					{"name": "Duration", "value": data.Duration, "inline": true},
					{"name": "Execution ID", "value": data.ExecutionID, "inline": true},
				},
				"timestamp": time.Now().Format(time.RFC3339),
			},
		},
	}

	if data.ErrorMessage != "" {
		payload["embeds"].([]map[string]interface{})[0]["fields"] = append(
			payload["embeds"].([]map[string]interface{})[0]["fields"].([]map[string]interface{}),
			map[string]interface{}{"name": "Error", "value": data.ErrorMessage, "inline": false},
		)
	}

	jsonPayload, _ := json.Marshal(payload)
	resp, err := http.Post(webhookURL, "application/json", bytes.NewBuffer(jsonPayload))
	if err != nil {
		log.Error().Err(err).Msg("Failed to send Discord notification")
		return err
	}
	defer resp.Body.Close()

	log.Info().Str("webhook", webhookURL).Str("status", data.Status).Msg("Discord notification sent")
	return nil
}

// NotifyExecution sends notifications for execution status
func (s *Service) NotifyExecution(notificationType, config string, data *NotificationData) error {
	var cfg map[string]string
	if err := json.Unmarshal([]byte(config), &cfg); err != nil {
		return err
	}

	switch notificationType {
	case "EMAIL":
		if email, ok := cfg["email"]; ok {
			subject := fmt.Sprintf("[RunLoop] %s - %s", data.SchedulerName, data.Status)
			body := fmt.Sprintf("Execution %s\n\nScheduler: %s\nProject: %s\nStatus: %s\nDuration: %s",
				data.ExecutionID, data.SchedulerName, data.ProjectName, data.Status, data.Duration)
			if data.ErrorMessage != "" {
				body += fmt.Sprintf("\n\nError: %s", data.ErrorMessage)
			}
			return s.SendEmail(email, subject, body)
		}
	case "SLACK":
		if webhook, ok := cfg["webhook"]; ok {
			return s.SendSlack(webhook, data)
		}
	case "DISCORD":
		if webhook, ok := cfg["webhook"]; ok {
			return s.SendDiscord(webhook, data)
		}
	case "WEBHOOK":
		if url, ok := cfg["url"]; ok {
			return s.sendGenericWebhook(url, data)
		}
	}

	return nil
}

// sendGenericWebhook sends a generic webhook notification
func (s *Service) sendGenericWebhook(url string, data *NotificationData) error {
	payload := map[string]interface{}{
		"event":         "execution.completed",
		"execution_id":  data.ExecutionID,
		"scheduler_name": data.SchedulerName,
		"project_name":  data.ProjectName,
		"status":        data.Status,
		"duration":      data.Duration,
		"timestamp":     time.Now().Format(time.RFC3339),
	}

	jsonPayload, _ := json.Marshal(payload)
	resp, err := http.Post(url, "application/json", bytes.NewBuffer(jsonPayload))
	if err != nil {
		log.Error().Err(err).Msg("Failed to send generic webhook")
		return err
	}
	defer resp.Body.Close()

	log.Info().Str("url", url).Str("status", data.Status).Msg("Generic webhook sent")
	return nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
