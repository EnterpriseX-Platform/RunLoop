package connector

import (
	"context"
	"fmt"
	"sync"
)

// ConnectorType represents the type of connector
type ConnectorType string

const (
	// Notifications
	TypeSlack     ConnectorType = "slack"
	TypeDiscord   ConnectorType = "discord"
	TypeTeams     ConnectorType = "teams"
	TypeTelegram  ConnectorType = "telegram"
	TypeEmail     ConnectorType = "email"
	TypeWebhook   ConnectorType = "webhook"
	
	// Cloud Providers
	TypeAWS       ConnectorType = "aws"
	TypeGCP       ConnectorType = "gcp"
	TypeAzure     ConnectorType = "azure"
	
	// Databases
	TypePostgres  ConnectorType = "postgres"
	TypeMySQL     ConnectorType = "mysql"
	TypeMongoDB   ConnectorType = "mongodb"
	TypeRedis     ConnectorType = "redis"
	
	// Storage
	TypeS3        ConnectorType = "s3"
	TypeGCS       ConnectorType = "gcs"
	TypeAzureBlob ConnectorType = "azure_blob"
	
	// DevOps
	TypeGitHub    ConnectorType = "github"
	TypeGitLab    ConnectorType = "gitlab"
	TypeDocker    ConnectorType = "docker"
	TypeK8s       ConnectorType = "kubernetes"
	
	// Communication
	TypeSMTP      ConnectorType = "smtp"
	TypeSNS       ConnectorType = "sns"
	TypeSQS       ConnectorType = "sqs"
	TypePubSub    ConnectorType = "pubsub"
	
	// Monitoring
	TypeDatadog   ConnectorType = "datadog"
	TypeNewRelic  ConnectorType = "newrelic"
	TypePagerDuty ConnectorType = "pagerduty"
)

// ConnectorMetadata holds connector information
type ConnectorMetadata struct {
	Type        ConnectorType `json:"type"`
	Name        string        `json:"name"`
	Description string        `json:"description"`
	Category    string        `json:"category"`
	Icon        string        `json:"icon"`
	Version     string        `json:"version"`
	
	// Configuration schema
	ConfigSchema ConfigSchema `json:"config_schema"`
	
	// Capabilities
	SupportsWebhook bool `json:"supports_webhook"`
	SupportsPolling bool `json:"supports_polling"`
	SupportsActions bool `json:"supports_actions"`
}

// ConfigSchema defines the configuration structure
type ConfigSchema struct {
	Fields []ConfigField `json:"fields"`
}

// ConfigField defines a configuration field
type ConfigField struct {
	Name        string   `json:"name"`
	Type        string   `json:"type"` // string, number, boolean, select, secret
	Label       string   `json:"label"`
	Description string   `json:"description"`
	Required    bool     `json:"required"`
	Secret      bool     `json:"secret"`
	Options     []string `json:"options,omitempty"` // For select type
}

// Connector is the interface that all connectors must implement
type Connector interface {
	// Metadata returns connector information
	Metadata() ConnectorMetadata
	
	// ValidateConfig validates the connector configuration
	ValidateConfig(config map[string]interface{}) error
	
	// Initialize initializes the connector with configuration
	Initialize(ctx context.Context, config map[string]interface{}) error
	
	// HealthCheck checks if the connector is healthy
	HealthCheck(ctx context.Context) error
	
	// Close closes the connector
	Close() error
}

// ActionConnector is for connectors that support actions
type ActionConnector interface {
	Connector
	
	// GetActions returns available actions
	GetActions() []ActionDefinition
	
	// ExecuteAction executes an action
	ExecuteAction(ctx context.Context, action string, params map[string]interface{}) (*ActionResult, error)
}

// ActionDefinition defines an action
type ActionDefinition struct {
	Name        string       `json:"name"`
	Label       string       `json:"label"`
	Description string       `json:"description"`
	Params      ConfigSchema `json:"params"`
	Output      ConfigSchema `json:"output"`
}

// ActionResult is the result of an action
type ActionResult struct {
	Success bool                   `json:"success"`
	Data    map[string]interface{} `json:"data"`
	Error   string                 `json:"error,omitempty"`
}

// Registry manages all connectors
type Registry struct {
	connectors map[ConnectorType]Connector
	mu         sync.RWMutex
}

// NewRegistry creates a new connector registry
func NewRegistry() *Registry {
	return &Registry{
		connectors: make(map[ConnectorType]Connector),
	}
}

// Register registers a connector
func (r *Registry) Register(connector Connector) error {
	meta := connector.Metadata()
	
	r.mu.Lock()
	defer r.mu.Unlock()
	
	if _, exists := r.connectors[meta.Type]; exists {
		return fmt.Errorf("connector '%s' already registered", meta.Type)
	}
	
	r.connectors[meta.Type] = connector
	return nil
}

// Get retrieves a connector by type
func (r *Registry) Get(ct ConnectorType) (Connector, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	
	c, exists := r.connectors[ct]
	return c, exists
}

// GetActionConnector retrieves an action connector
func (r *Registry) GetActionConnector(ct ConnectorType) (ActionConnector, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	
	c, exists := r.connectors[ct]
	if !exists {
		return nil, false
	}
	
	ac, ok := c.(ActionConnector)
	return ac, ok
}

// List returns all registered connectors
func (r *Registry) List() []ConnectorMetadata {
	r.mu.RLock()
	defer r.mu.RUnlock()
	
	var list []ConnectorMetadata
	for _, c := range r.connectors {
		list = append(list, c.Metadata())
	}
	return list
}

// ListByCategory returns connectors by category
func (r *Registry) ListByCategory(category string) []ConnectorMetadata {
	r.mu.RLock()
	defer r.mu.RUnlock()
	
	var list []ConnectorMetadata
	for _, c := range r.connectors {
		meta := c.Metadata()
		if meta.Category == category {
			list = append(list, meta)
		}
	}
	return list
}

// Categories returns all available categories
func (r *Registry) Categories() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	
	categories := make(map[string]bool)
	for _, c := range r.connectors {
		categories[c.Metadata().Category] = true
	}
	
	var list []string
	for cat := range categories {
		list = append(list, cat)
	}
	return list
}

// Unregister removes a connector
func (r *Registry) Unregister(ct ConnectorType) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.connectors, ct)
}

// Global registry instance
var globalRegistry = NewRegistry()

// Register registers a connector to the global registry
func Register(connector Connector) error {
	return globalRegistry.Register(connector)
}

// Get retrieves a connector from the global registry
func Get(ct ConnectorType) (Connector, bool) {
	return globalRegistry.Get(ct)
}

// List lists all connectors from the global registry
func List() []ConnectorMetadata {
	return globalRegistry.List()
}

// Built-in connector categories
const (
	CategoryNotification = "notification"
	CategoryCloud        = "cloud"
	CategoryDatabase     = "database"
	CategoryStorage      = "storage"
	CategoryDevOps       = "devops"
	CategoryCommunication = "communication"
	CategoryMonitoring   = "monitoring"
)
