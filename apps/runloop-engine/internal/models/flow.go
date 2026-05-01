package models

import "time"

// FlowType represents the type of flow
type FlowType string

const (
	FlowTypeSimple FlowType = "SIMPLE"
	FlowTypeDAG    FlowType = "DAG"
)

// FlowStatus represents the status of a flow
type FlowStatus string

const (
	FlowStatusActive   FlowStatus = "ACTIVE"
	FlowStatusInactive FlowStatus = "INACTIVE"
	FlowStatusDraft    FlowStatus = "DRAFT"
)

// Flow represents a workflow definition
type Flow struct {
	ID          string     `json:"id" db:"id"`
	Name        string     `json:"name" db:"name"`
	Description *string    `json:"description,omitempty" db:"description"`
	Type        FlowType   `json:"type" db:"type"`
	JobType     *string    `json:"jobType,omitempty" db:"job_type"`
	Config      JSONMap    `json:"config,omitempty" db:"config"`
	FlowConfig  JSONMap    `json:"flowConfig,omitempty" db:"flow_config"`
	Status      FlowStatus `json:"status" db:"status"`
	ProjectID   string     `json:"projectId" db:"project_id"`
	CreatedBy   string     `json:"createdBy" db:"created_by"`
	CreatedAt   time.Time  `json:"createdAt" db:"created_at"`
	UpdatedAt   time.Time  `json:"updatedAt" db:"updated_at"`
}

// CreateFlowRequest represents a request to create a flow
type CreateFlowRequest struct {
	Name        string     `json:"name" validate:"required,min=3,max=100"`
	Description *string    `json:"description,omitempty"`
	Type        FlowType   `json:"type" validate:"required,oneof=SIMPLE DAG"`
	JobType     *string    `json:"jobType,omitempty" validate:"omitempty,oneof=HTTP DATABASE SHELL PYTHON NODEJS DOCKER"`
	Config      JSONMap    `json:"config"`
	FlowConfig  JSONMap    `json:"flowConfig,omitempty"`
	Status      FlowStatus `json:"status" validate:"omitempty,oneof=ACTIVE INACTIVE DRAFT"`
	ProjectID   string     `json:"projectId" validate:"required"`
}

// UpdateFlowRequest represents a request to update a flow
type UpdateFlowRequest struct {
	Name        *string     `json:"name,omitempty" validate:"omitempty,min=3,max=100"`
	Description *string     `json:"description,omitempty"`
	Type        *FlowType   `json:"type,omitempty" validate:"omitempty,oneof=SIMPLE DAG"`
	JobType     *string     `json:"jobType,omitempty"`
	Config      JSONMap     `json:"config,omitempty"`
	FlowConfig  JSONMap     `json:"flowConfig,omitempty"`
	Status      *FlowStatus `json:"status,omitempty" validate:"omitempty,oneof=ACTIVE INACTIVE DRAFT"`
}

// SchedulerFlow links a scheduler to a flow
type SchedulerFlow struct {
	ID             string    `json:"id" db:"id"`
	SchedulerID    string    `json:"schedulerId" db:"scheduler_id"`
	FlowID         string    `json:"flowId" db:"flow_id"`
	ExecutionOrder int       `json:"executionOrder" db:"execution_order"`
	CreatedAt      time.Time `json:"createdAt" db:"created_at"`
}

// SchedulerFlowEdge defines dependencies between flows within a scheduler
type SchedulerFlowEdge struct {
	ID           string    `json:"id" db:"id"`
	SchedulerID  string    `json:"schedulerId" db:"scheduler_id"`
	SourceFlowID string    `json:"sourceFlowId" db:"source_flow_id"`
	TargetFlowID string    `json:"targetFlowId" db:"target_flow_id"`
	Condition    *string   `json:"condition,omitempty" db:"condition"`
	CreatedAt    time.Time `json:"createdAt" db:"created_at"`
}

// DependencyCondition for flow/scheduler edges
type DependencyCondition string

const (
	ConditionOnSuccess  DependencyCondition = "ON_SUCCESS"
	ConditionOnFailure  DependencyCondition = "ON_FAILURE"
	ConditionOnComplete DependencyCondition = "ON_COMPLETE"
)

// AttachFlowsRequest for linking flows to a scheduler
type AttachFlowsRequest struct {
	FlowIDs []string `json:"flowIds" validate:"required,min=1"`
	Edges   []struct {
		SourceFlowID string `json:"sourceFlowId" validate:"required"`
		TargetFlowID string `json:"targetFlowId" validate:"required"`
		Condition    string `json:"condition" validate:"omitempty,oneof=ON_SUCCESS ON_FAILURE ON_COMPLETE"`
	} `json:"edges"`
}

// SchedulerDependency represents a cross-scheduler dependency (Control-M style)
type SchedulerDependency struct {
	ID                   string    `json:"id" db:"id"`
	SchedulerID          string    `json:"schedulerId" db:"scheduler_id"`
	DependsOnSchedulerID string    `json:"dependsOnSchedulerId" db:"depends_on_scheduler_id"`
	Condition            string    `json:"condition" db:"condition"`
	CreatedAt            time.Time `json:"createdAt" db:"created_at"`
}

// CreateDependencyRequest for adding scheduler dependencies
type CreateDependencyRequest struct {
	DependsOnSchedulerID string `json:"dependsOnSchedulerId" validate:"required"`
	Condition            string `json:"condition" validate:"required,oneof=ON_SUCCESS ON_FAILURE ON_COMPLETE"`
}
