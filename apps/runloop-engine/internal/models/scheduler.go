package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"time"
)

// JobStatus represents the status of a job
type JobStatus string

const (
	JobStatusActive    JobStatus = "ACTIVE"
	JobStatusInactive  JobStatus = "INACTIVE"
	JobStatusRunning   JobStatus = "RUNNING"
	JobStatusError     JobStatus = "ERROR"
	JobStatusCompleted JobStatus = "COMPLETED"
)

// SchedulerStatus represents the status of a scheduler (for DB compatibility)
type SchedulerStatus string

const (
	SchedulerStatusActive   SchedulerStatus = "ACTIVE"
	SchedulerStatusInactive SchedulerStatus = "INACTIVE"
	SchedulerStatusPaused   SchedulerStatus = "PAUSED"
	SchedulerStatusDeleted  SchedulerStatus = "DELETED"
)

// TriggerType represents how the job is triggered
type TriggerType string

const (
	TriggerTypeSchedule TriggerType = "SCHEDULE"
	TriggerTypeManual   TriggerType = "MANUAL"
	TriggerTypeWebhook  TriggerType = "WEBHOOK"
	TriggerTypeAPI      TriggerType = "API"
	TriggerTypeQueue    TriggerType = "QUEUE"
)

// JobType represents the type of job
type JobType string

const (
	JobTypeHTTP      JobType = "HTTP"
	JobTypeDatabase  JobType = "DATABASE"
	JobTypeShell     JobType = "SHELL"
	JobTypePython    JobType = "PYTHON"
	JobTypeNodeJS    JobType = "NODEJS"
	JobTypeDocker    JobType = "DOCKER"
	JobTypeSlack     JobType = "SLACK"
	JobTypeEmail     JobType = "EMAIL"
	// Flow-shape nodes: handled directly by FlowExecutor, not by per-type executors.
	JobTypeStart     JobType = "START"
	JobTypeEnd       JobType = "END"
	JobTypeCondition JobType = "CONDITION"
	JobTypeDelay     JobType = "DELAY"
	JobTypeLoop      JobType = "LOOP"
	JobTypeTransform JobType = "TRANSFORM"
	JobTypeMerge     JobType = "MERGE"
	JobTypeSwitch    JobType = "SWITCH"
	JobTypeLog       JobType = "LOG"
	JobTypeSetVar    JobType = "SET_VARIABLE"
	JobTypeSubFlow   JobType = "SUBFLOW"
	JobTypeWebhook   JobType = "WEBHOOK_OUT"
	JobTypeWaitHook  JobType = "WAIT_WEBHOOK"
)

// JSONMap is a custom type for JSONB fields
type JSONMap map[string]interface{}

// Value implements the driver.Valuer interface
func (j JSONMap) Value() (driver.Value, error) {
	if j == nil {
		return nil, nil
	}
	return json.Marshal(j)
}

// Scan implements the sql.Scanner interface
func (j *JSONMap) Scan(value interface{}) error {
	if value == nil {
		*j = nil
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return errors.New("type assertion to []byte failed")
	}
	return json.Unmarshal(bytes, j)
}

// Scheduler represents a scheduled job
type Scheduler struct {
	ID             string      `json:"id" db:"id"`
	Name           string      `json:"name" db:"name"`
	Description    *string     `json:"description,omitempty" db:"description"`
	Type           JobType     `json:"type" db:"type"`
	TriggerType    TriggerType `json:"triggerType" db:"trigger_type"`
	Schedule       *string     `json:"schedule,omitempty" db:"schedule"` // Cron expression
	Timezone       string      `json:"timezone" db:"timezone"`
	Status         JobStatus   `json:"status" db:"status"`
	Config         JSONMap     `json:"config" db:"config"` // Job-specific configuration
	Timeout        int         `json:"timeout" db:"timeout"` // Timeout in seconds
	RetryCount     int         `json:"retryCount" db:"retry_count"`
	RetryDelay     int         `json:"retryDelay" db:"retry_delay"` // Delay in seconds
	MaxConcurrency int         `json:"maxConcurrency" db:"max_concurrency"` // Overlap prevention
	PausedUntil    *time.Time  `json:"pausedUntil,omitempty" db:"paused_until"` // Maintenance window
	LastRunAt      *time.Time  `json:"lastRunAt,omitempty" db:"last_run_at"`
	NextRunAt      *time.Time  `json:"nextRunAt,omitempty" db:"next_run_at"`
	LastError      *string     `json:"lastError,omitempty" db:"last_error"`
	SuccessCount   int         `json:"successCount" db:"success_count"`
	FailureCount   int         `json:"failureCount" db:"failure_count"`
	CreatedBy      string      `json:"createdBy" db:"created_by"`
	ProjectID      string      `json:"projectId" db:"project_id"`
	CreatedAt      time.Time   `json:"createdAt" db:"created_at"`
	UpdatedAt      time.Time   `json:"updatedAt" db:"updated_at"`
	DeletedAt      *time.Time  `json:"deletedAt,omitempty" db:"deleted_at"`
	FlowConfig     JSONMap     `json:"flowConfig,omitempty" db:"flow_config"` // Flow configuration (jsonb)
	IsFlow         bool        `json:"isFlow" db:"is_flow"` // Whether this is a flow scheduler
}

// Execution represents a job execution
type Execution struct {
	ID            string          `json:"id" db:"id"`
	SchedulerID   string          `json:"schedulerId" db:"scheduler_id"`
	ProjectID     string          `json:"projectId" db:"project_id"`
	TriggerType   TriggerType     `json:"triggerType" db:"trigger_type"`
	TriggeredBy   *string         `json:"triggeredBy,omitempty" db:"triggered_by"` // User/system that triggered
	Status        ExecutionStatus `json:"status" db:"status"`
	StartedAt     time.Time       `json:"startedAt" db:"started_at"`
	CompletedAt   *time.Time      `json:"completedAt,omitempty" db:"completed_at"`
	DurationMs    *int            `json:"durationMs,omitempty" db:"duration_ms"`
	Input         JSONMap         `json:"input,omitempty" db:"input"`
	Output        JSONMap         `json:"output,omitempty" db:"output"`
	ErrorMessage  *string         `json:"errorMessage,omitempty" db:"error_message"`
	Logs          string          `json:"logs,omitempty" db:"logs"`
	RetryAttempt  int             `json:"retryAttempt" db:"retry_attempt"`
	WorkerID      *string         `json:"workerId,omitempty" db:"worker_id"`
	IPAddress     *string         `json:"ipAddress,omitempty" db:"ip_address"`
	CreatedAt     time.Time       `json:"createdAt" db:"created_at"`
	FlowID        *string         `json:"flowId,omitempty" db:"flow_id"`
	ReplayCount   int             `json:"replayCount" db:"replay_count"`       // Number of times replayed
	ReplayedFrom  *string         `json:"replayedFrom,omitempty" db:"replayed_from"` // Original execution ID if replayed
}

// ExecutionStatus represents the status of an execution
type ExecutionStatus string

const (
	ExecutionStatusPending    ExecutionStatus = "PENDING"
	ExecutionStatusRunning    ExecutionStatus = "RUNNING"
	ExecutionStatusSuccess    ExecutionStatus = "SUCCESS"
	ExecutionStatusFailed     ExecutionStatus = "FAILED"
	ExecutionStatusCancelled  ExecutionStatus = "CANCELLED"
	ExecutionStatusTimeout    ExecutionStatus = "TIMEOUT"
)

// ExecutionMetrics represents aggregated metrics for executions
type ExecutionMetrics struct {
	TotalExecutions   int64   `json:"totalExecutions"`
	SuccessCount      int64   `json:"successCount"`
	FailureCount      int64   `json:"failureCount"`
	SuccessRate       float64 `json:"successRate"`
	AvgDurationMs     float64 `json:"avgDurationMs"`
	TotalDurationMs   int64   `json:"totalDurationMs"`
	PendingExecutions int64   `json:"pendingExecutions"`
	RunningExecutions int64   `json:"runningExecutions"`
}

// SchedulerStats represents statistics for a scheduler
type SchedulerStats struct {
	SchedulerID      string     `json:"schedulerId"`
	SchedulerName    string     `json:"schedulerName"`
	TotalExecutions  int64      `json:"totalExecutions"`
	SuccessCount     int64      `json:"successCount"`
	FailureCount     int64      `json:"failureCount"`
	LastRunAt        *time.Time `json:"lastRunAt,omitempty"`
	NextRunAt        *time.Time `json:"nextRunAt,omitempty"`
	AvgDurationMs    float64    `json:"avgDurationMs"`
}

// User represents a user in the system
type User struct {
	ID        string    `json:"id" db:"id"`
	Email     string    `json:"email" db:"email"`
	Name      *string   `json:"name,omitempty" db:"name"`
	Role      string    `json:"role" db:"role"`
	Status    string    `json:"status" db:"status"`
	Password  string    `json:"-" db:"password"`
	CreatedAt time.Time `json:"createdAt" db:"created_at"`
	UpdatedAt time.Time `json:"updatedAt" db:"updated_at"`
}

// Project represents a project/workspace
type Project struct {
	ID          string    `json:"id" db:"id"`
	Name        string    `json:"name" db:"name"`
	Description *string   `json:"description,omitempty" db:"description"`
	Status      string    `json:"status" db:"status"`
	CreatedBy   string    `json:"createdBy" db:"created_by"`
	CreatedAt   time.Time `json:"createdAt" db:"created_at"`
	UpdatedAt   time.Time `json:"updatedAt" db:"updated_at"`
}

// CreateSchedulerRequest represents a request to create a scheduler
type CreateSchedulerRequest struct {
	Name           string      `json:"name" validate:"required,min=3,max=100"`
	Description    *string     `json:"description,omitempty"`
	Type           JobType     `json:"type" validate:"required,oneof=HTTP DATABASE SHELL PYTHON NODEJS DOCKER FLOW"`
	TriggerType    TriggerType `json:"triggerType" validate:"omitempty,oneof=SCHEDULE MANUAL WEBHOOK API"`
	Schedule       *string     `json:"schedule,omitempty" validate:"omitempty,cron"`
	Timezone       string      `json:"timezone" validate:"required,timezone"`
	Config         JSONMap     `json:"config" validate:"required"`
	Timeout        int         `json:"timeout" validate:"min=1,max=3600"`
	RetryCount     int         `json:"retryCount" validate:"min=0,max=10"`
	RetryDelay     int         `json:"retryDelay" validate:"min=0,max=300"`
	MaxConcurrency int         `json:"maxConcurrency" validate:"omitempty,min=1,max=100"`
	ProjectID      string      `json:"projectId" validate:"required"`
	IsFlow         bool        `json:"isFlow"`
	FlowConfig     JSONMap     `json:"flowConfig,omitempty"`
}

// UpdateSchedulerRequest represents a request to update a scheduler
type UpdateSchedulerRequest struct {
	Name           *string     `json:"name,omitempty" validate:"omitempty,min=3,max=100"`
	Description    *string     `json:"description,omitempty"`
	Schedule       *string     `json:"schedule,omitempty" validate:"omitempty,cron"`
	Timezone       *string     `json:"timezone,omitempty" validate:"omitempty,timezone"`
	Config         JSONMap     `json:"config,omitempty"`
	Status         *JobStatus  `json:"status,omitempty" validate:"omitempty,oneof=ACTIVE INACTIVE PAUSED ERROR"`
	Timeout        *int        `json:"timeout,omitempty" validate:"omitempty,min=1,max=3600"`
	RetryCount     *int        `json:"retryCount,omitempty" validate:"omitempty,min=0,max=10"`
	RetryDelay     *int        `json:"retryDelay,omitempty" validate:"omitempty,min=0,max=300"`
	MaxConcurrency *int        `json:"maxConcurrency,omitempty" validate:"omitempty,min=1,max=100"`
	PausedUntil    *time.Time  `json:"pausedUntil,omitempty"`
	IsFlow         *bool       `json:"isFlow,omitempty"`
	FlowConfig     JSONMap     `json:"flowConfig,omitempty"`
}

// TriggerJobRequest represents a request to manually trigger a job
type TriggerJobRequest struct {
	Input     JSONMap `json:"input,omitempty"`
	IPAddress *string `json:"ipAddress,omitempty"`
}

// JobResult represents the result of a job execution
type JobResult struct {
	Success      bool    `json:"success"`
	Output       JSONMap `json:"output,omitempty"`
	ErrorMessage *string `json:"errorMessage,omitempty"`
	Logs         string  `json:"logs,omitempty"`
}

// FlowConfig represents the configuration for a flow-based scheduler
type FlowConfig struct {
	Nodes []FlowNodeConfig `json:"nodes"`
	Edges []FlowEdgeConfig `json:"edges"`
}

// FlowNodeConfig represents a node in a flow configuration
type FlowNodeConfig struct {
	ID     string  `json:"id"`
	TaskID string  `json:"taskId,omitempty"` // Reference to Task entity
	Type   JobType `json:"type"`
	Name   string  `json:"name"`
	Config JSONMap `json:"config"`
}

// FlowEdgeConfig represents an edge in a flow configuration.
// Condition gates whether the edge fires based on the source node's outcome:
//   ON_SUCCESS  — fires only if source succeeded (default when empty)
//   ON_FAILURE  — fires only if source failed
//   ON_COMPLETE — fires regardless of outcome
type FlowEdgeConfig struct {
	ID        string `json:"id,omitempty"`
	Source    string `json:"source"`
	Target    string `json:"target"`
	Condition string `json:"condition,omitempty"`
}
