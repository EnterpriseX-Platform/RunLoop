package db

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
	"github.com/runloop/runloop-engine/internal/config"
)

// Postgres represents a PostgreSQL database connection
type Postgres struct {
	Pool *pgxpool.Pool
}

// clampInt32 narrows an int from config (env-var-derived) to the int32 range
// pgxpool requires. Values ≤ 0 produce 0 so callers can fall back to library
// defaults; large values are pinned to math.MaxInt32 instead of silently
// wrapping into a negative number.
func clampInt32(v int) int32 {
	if v <= 0 {
		return 0
	}
	if v >= math.MaxInt32 {
		return math.MaxInt32
	}
	return int32(v)
}

// NewPostgres creates a new PostgreSQL connection pool
func NewPostgres(cfg *config.Config) (*Postgres, error) {
	ctx := context.Background()

	// Parse connection config
	poolConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("unable to parse database URL: %w", err)
	}

	// Set pool configuration. pgxpool stores pool sizes as int32, so clamp
	// the int values from config to the int32 range. In practice these come
	// from env vars and are small (≤ a few hundred); the clamp is a safety
	// belt that also satisfies CodeQL's incorrect-integer-conversion rule.
	poolConfig.MaxConns = clampInt32(cfg.DatabaseMaxConns)
	poolConfig.MinConns = clampInt32(cfg.DatabaseMaxIdle)

	// Create connection pool
	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("unable to create connection pool: %w", err)
	}

	// Test connection
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("unable to ping database: %w", err)
	}

	log.Info().
		Str("host", poolConfig.ConnConfig.Host).
		Str("database", poolConfig.ConnConfig.Database).
		Int32("max_conns", poolConfig.MaxConns).
		Msg("Connected to PostgreSQL")

	return &Postgres{Pool: pool}, nil
}

// Close closes the database connection pool
func (p *Postgres) Close() {
	if p.Pool != nil {
		p.Pool.Close()
		log.Info().Msg("PostgreSQL connection closed")
	}
}

// Health checks the database health
func (p *Postgres) Health(ctx context.Context) error {
	return p.Pool.Ping(ctx)
}

// Webhook represents a webhook configuration
type Webhook struct {
	ID            string
	ProjectID     string
	Name          string
	Description   *string
	Secret        *string
	SchedulerID   *string
	CustomPayload []byte
	Status        string
	LastCalledAt  *time.Time
	CallCount     int
}

// GetWebhookByID retrieves a webhook by ID
func (p *Postgres) GetWebhookByID(id string) (*Webhook, error) {
	ctx := context.Background()
	query := `
		SELECT id, project_id, name, description, secret, scheduler_id, custom_payload, status, last_called_at, call_count
		FROM webhooks
		WHERE id = $1
	`

	var webhook Webhook
	err := p.Pool.QueryRow(ctx, query, id).Scan(
		&webhook.ID,
		&webhook.ProjectID,
		&webhook.Name,
		&webhook.Description,
		&webhook.Secret,
		&webhook.SchedulerID,
		&webhook.CustomPayload,
		&webhook.Status,
		&webhook.LastCalledAt,
		&webhook.CallCount,
	)
	if err != nil {
		return nil, err
	}

	return &webhook, nil
}

// UpdateWebhookLastCalled updates the last_called_at timestamp
func (p *Postgres) UpdateWebhookLastCalled(id string) error {
	ctx := context.Background()
	query := `
		UPDATE webhooks
		SET last_called_at = NOW(), call_count = call_count + 1
		WHERE id = $1
	`
	_, err := p.Pool.Exec(ctx, query, id)
	return err
}

// GetNotificationsByScheduler retrieves notifications for a scheduler
func (p *Postgres) GetNotificationsByScheduler(schedulerID string) ([]*Notification, error) {
	ctx := context.Background()
	query := `
		SELECT id, scheduler_id, type, config, on_success, on_failure, on_start, status
		FROM notifications
		WHERE scheduler_id = $1 AND status = 'ACTIVE'
	`

	rows, err := p.Pool.Query(ctx, query, schedulerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notifications []*Notification
	for rows.Next() {
		var n Notification
		err := rows.Scan(
			&n.ID,
			&n.SchedulerID,
			&n.Type,
			&n.Config,
			&n.OnSuccess,
			&n.OnFailure,
			&n.OnStart,
			&n.Status,
		)
		if err != nil {
			continue
		}
		notifications = append(notifications, &n)
	}

	return notifications, nil
}

// Notification represents a notification configuration
type Notification struct {
	ID          string
	SchedulerID string
	Type        string
	Config      string
	OnSuccess   bool
	OnFailure   bool
	OnStart     bool
	Status      string
}

// ExecutionInfo represents execution information for notifications
type ExecutionInfo struct {
	ID            string
	SchedulerID   string
	SchedulerName string
	ProjectName   string
	Status        string
	StartedAt     time.Time
	CompletedAt   *time.Time
	DurationMs    *int
	ErrorMessage  *string
}

// GetExecutionInfo retrieves execution info with scheduler and project names
func (p *Postgres) GetExecutionInfo(executionID string) (*ExecutionInfo, error) {
	ctx := context.Background()
	query := `
		SELECT 
			e.id, e.scheduler_id, s.name as scheduler_name, p.name as project_name,
			e.status, e.started_at, e.completed_at, e.duration_ms, e.error_message
		FROM executions e
		JOIN schedulers s ON e.scheduler_id = s.id
		JOIN projects p ON e.project_id = p.id
		WHERE e.id = $1
	`

	var info ExecutionInfo
	err := p.Pool.QueryRow(ctx, query, executionID).Scan(
		&info.ID,
		&info.SchedulerID,
		&info.SchedulerName,
		&info.ProjectName,
		&info.Status,
		&info.StartedAt,
		&info.CompletedAt,
		&info.DurationMs,
		&info.ErrorMessage,
	)
	if err != nil {
		return nil, err
	}

	return &info, nil
}

// InsertRealtimeLog inserts a real-time log entry
func (p *Postgres) InsertRealtimeLog(executionID, level, message string) error {
	ctx := context.Background()
	query := `
		INSERT INTO realtime_logs (execution_id, timestamp, level, message)
		VALUES ($1, NOW(), $2, $3)
	`
	_, err := p.Pool.Exec(ctx, query, executionID, level, message)
	return err
}

// ReplayExecution creates a replay of an execution
func (p *Postgres) ReplayExecution(originalExecutionID string, triggeredBy string) (string, error) {
	ctx := context.Background()

	// Get original execution details
	var schedulerID, projectID string
	var input []byte
	err := p.Pool.QueryRow(ctx, `
		SELECT scheduler_id, project_id, input
		FROM executions
		WHERE id = $1
	`, originalExecutionID).Scan(&schedulerID, &projectID, &input)
	if err != nil {
		return "", fmt.Errorf("failed to get original execution: %w", err)
	}

	// Create new execution
	var newExecutionID string
	err = p.Pool.QueryRow(ctx, `
		INSERT INTO executions (scheduler_id, project_id, trigger_type, triggered_by, status, input, replayed_from)
		VALUES ($1, $2, 'MANUAL', $3, 'PENDING', $4, $5)
		RETURNING id
	`, schedulerID, projectID, triggeredBy, input, originalExecutionID).Scan(&newExecutionID)
	if err != nil {
		return "", fmt.Errorf("failed to create replay execution: %w", err)
	}

	// Update replay count
	_, _ = p.Pool.Exec(ctx, `
		UPDATE executions
		SET replay_count = replay_count + 1
		WHERE id = $1
	`, originalExecutionID)

	return newExecutionID, nil
}
