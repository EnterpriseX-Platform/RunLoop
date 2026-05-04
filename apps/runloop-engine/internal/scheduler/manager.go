package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/go-co-op/gocron/v2"
	"github.com/runloop/runloop-engine/internal/db"
	"github.com/runloop/runloop-engine/internal/idgen"
	"github.com/runloop/runloop-engine/internal/models"
	"github.com/runloop/runloop-engine/internal/websocket"
	"github.com/runloop/runloop-engine/internal/worker"
	"github.com/rs/zerolog/log"
)

// Manager manages scheduled jobs
type Manager struct {
	db         *db.Postgres
	workerPool *worker.Pool
	scheduler  gocron.Scheduler
	hub        *websocket.Hub

	// Track running jobs
	mu   sync.RWMutex
	jobs map[string]gocron.Job
}

// NewManager creates a new scheduler manager
func NewManager(database *db.Postgres, wp *worker.Pool) (*Manager, error) {
	s, err := gocron.NewScheduler()
	if err != nil {
		return nil, fmt.Errorf("failed to create scheduler: %w", err)
	}

	return &Manager{
		db:         database,
		workerPool: wp,
		scheduler:  s,
		jobs:       make(map[string]gocron.Job),
	}, nil
}

// SetHub sets the WebSocket hub for broadcasting events
func (m *Manager) SetHub(hub *websocket.Hub) {
	m.hub = hub
}

// broadcastExecutionStatus broadcasts execution status update
func (m *Manager) broadcastExecutionStatus(executionID string, status string) {
	if m.hub == nil {
		return
	}

	update := map[string]interface{}{
		"type":        "execution_update",
		"executionId": executionID,
		"status":      status,
		"timestamp":   time.Now().Unix(),
	}

	data, err := json.Marshal(update)
	if err != nil {
		log.Error().Err(err).Msg("Failed to marshal execution status")
		return
	}

	m.hub.Broadcast(executionID, data)
}

// Start starts the scheduler manager
func (m *Manager) Start() error {
	log.Info().Msg("Starting scheduler manager")

	// Load active schedulers from database
	if err := m.loadSchedulers(); err != nil {
		return fmt.Errorf("failed to load schedulers: %w", err)
	}

	// Start the scheduler
	m.scheduler.Start()

	log.Info().
		Int("scheduler_count", len(m.jobs)).
		Msg("Scheduler manager started")

	return nil
}

// Stop stops the scheduler manager
func (m *Manager) Stop() {
	log.Info().Msg("Stopping scheduler manager")

	if err := m.scheduler.Shutdown(); err != nil {
		log.Error().Err(err).Msg("Error shutting down scheduler")
	}

	log.Info().Msg("Scheduler manager stopped")
}

// AddJob adds a new scheduled job
func (m *Manager) AddJob(s *models.Scheduler) error {
	if s.Schedule == nil || *s.Schedule == "" {
		return fmt.Errorf("schedule is required")
	}

	if s.Status != models.JobStatusActive {
		log.Debug().
			Str("scheduler_id", s.ID).
			Str("status", string(s.Status)).
			Msg("Skipping inactive scheduler")
		return nil
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// Remove existing job if any
	if existingJob, exists := m.jobs[s.ID]; exists {
		if err := m.scheduler.RemoveJob(existingJob.ID()); err != nil {
			log.Warn().
				Err(err).
				Str("scheduler_id", s.ID).
				Msg("Failed to remove existing job")
		}
		delete(m.jobs, s.ID)
	}

	// Create job definition
	jobFunc := m.createJobFunc(s)

	// Schedule the job
	job, err := m.scheduler.NewJob(
		gocron.CronJob(*s.Schedule, false),
		gocron.NewTask(jobFunc),
		gocron.WithName(s.Name),
	)

	if err != nil {
		return fmt.Errorf("failed to schedule job: %w", err)
	}

	m.jobs[s.ID] = job

	// Update next run time
	nextRun, _ := job.NextRun()
	if err := m.updateNextRun(s.ID, &nextRun); err != nil {
		log.Error().
			Err(err).
			Str("scheduler_id", s.ID).
			Msg("Failed to update next run time")
	}

	log.Info().
		Str("scheduler_id", s.ID).
		Str("name", s.Name).
		Str("schedule", *s.Schedule).
		Str("next_run", nextRun.Format(time.RFC3339)).
		Msg("Job scheduled")

	return nil
}

// RemoveJob removes a scheduled job
func (m *Manager) RemoveJob(schedulerID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if job, exists := m.jobs[schedulerID]; exists {
		if err := m.scheduler.RemoveJob(job.ID()); err != nil {
			return fmt.Errorf("failed to remove job: %w", err)
		}
		delete(m.jobs, schedulerID)

		log.Info().
			Str("scheduler_id", schedulerID).
			Msg("Job removed")
	}

	return nil
}

// TriggerJob manually triggers a job
func (m *Manager) TriggerJob(ctx context.Context, schedulerID string, input models.JSONMap, ipAddress *string) (*models.Execution, error) {
	// Get scheduler details
	sched, err := m.getScheduler(ctx, schedulerID)
	if err != nil {
		return nil, fmt.Errorf("failed to get scheduler: %w", err)
	}

	// Check maintenance window: if paused_until is set and in the future, skip.
	var pausedUntil *time.Time
	_ = m.db.Pool.QueryRow(ctx,
		`SELECT paused_until FROM schedulers WHERE id = $1`, schedulerID,
	).Scan(&pausedUntil)
	if pausedUntil != nil && pausedUntil.After(time.Now()) {
		return nil, fmt.Errorf("scheduler is paused until %s", pausedUntil.Format(time.RFC3339))
	}

	// Overlap prevention: count RUNNING/PENDING executions for this scheduler.
	// If >= max_concurrency, skip with a warning.
	var maxConcurrency int
	_ = m.db.Pool.QueryRow(ctx,
		`SELECT COALESCE(max_concurrency, 1) FROM schedulers WHERE id = $1`, schedulerID,
	).Scan(&maxConcurrency)
	if maxConcurrency <= 0 {
		maxConcurrency = 1 // defensive default
	}
	var runningCount int
	_ = m.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM executions WHERE scheduler_id = $1 AND status IN ('PENDING', 'RUNNING')`,
		schedulerID,
	).Scan(&runningCount)
	if runningCount >= maxConcurrency {
		log.Warn().
			Str("scheduler_id", schedulerID).
			Int("running", runningCount).
			Int("max", maxConcurrency).
			Msg("Skipping trigger: max concurrency reached")
		return nil, fmt.Errorf("previous run still in progress (running=%d, max=%d)", runningCount, maxConcurrency)
	}

	now := time.Now()

	// Check for attached flows
	flows, err := m.getAttachedFlows(ctx, schedulerID)
	if err != nil {
		log.Error().Err(err).Str("scheduler_id", schedulerID).Msg("Failed to query attached flows")
	}

	if len(flows) > 0 {
		// Execute attached flows sequentially; return the first execution as representative
		var firstExecution *models.Execution
		for _, flow := range flows {
			executionID := idgen.New()
			execution := &models.Execution{
				ID:          executionID,
				SchedulerID: schedulerID,
				ProjectID:   sched.ProjectID,
				TriggerType: models.TriggerTypeManual,
				Status:      models.ExecutionStatusPending,
				StartedAt:   now,
				Input:       input,
				IPAddress:   ipAddress,
				FlowID:      &flow.ID,
			}

			query := `
				INSERT INTO executions (id, scheduler_id, project_id, trigger_type, status, started_at, input, ip_address, flow_id)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			`
			_, err = m.db.Pool.Exec(ctx, query,
				execution.ID,
				execution.SchedulerID,
				execution.ProjectID,
				execution.TriggerType,
				execution.Status,
				execution.StartedAt,
				execution.Input,
				execution.IPAddress,
				execution.FlowID,
			)
			if err != nil {
				return nil, fmt.Errorf("failed to create execution for flow %s: %w", flow.ID, err)
			}

			timeout := time.Duration(sched.Timeout) * time.Second
			if timeout == 0 {
				timeout = 5 * time.Minute
			}

			task := &worker.Task{
				ID:          idgen.New(),
				SchedulerID: schedulerID,
				ProjectID:   sched.ProjectID,
				ExecutionID: executionID,
				FlowID:      &flow.ID,
				Timeout:     timeout,
				RetryCount:  sched.RetryCount,
				RetryDelay:  time.Duration(sched.RetryDelay) * time.Second,
				TriggerType: models.TriggerTypeManual,
				CreatedAt:   now,
			}

			// Both DAG and SIMPLE flows ship their work as a graph of
			// nodes inside flow_config. Always pass the graph to the
			// FlowExecutor so the per-node config (e.g. an HTTP node's
			// url) is read from the right place — previously SIMPLE
			// flows were dispatched to the direct executor with the
			// scheduler's top-level config, which has no url field, so
			// every cron run failed with "URL is required for HTTP jobs".
			//
			// SIMPLE flows that point at a saved Task (resolveTaskReferences)
			// keep the legacy short-circuit since those don't have a real
			// node graph to execute.
			handledAsFlow := false
			if flow.FlowConfig != nil && hasFlowGraph(flow.FlowConfig) {
				var flowConfig models.FlowConfig
				if flowConfigBytes, merr := json.Marshal(flow.FlowConfig); merr == nil {
					if uerr := json.Unmarshal(flowConfigBytes, &flowConfig); uerr == nil &&
						len(flowConfig.Nodes) > 0 {
						task.Type = models.JobTypeHTTP // placeholder; FlowExecutor dispatches per-node
						task.FlowConfig = &flowConfig
						task.Config = flow.Config
						// Merge scheduler's top-level config (e.g. input)
						// into the flow context so ${{input.X}} works.
						if task.Config == nil {
							task.Config = models.JSONMap{}
						}
						if sched.Config != nil {
							for k, v := range sched.Config {
								if _, exists := task.Config[k]; !exists {
									task.Config[k] = v
								}
							}
						}
						handledAsFlow = true
					}
				}
			}

			if !handledAsFlow {
				// Legacy SIMPLE flow that references a stored Task by id
				// inside its flowConfig — execute that task directly.
				resolved := false
				if flow.FlowConfig != nil {
					if resolvedTask, err := m.resolveTaskReferences(ctx, flow.FlowConfig); err == nil && resolvedTask != nil {
						task.Type = models.JobType(resolvedTask.JobType)
						task.Config = resolvedTask.Config
						resolved = true
						log.Info().
							Str("task_id", resolvedTask.ID).
							Str("job_type", resolvedTask.JobType).
							Msg("Resolved task reference in flow node (manual trigger)")
					}
				}
				if !resolved {
					if flow.JobType != nil {
						task.Type = models.JobType(*flow.JobType)
					} else {
						task.Type = sched.Type
					}
					task.Config = flow.Config
				}
			}

			m.updateExecutionStatus(ctx, executionID, models.ExecutionStatusRunning)
			m.broadcastExecutionStatus(executionID, "RUNNING")

			if err := m.workerPool.Submit(task); err != nil {
				errMsg := err.Error()
				m.failExecution(ctx, executionID, errMsg)
				return nil, fmt.Errorf("failed to submit flow task: %w", err)
			}

			if firstExecution == nil {
				firstExecution = execution
			}

			log.Info().
				Str("scheduler_id", schedulerID).
				Str("flow_id", flow.ID).
				Str("execution_id", executionID).
				Msg("Flow manually triggered")
		}
		return firstExecution, nil
	}

	// Fallback: no attached flows, use scheduler's own type/config
	executionID := idgen.New()
	execution := &models.Execution{
		ID:          executionID,
		SchedulerID: schedulerID,
		ProjectID:   sched.ProjectID,
		TriggerType: models.TriggerTypeManual,
		Status:      models.ExecutionStatusPending,
		StartedAt:   now,
		Input:       input,
		IPAddress:   ipAddress,
	}

	query := `
		INSERT INTO executions (id, scheduler_id, project_id, trigger_type, status, started_at, input, ip_address)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	_, err = m.db.Pool.Exec(ctx, query,
		execution.ID,
		execution.SchedulerID,
		execution.ProjectID,
		execution.TriggerType,
		execution.Status,
		execution.StartedAt,
		execution.Input,
		execution.IPAddress,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create execution: %w", err)
	}

	timeout := time.Duration(sched.Timeout) * time.Second
	if timeout == 0 {
		timeout = 5 * time.Minute
	}

	task := &worker.Task{
		ID:          idgen.New(),
		SchedulerID: schedulerID,
		ProjectID:   sched.ProjectID,
		ExecutionID: executionID,
		Type:        sched.Type,
		Config:      sched.Config,
		Timeout:     timeout,
		RetryCount:  sched.RetryCount,
		RetryDelay:  time.Duration(sched.RetryDelay) * time.Second,
		TriggerType: models.TriggerTypeManual,
		CreatedAt:   now,
	}

	if err := m.updateExecutionStatus(ctx, executionID, models.ExecutionStatusRunning); err != nil {
		log.Error().Err(err).Str("execution_id", executionID).Msg("Failed to update execution status")
	}
	m.broadcastExecutionStatus(executionID, "RUNNING")

	if err := m.workerPool.Submit(task); err != nil {
		errMsg := err.Error()
		m.failExecution(ctx, executionID, errMsg)
		return nil, fmt.Errorf("failed to submit task: %w", err)
	}

	log.Info().
		Str("scheduler_id", schedulerID).
		Str("execution_id", executionID).
		Msg("Job manually triggered")

	return execution, nil
}

// GetJobStatus returns the status of a job
func (m *Manager) GetJobStatus(schedulerID string) (*models.Scheduler, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if job, exists := m.jobs[schedulerID]; exists {
		nextRun, _ := job.NextRun()
		return &models.Scheduler{
			ID:        schedulerID,
			Status:    models.JobStatusActive,
			NextRunAt: &nextRun,
		}, nil
	}

	return nil, fmt.Errorf("job not found")
}

// loadSchedulers loads active schedulers from database
func (m *Manager) loadSchedulers() error {
	ctx := context.Background()

	query := `
		SELECT id, name, description, type, schedule, timezone, status, config, 
		       timeout, retry_count, retry_delay, project_id, created_by
		FROM schedulers 
		WHERE status = 'ACTIVE' AND deleted_at IS NULL
	`

	rows, err := m.db.Pool.Query(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to query schedulers: %w", err)
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var s models.Scheduler
		var configJSON []byte

		err := rows.Scan(
			&s.ID, &s.Name, &s.Description, &s.Type, &s.Schedule, &s.Timezone,
			&s.Status, &configJSON, &s.Timeout, &s.RetryCount, &s.RetryDelay,
			&s.ProjectID, &s.CreatedBy,
		)
		if err != nil {
			log.Error().Err(err).Msg("Failed to scan scheduler")
			continue
		}

		// Parse config JSON
		if len(configJSON) > 0 {
			if err := json.Unmarshal(configJSON, &s.Config); err != nil {
				log.Error().Err(err).Str("scheduler_id", s.ID).Msg("Failed to parse config")
				continue
			}
		}

		// Add job to scheduler
		if err := m.AddJob(&s); err != nil {
			log.Error().
				Err(err).
				Str("scheduler_id", s.ID).
				Msg("Failed to add job")
			continue
		}

		count++
	}

	log.Info().Int("count", count).Msg("Loaded schedulers from database")
	return nil
}

// createJobFunc creates the job function for a scheduler
func (m *Manager) createJobFunc(s *models.Scheduler) func() {
	return func() {
		ctx := context.Background()

		log.Info().
			Str("scheduler_id", s.ID).
			Str("name", s.Name).
			Msg("Executing scheduled job")

		// Update last run time
		now := time.Now()
		if err := m.updateLastRun(s.ID, &now); err != nil {
			log.Error().Err(err).Str("scheduler_id", s.ID).Msg("Failed to update last run")
		}

		// Check for attached flows
		flows, err := m.getAttachedFlows(ctx, s.ID)
		if err != nil {
			log.Error().Err(err).Str("scheduler_id", s.ID).Msg("Failed to query attached flows")
		}

		if len(flows) > 0 {
			// Execute attached flows sequentially
			for _, flow := range flows {
				if err := m.executeFlow(ctx, s, flow, models.TriggerTypeSchedule, now); err != nil {
					log.Error().Err(err).
						Str("scheduler_id", s.ID).
						Str("flow_id", flow.ID).
						Msg("Failed to execute attached flow")
				}
			}
		} else {
			// Fallback: use scheduler's own type/config
			if err := m.executeSchedulerDirect(ctx, s, models.TriggerTypeSchedule, now); err != nil {
				log.Error().Err(err).Str("scheduler_id", s.ID).Msg("Failed to execute scheduler directly")
			}
		}

		// Update next run time
		m.mu.RLock()
		if job, exists := m.jobs[s.ID]; exists {
			nextRun, _ := job.NextRun()
			m.updateNextRun(s.ID, &nextRun)
		}
		m.mu.RUnlock()
	}
}

// getScheduler retrieves a scheduler from database
func (m *Manager) getScheduler(ctx context.Context, id string) (*models.Scheduler, error) {
	query := `
		SELECT id, name, type, config, timeout, retry_count, retry_delay, project_id
		FROM schedulers 
		WHERE id = $1 AND deleted_at IS NULL
	`

	var s models.Scheduler
	var configJSON []byte

	err := m.db.Pool.QueryRow(ctx, query, id).Scan(
		&s.ID, &s.Name, &s.Type, &configJSON, &s.Timeout,
		&s.RetryCount, &s.RetryDelay, &s.ProjectID,
	)
	if err != nil {
		return nil, err
	}

	// Parse config
	if len(configJSON) > 0 {
		json.Unmarshal(configJSON, &s.Config)
	}

	return &s, nil
}

// updateLastRun updates the last run time
func (m *Manager) updateLastRun(id string, t *time.Time) error {
	ctx := context.Background()
	query := `UPDATE schedulers SET last_run_at = $1 WHERE id = $2`
	_, err := m.db.Pool.Exec(ctx, query, t, id)
	return err
}

// updateNextRun updates the next run time
func (m *Manager) updateNextRun(id string, t *time.Time) error {
	ctx := context.Background()
	query := `UPDATE schedulers SET next_run_at = $1 WHERE id = $2`
	_, err := m.db.Pool.Exec(ctx, query, t, id)
	return err
}

// updateExecutionStatus updates execution status
func (m *Manager) updateExecutionStatus(ctx context.Context, id string, status models.ExecutionStatus) error {
	query := `UPDATE executions SET status = $1 WHERE id = $2`
	_, err := m.db.Pool.Exec(ctx, query, status, id)
	return err
}

// failExecution marks an execution as failed
func (m *Manager) failExecution(ctx context.Context, id string, errorMsg string) {
	query := `
		UPDATE executions 
		SET status = $1, completed_at = NOW(), error_message = $2 
		WHERE id = $3
	`
	if _, err := m.db.Pool.Exec(ctx, query, models.ExecutionStatusFailed, errorMsg, id); err != nil {
		log.Error().Err(err).Str("execution_id", id).Msg("Failed to mark execution as failed")
	}
}

// ListJobs returns all managed jobs
func (m *Manager) ListJobs() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	ids := make([]string, 0, len(m.jobs))
	for id := range m.jobs {
		ids = append(ids, id)
	}
	return ids
}

// attachedFlow holds flow data fetched from the scheduler_flows + flows join
type attachedFlow struct {
	ID         string
	Type       models.FlowType
	JobType    *string
	Config     models.JSONMap
	FlowConfig models.JSONMap
}

// getAttachedFlows queries flows attached to a scheduler, ordered by execution_order
func (m *Manager) getAttachedFlows(ctx context.Context, schedulerID string) ([]attachedFlow, error) {
	query := `
		SELECT f.id, f.type, f.job_type, f.config, f.flow_config
		FROM scheduler_flows sf
		JOIN flows f ON sf.flow_id = f.id
		WHERE sf.scheduler_id = $1
		ORDER BY sf.execution_order
	`

	rows, err := m.db.Pool.Query(ctx, query, schedulerID)
	if err != nil {
		return nil, fmt.Errorf("failed to query attached flows: %w", err)
	}
	defer rows.Close()

	var flows []attachedFlow
	for rows.Next() {
		var f attachedFlow
		var configJSON, flowConfigJSON []byte

		if err := rows.Scan(&f.ID, &f.Type, &f.JobType, &configJSON, &flowConfigJSON); err != nil {
			log.Error().Err(err).Msg("Failed to scan attached flow")
			continue
		}

		if len(configJSON) > 0 {
			json.Unmarshal(configJSON, &f.Config)
		}
		if len(flowConfigJSON) > 0 {
			json.Unmarshal(flowConfigJSON, &f.FlowConfig)
		}

		flows = append(flows, f)
	}

	return flows, nil
}

// getTask retrieves a task from the database by ID
func (m *Manager) getTask(ctx context.Context, taskID string) (*models.Task, error) {
	query := `SELECT id, name, description, job_type, config, status, project_id, created_by, created_at, updated_at
              FROM tasks WHERE id = $1`
	var t models.Task
	var configJSON []byte
	err := m.db.Pool.QueryRow(ctx, query, taskID).Scan(
		&t.ID, &t.Name, &t.Description, &t.JobType, &configJSON,
		&t.Status, &t.ProjectID, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if len(configJSON) > 0 {
		json.Unmarshal(configJSON, &t.Config)
	}
	return &t, nil
}

// resolveTaskReferences checks flow nodes for taskId references and resolves the first one found
func (m *Manager) resolveTaskReferences(ctx context.Context, flowConfig models.JSONMap) (*models.Task, error) {
	if flowConfig == nil {
		return nil, nil
	}
	var fc models.FlowConfig
	if fcBytes, err := json.Marshal(flowConfig); err == nil {
		json.Unmarshal(fcBytes, &fc)
	}
	for _, node := range fc.Nodes {
		if node.TaskID != "" {
			resolvedTask, err := m.getTask(ctx, node.TaskID)
			if err != nil {
				log.Error().Err(err).Str("task_id", node.TaskID).Msg("Failed to resolve task")
				continue
			}
			return resolvedTask, nil
		}
	}
	return nil, nil
}

// executeFlow creates an execution record and submits a task for an attached flow
func (m *Manager) executeFlow(ctx context.Context, s *models.Scheduler, flow attachedFlow, triggerType models.TriggerType, now time.Time) error {
	executionID := idgen.New()

	query := `
		INSERT INTO executions (id, scheduler_id, project_id, trigger_type, status, started_at, flow_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	_, err := m.db.Pool.Exec(ctx, query,
		executionID,
		s.ID,
		s.ProjectID,
		triggerType,
		models.ExecutionStatusPending,
		now,
		flow.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to create execution for flow %s: %w", flow.ID, err)
	}

	timeout := time.Duration(s.Timeout) * time.Second
	if timeout == 0 {
		timeout = 5 * time.Minute
	}

	task := &worker.Task{
		ID:          idgen.New(),
		SchedulerID: s.ID,
		ProjectID:   s.ProjectID,
		ExecutionID: executionID,
		FlowID:      &flow.ID,
		Timeout:     timeout,
		RetryCount:  s.RetryCount,
		RetryDelay:  time.Duration(s.RetryDelay) * time.Second,
		TriggerType: triggerType,
		CreatedAt:   now,
	}

	// Both DAG and SIMPLE flows ship work as a graph of nodes. Always
	// route to FlowExecutor when a node graph exists — the legacy
	// SIMPLE-only path used the scheduler's top-level config which
	// has no per-node fields (e.g. an HTTP node's url), so cron runs
	// failed with "URL is required for HTTP jobs". See TriggerJob for
	// the matching fix on the manual-trigger path.
	handledAsFlow := false
	if flow.FlowConfig != nil && hasFlowGraph(flow.FlowConfig) {
		var flowConfig models.FlowConfig
		if flowConfigBytes, err := json.Marshal(flow.FlowConfig); err == nil {
			if uerr := json.Unmarshal(flowConfigBytes, &flowConfig); uerr == nil && len(flowConfig.Nodes) > 0 {
				task.Type = models.JobTypeHTTP // placeholder; FlowExecutor dispatches per-node
				task.FlowConfig = &flowConfig
				task.Config = flow.Config
				if task.Config == nil {
					task.Config = models.JSONMap{}
				}
				if s.Config != nil {
					for k, v := range s.Config {
						if _, exists := task.Config[k]; !exists {
							task.Config[k] = v
						}
					}
				}
				handledAsFlow = true
			}
		}
	}

	if !handledAsFlow {
		// SIMPLE flow that references a saved Task by id
		resolved := false
		if flow.FlowConfig != nil {
			if resolvedTask, err := m.resolveTaskReferences(ctx, flow.FlowConfig); err == nil && resolvedTask != nil {
				task.Type = models.JobType(resolvedTask.JobType)
				task.Config = resolvedTask.Config
				resolved = true
				log.Info().
					Str("task_id", resolvedTask.ID).
					Str("job_type", resolvedTask.JobType).
					Msg("Resolved task reference in flow node")
			}
		}
		if !resolved {
			// Legacy fallback: use the flow's own jobType/config
			if flow.JobType != nil {
				task.Type = models.JobType(*flow.JobType)
			} else {
				task.Type = s.Type
			}
			task.Config = flow.Config
		}
	}

	// Update status to running
	m.updateExecutionStatus(ctx, executionID, models.ExecutionStatusRunning)
	m.broadcastExecutionStatus(executionID, "RUNNING")

	if err := m.workerPool.Submit(task); err != nil {
		errMsg := err.Error()
		m.failExecution(ctx, executionID, errMsg)
		return fmt.Errorf("failed to submit flow task: %w", err)
	}

	log.Info().
		Str("scheduler_id", s.ID).
		Str("flow_id", flow.ID).
		Str("execution_id", executionID).
		Str("flow_type", string(flow.Type)).
		Msg("Flow execution submitted")

	return nil
}

// executeSchedulerDirect creates an execution and task using the scheduler's own type/config (no attached flows)
func (m *Manager) executeSchedulerDirect(ctx context.Context, s *models.Scheduler, triggerType models.TriggerType, now time.Time) error {
	executionID := idgen.New()

	query := `
		INSERT INTO executions (id, scheduler_id, project_id, trigger_type, status, started_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	_, err := m.db.Pool.Exec(ctx, query,
		executionID,
		s.ID,
		s.ProjectID,
		triggerType,
		models.ExecutionStatusPending,
		now,
	)
	if err != nil {
		return fmt.Errorf("failed to create execution: %w", err)
	}

	timeout := time.Duration(s.Timeout) * time.Second
	if timeout == 0 {
		timeout = 5 * time.Minute
	}

	task := &worker.Task{
		ID:          idgen.New(),
		SchedulerID: s.ID,
		ProjectID:   s.ProjectID,
		ExecutionID: executionID,
		Type:        s.Type,
		Config:      s.Config,
		Timeout:     timeout,
		RetryCount:  s.RetryCount,
		RetryDelay:  time.Duration(s.RetryDelay) * time.Second,
		TriggerType: triggerType,
		CreatedAt:   now,
	}

	m.updateExecutionStatus(ctx, executionID, models.ExecutionStatusRunning)
	m.broadcastExecutionStatus(executionID, "RUNNING")

	if err := m.workerPool.Submit(task); err != nil {
		errMsg := err.Error()
		m.failExecution(ctx, executionID, errMsg)
		return fmt.Errorf("failed to submit task: %w", err)
	}

	return nil
}


// hasFlowGraph reports whether the JSONMap looks like a flow editor
// flowConfig (object with `nodes` array containing at least one entry).
// SIMPLE flows that wrap a single saved-Task reference end up here too,
// and we want them to route through the FlowExecutor when their nodes
// carry real per-node config (url, query, command, …); otherwise the
// caller falls through to the legacy resolveTaskReferences path.
func hasFlowGraph(fc models.JSONMap) bool {
	if fc == nil {
		return false
	}
	nodes, ok := fc["nodes"].([]interface{})
	if !ok || len(nodes) == 0 {
		return false
	}
	// Has at least one non-START/END node with a non-empty config — a
	// stub flow with just START → END shouldn't override the legacy
	// direct executor.
	for _, raw := range nodes {
		n, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		t, _ := n["type"].(string)
		if t == "START" || t == "END" || t == "" {
			continue
		}
		return true
	}
	return false
}
