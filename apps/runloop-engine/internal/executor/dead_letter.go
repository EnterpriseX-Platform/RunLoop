package executor

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/runloop/runloop-engine/internal/db"
	"github.com/runloop/runloop-engine/internal/models"
)

// DeadLetterReason defines why an execution was sent to DLQ
type DeadLetterReason string

const (
	DLQMaxRetriesExceeded  DeadLetterReason = "MAX_RETRIES_EXCEEDED"
	DLQCircuitBreakerOpen  DeadLetterReason = "CIRCUIT_BREAKER_OPEN"
	DLQTimeout             DeadLetterReason = "TIMEOUT"
	DLQPermanentError      DeadLetterReason = "PERMANENT_ERROR"
	DLQValidationFailed    DeadLetterReason = "VALIDATION_FAILED"
	DLQDependencyFailed    DeadLetterReason = "DEPENDENCY_FAILED"
)

// DeadLetterEntry represents a failed execution in DLQ
type DeadLetterEntry struct {
	ID            string           `json:"id"`
	ExecutionID   string           `json:"execution_id"`
	SchedulerID   string           `json:"scheduler_id"`
	ProjectID     string           `json:"project_id"`
	Reason        DeadLetterReason `json:"reason"`
	ErrorMessage  string           `json:"error_message"`
	ErrorDetails  string           `json:"error_details"`
	RetryCount    int              `json:"retry_count"`
	OriginalInput json.RawMessage  `json:"original_input"`
	
	// Context
	NodeID        string    `json:"node_id,omitempty"`        // For flow executions
	NodeType      string    `json:"node_type,omitempty"`      // Type of node that failed
	
	// Resolution
	Status        DLQStatus `json:"status"`
	ResolvedAt    *time.Time `json:"resolved_at,omitempty"`
	ResolvedBy    string     `json:"resolved_by,omitempty"`
	Resolution    string     `json:"resolution,omitempty"`     // How it was resolved
	Replayed      bool       `json:"replayed"`
	ReplayedAt    *time.Time `json:"replayed_at,omitempty"`
	NewExecutionID string    `json:"new_execution_id,omitempty"`
	
	// Timestamps
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// DLQStatus represents the status of a DLQ entry
type DLQStatus string

const (
	DLQPending     DLQStatus = "PENDING"
	DLQReviewing   DLQStatus = "REVIEWING"
	DLQResolved    DLQStatus = "RESOLVED"
	DLQDiscarded   DLQStatus = "DISCARDED"
	DLQReplayed    DLQStatus = "REPLAYED"
)

// DeadLetterQueue manages failed executions
type DeadLetterQueue struct {
	db *db.Postgres
}

// NewDeadLetterQueue creates a new DLQ
func NewDeadLetterQueue(database *db.Postgres) *DeadLetterQueue {
	return &DeadLetterQueue{
		db: database,
	}
}

// SendToDLQ sends a failed execution to the dead letter queue
func (dlq *DeadLetterQueue) SendToDLQ(
	ctx context.Context,
	execution *models.Execution,
	reason DeadLetterReason,
	errorMsg string,
	errorDetails string,
) error {
	inputBytes, err := json.Marshal(execution.Input)
	if err != nil {
		return fmt.Errorf("failed to marshal execution input: %w", err)
	}

	entry := &DeadLetterEntry{
		ID:            generateDLQID(),
		ExecutionID:   execution.ID,
		SchedulerID:   execution.SchedulerID,
		ProjectID:     execution.ProjectID,
		Reason:        reason,
		ErrorMessage:  errorMsg,
		ErrorDetails:  errorDetails,
		RetryCount:    execution.RetryAttempt,
		OriginalInput: json.RawMessage(inputBytes),
		Status:        DLQPending,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	// Store in database
	query := `
		INSERT INTO dead_letter_queue (
			id, execution_id, scheduler_id, project_id, reason,
			error_message, error_details, retry_count, original_input,
			node_id, node_type, status, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
	`

	_, err = dlq.db.Pool.Exec(ctx, query,
		entry.ID,
		entry.ExecutionID,
		entry.SchedulerID,
		entry.ProjectID,
		entry.Reason,
		entry.ErrorMessage,
		entry.ErrorDetails,
		entry.RetryCount,
		entry.OriginalInput,
		entry.NodeID,
		entry.NodeType,
		entry.Status,
		entry.CreatedAt,
		entry.UpdatedAt,
	)

	if err != nil {
		return fmt.Errorf("failed to store DLQ entry: %w", err)
	}

	return nil
}

// GetEntries retrieves DLQ entries with filtering
func (dlq *DeadLetterQueue) GetEntries(
	ctx context.Context,
	projectID string,
	status *DLQStatus,
	reason *DeadLetterReason,
	limit int,
	offset int,
) ([]*DeadLetterEntry, error) {
	query := `
		SELECT id, execution_id, scheduler_id, project_id, reason,
		       error_message, error_details, retry_count, original_input,
		       node_id, node_type, status, resolved_at, resolved_by,
		       resolution, replayed, replayed_at, new_execution_id,
		       created_at, updated_at
		FROM dead_letter_queue
		WHERE project_id = $1
	`
	args := []interface{}{projectID}
	argCount := 1

	if status != nil {
		argCount++
		query += fmt.Sprintf(" AND status = $%d", argCount)
		args = append(args, *status)
	}

	if reason != nil {
		argCount++
		query += fmt.Sprintf(" AND reason = $%d", argCount)
		args = append(args, *reason)
	}

	query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", argCount+1, argCount+2)
	args = append(args, limit, offset)

	rows, err := dlq.db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query DLQ: %w", err)
	}
	defer rows.Close()

	var entries []*DeadLetterEntry
	for rows.Next() {
		entry := &DeadLetterEntry{}
		err := rows.Scan(
			&entry.ID,
			&entry.ExecutionID,
			&entry.SchedulerID,
			&entry.ProjectID,
			&entry.Reason,
			&entry.ErrorMessage,
			&entry.ErrorDetails,
			&entry.RetryCount,
			&entry.OriginalInput,
			&entry.NodeID,
			&entry.NodeType,
			&entry.Status,
			&entry.ResolvedAt,
			&entry.ResolvedBy,
			&entry.Resolution,
			&entry.Replayed,
			&entry.ReplayedAt,
			&entry.NewExecutionID,
			&entry.CreatedAt,
			&entry.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan DLQ entry: %w", err)
		}
		entries = append(entries, entry)
	}

	return entries, nil
}

// GetEntry retrieves a specific DLQ entry
func (dlq *DeadLetterQueue) GetEntry(ctx context.Context, id string) (*DeadLetterEntry, error) {
	query := `
		SELECT id, execution_id, scheduler_id, project_id, reason,
		       error_message, error_details, retry_count, original_input,
		       node_id, node_type, status, resolved_at, resolved_by,
		       resolution, replayed, replayed_at, new_execution_id,
		       created_at, updated_at
		FROM dead_letter_queue
		WHERE id = $1
	`

	entry := &DeadLetterEntry{}
	err := dlq.db.Pool.QueryRow(ctx, query, id).Scan(
		&entry.ID,
		&entry.ExecutionID,
		&entry.SchedulerID,
		&entry.ProjectID,
		&entry.Reason,
		&entry.ErrorMessage,
		&entry.ErrorDetails,
		&entry.RetryCount,
		&entry.OriginalInput,
		&entry.NodeID,
		&entry.NodeType,
		&entry.Status,
		&entry.ResolvedAt,
		&entry.ResolvedBy,
		&entry.Resolution,
		&entry.Replayed,
		&entry.ReplayedAt,
		&entry.NewExecutionID,
		&entry.CreatedAt,
		&entry.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get DLQ entry: %w", err)
	}

	return entry, nil
}

// Resolve marks a DLQ entry as resolved
func (dlq *DeadLetterQueue) Resolve(
	ctx context.Context,
	id string,
	resolvedBy string,
	resolution string,
) error {
	now := time.Now()
	query := `
		UPDATE dead_letter_queue
		SET status = $1, resolved_at = $2, resolved_by = $3, resolution = $4, updated_at = $5
		WHERE id = $6
	`

	_, err := dlq.db.Pool.Exec(ctx, query,
		DLQResolved,
		now,
		resolvedBy,
		resolution,
		now,
		id,
	)

	if err != nil {
		return fmt.Errorf("failed to resolve DLQ entry: %w", err)
	}

	return nil
}

// MarkAsReplayed marks a DLQ entry as replayed
func (dlq *DeadLetterQueue) MarkAsReplayed(
	ctx context.Context,
	id string,
	newExecutionID string,
) error {
	now := time.Now()
	query := `
		UPDATE dead_letter_queue
		SET status = $1, replayed = true, replayed_at = $2, new_execution_id = $3, updated_at = $4
		WHERE id = $5
	`

	_, err := dlq.db.Pool.Exec(ctx, query,
		DLQReplayed,
		now,
		newExecutionID,
		now,
		id,
	)

	if err != nil {
		return fmt.Errorf("failed to mark DLQ entry as replayed: %w", err)
	}

	return nil
}

// Discard marks a DLQ entry as discarded
func (dlq *DeadLetterQueue) Discard(ctx context.Context, id string, reason string) error {
	now := time.Now()
	query := `
		UPDATE dead_letter_queue
		SET status = $1, resolution = $2, updated_at = $3
		WHERE id = $4
	`

	_, err := dlq.db.Pool.Exec(ctx, query, DLQDiscarded, reason, now, id)
	if err != nil {
		return fmt.Errorf("failed to discard DLQ entry: %w", err)
	}

	return nil
}

// GetStats returns DLQ statistics
func (dlq *DeadLetterQueue) GetStats(ctx context.Context, projectID string) (map[string]interface{}, error) {
	query := `
		SELECT 
			COUNT(*) as total,
			COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
			COUNT(*) FILTER (WHERE status = 'REVIEWING') as reviewing,
			COUNT(*) FILTER (WHERE status = 'RESOLVED') as resolved,
			COUNT(*) FILTER (WHERE status = 'DISCARDED') as discarded,
			COUNT(*) FILTER (WHERE status = 'REPLAYED') as replayed,
			COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h
		FROM dead_letter_queue
		WHERE project_id = $1
	`

	var stats struct {
		Total     int64 `db:"total"`
		Pending   int64 `db:"pending"`
		Reviewing int64 `db:"reviewing"`
		Resolved  int64 `db:"resolved"`
		Discarded int64 `db:"discarded"`
		Replayed  int64 `db:"replayed"`
		Last24h   int64 `db:"last_24h"`
	}

	err := dlq.db.Pool.QueryRow(ctx, query, projectID).Scan(
		&stats.Total,
		&stats.Pending,
		&stats.Reviewing,
		&stats.Resolved,
		&stats.Discarded,
		&stats.Replayed,
		&stats.Last24h,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get DLQ stats: %w", err)
	}

	return map[string]interface{}{
		"total":      stats.Total,
		"pending":    stats.Pending,
		"reviewing":  stats.Reviewing,
		"resolved":   stats.Resolved,
		"discarded":  stats.Discarded,
		"replayed":   stats.Replayed,
		"last_24h":   stats.Last24h,
	}, nil
}

// generateDLQID generates a unique ID for DLQ entries
func generateDLQID() string {
	return fmt.Sprintf("dlq_%d", time.Now().UnixNano())
}
