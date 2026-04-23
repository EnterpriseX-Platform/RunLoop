package models

import "time"

// TaskStatus represents the status of a task
type TaskStatus string

const (
	TaskStatusActive   TaskStatus = "ACTIVE"
	TaskStatusInactive TaskStatus = "INACTIVE"
	TaskStatusDraft    TaskStatus = "DRAFT"
)

// Task represents an atomic job unit (single executable action)
type Task struct {
	ID          string     `json:"id" db:"id"`
	Name        string     `json:"name" db:"name"`
	Description *string    `json:"description,omitempty" db:"description"`
	JobType     string     `json:"jobType" db:"job_type"`
	Config      JSONMap    `json:"config" db:"config"`
	Status      TaskStatus `json:"status" db:"status"`
	ProjectID   string     `json:"projectId" db:"project_id"`
	CreatedBy   string     `json:"createdBy" db:"created_by"`
	CreatedAt   time.Time  `json:"createdAt" db:"created_at"`
	UpdatedAt   time.Time  `json:"updatedAt" db:"updated_at"`
}

// CreateTaskRequest represents a request to create a task
type CreateTaskRequest struct {
	Name        string     `json:"name" validate:"required,min=3,max=100"`
	Description *string    `json:"description,omitempty"`
	JobType     string     `json:"jobType" validate:"required,oneof=HTTP DATABASE SHELL PYTHON NODEJS DOCKER"`
	Config      JSONMap    `json:"config" validate:"required"`
	Status      TaskStatus `json:"status" validate:"omitempty,oneof=ACTIVE INACTIVE DRAFT"`
	ProjectID   string     `json:"projectId" validate:"required"`
}

// UpdateTaskRequest represents a request to update a task
type UpdateTaskRequest struct {
	Name        *string     `json:"name,omitempty" validate:"omitempty,min=3,max=100"`
	Description *string     `json:"description,omitempty"`
	JobType     *string     `json:"jobType,omitempty" validate:"omitempty,oneof=HTTP DATABASE SHELL PYTHON NODEJS DOCKER"`
	Config      JSONMap     `json:"config,omitempty"`
	Status      *TaskStatus `json:"status,omitempty" validate:"omitempty,oneof=ACTIVE INACTIVE DRAFT"`
}
