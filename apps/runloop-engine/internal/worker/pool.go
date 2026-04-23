package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"runtime"
	"sync"
	"time"

	"github.com/runloop/runloop-engine/internal/config"
	"github.com/runloop/runloop-engine/internal/db"
	"github.com/runloop/runloop-engine/internal/idgen"
	"github.com/runloop/runloop-engine/internal/models"
	"github.com/runloop/runloop-engine/internal/websocket"
	"github.com/rs/zerolog/log"
)

// Task represents a unit of work
type Task struct {
	ID           string
	SchedulerID  string
	ProjectID    string
	ExecutionID  string
	FlowID       *string
	Type         models.JobType
	Config       models.JSONMap
	FlowConfig   *models.FlowConfig
	Timeout      time.Duration
	RetryCount   int
	RetryDelay   time.Duration
	RetryAttempt int
	TriggerType  models.TriggerType
	CreatedAt    time.Time
}

// Executor handles job execution
type Executor interface {
	Execute(ctx context.Context, task *Task) (*models.JobResult, error)
}

// Pool represents a worker pool
type Pool struct {
	config      *config.Config
	db          *db.Postgres
	executor    Executor
	hub         *websocket.Hub

	// Channels
	taskQueue   chan *Task
	resultQueue chan *Result

	// Control
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup

	// Callbacks
	onExecutionComplete func(ctx context.Context, schedulerID string, status string)

	// Cancellation registry: executionID → cancel func
	cancelMu      sync.RWMutex
	runningCancels map[string]context.CancelFunc

	// Metrics
	mu        sync.RWMutex
	running   int
	completed int64
	failed    int64
	workers   int
}

// Result represents the result of task execution
type Result struct {
	Task       *Task
	Success    bool
	Output     models.JSONMap
	Error      error
	Logs       string
	Duration   time.Duration
	RetryAfter time.Duration
}

// NewPool creates a new worker pool
func NewPool(cfg *config.Config, database *db.Postgres, executor Executor, hub *websocket.Hub) *Pool {
	ctx, cancel := context.WithCancel(context.Background())

	return &Pool{
		config:         cfg,
		db:             database,
		executor:       executor,
		hub:            hub,
		taskQueue:      make(chan *Task, cfg.WorkerQueueSize),
		resultQueue:    make(chan *Result, cfg.WorkerQueueSize),
		ctx:            ctx,
		cancel:         cancel,
		workers:        cfg.WorkerCount,
		runningCancels: make(map[string]context.CancelFunc),
	}
}

// CancelExecution signals a running execution to stop. Returns true if the
// execution was running and cancellation was dispatched.
func (p *Pool) CancelExecution(executionID string) bool {
	p.cancelMu.Lock()
	defer p.cancelMu.Unlock()
	if fn, ok := p.runningCancels[executionID]; ok {
		fn()
		delete(p.runningCancels, executionID)
		return true
	}
	return false
}

// IsRunning reports whether the execution is currently tracked as running.
func (p *Pool) IsRunning(executionID string) bool {
	p.cancelMu.RLock()
	defer p.cancelMu.RUnlock()
	_, ok := p.runningCancels[executionID]
	return ok
}

// Start starts the worker pool
func (p *Pool) Start() {
	log.Info().
		Int("workers", p.workers).
		Int("queue_size", cap(p.taskQueue)).
		Msg("Starting worker pool")

	// Start workers
	for i := 0; i < p.workers; i++ {
		p.wg.Add(1)
		go p.worker(i)
	}

	// Start result processor
	p.wg.Add(1)
	go p.resultProcessor()
}

// Stop stops the worker pool gracefully
func (p *Pool) Stop() {
	log.Info().Msg("Stopping worker pool...")

	// Signal cancellation
	p.cancel()

	// Wait for all workers to finish
	done := make(chan struct{})
	go func() {
		p.wg.Wait()
		close(done)
	}()

	// Wait with timeout
	select {
	case <-done:
		log.Info().Msg("Worker pool stopped gracefully")
	case <-time.After(30 * time.Second):
		log.Warn().Msg("Worker pool stop timeout, forcing shutdown")
	}
}

// Submit submits a task to the pool
func (p *Pool) Submit(task *Task) error {
	select {
	case p.taskQueue <- task:
		log.Debug().
			Str("task_id", task.ID).
			Str("scheduler_id", task.SchedulerID).
			Msg("Task submitted to queue")
		return nil
	case <-time.After(5 * time.Second):
		return fmt.Errorf("task queue is full")
	}
}

// GetStats returns current pool statistics
func (p *Pool) GetStats() map[string]interface{} {
	p.mu.RLock()
	defer p.mu.RUnlock()

	return map[string]interface{}{
		"workers":    p.workers,
		"running":    p.running,
		"completed":  p.completed,
		"failed":     p.failed,
		"queue_size": len(p.taskQueue),
		"queue_cap":  cap(p.taskQueue),
		"goroutines": runtime.NumGoroutine(),
	}
}

// SetOnExecutionComplete sets a callback invoked after each execution completes
func (p *Pool) SetOnExecutionComplete(fn func(ctx context.Context, schedulerID string, status string)) {
	p.onExecutionComplete = fn
}

// worker processes tasks from the queue
func (p *Pool) worker(id int) {
	defer p.wg.Done()

	logger := log.With().Int("worker_id", id).Logger()
	logger.Debug().Msg("Worker started")

	for {
		select {
		case <-p.ctx.Done():
			logger.Debug().Msg("Worker shutting down")
			return

		case task := <-p.taskQueue:
			p.executeTask(task)
		}
	}
}

// executeTask executes a single task
func (p *Pool) executeTask(task *Task) {
	// Update running count
	p.mu.Lock()
	p.running++
	p.mu.Unlock()

	defer func() {
		p.mu.Lock()
		p.running--
		p.mu.Unlock()
	}()

	logger := log.With().
		Str("task_id", task.ID).
		Str("execution_id", task.ExecutionID).
		Str("type", string(task.Type)).
		Logger()

	logger.Info().Msg("Starting task execution")

	// Create timeout context
	ctx, cancel := context.WithTimeout(p.ctx, task.Timeout)
	defer cancel()

	// Register in cancel registry so API handlers can abort this execution.
	p.cancelMu.Lock()
	p.runningCancels[task.ExecutionID] = cancel
	p.cancelMu.Unlock()
	defer func() {
		p.cancelMu.Lock()
		delete(p.runningCancels, task.ExecutionID)
		p.cancelMu.Unlock()
	}()

	startTime := time.Now()

	// Execute the task
	result, err := p.executor.Execute(ctx, task)

	duration := time.Since(startTime)

	// Prepare result
	res := &Result{
		Task:     task,
		Duration: duration,
	}

	if err != nil {
		res.Success = false
		res.Error = err
		// result may be nil when executor returns (nil, error) — guard against it
		if result != nil {
			res.Logs = result.Logs
		} else {
			res.Logs = fmt.Sprintf("Executor error: %v", err)
		}

		// Check if we should retry
		if task.RetryAttempt < task.RetryCount {
			res.RetryAfter = time.Duration(task.RetryDelay) * time.Second
			logger.Warn().
				Int("retry_attempt", task.RetryAttempt).
				Int("max_retries", task.RetryCount).
				Msg("Task failed, will retry")
		} else {
			logger.Error().
				Err(err).
				Int("retry_attempt", task.RetryAttempt).
				Msg("Task failed, max retries exceeded")
		}
	} else if result == nil {
		// Executor returned (nil, nil) — treat as a failure to avoid nil deref below
		res.Success = false
		res.Error = fmt.Errorf("executor returned nil result")
		res.Logs = "Executor returned nil result without error"
	} else {
		res.Success = true
		res.Output = result.Output
		res.Logs = result.Logs
		logger.Info().
			Dur("duration", duration).
			Msg("Task completed successfully")
	}

	// Send result
	select {
	case p.resultQueue <- res:
	case <-time.After(5 * time.Second):
		logger.Error().Msg("Failed to send result, result queue full")
	}
}

// resultProcessor processes execution results
func (p *Pool) resultProcessor() {
	defer p.wg.Done()

	for {
		select {
		case <-p.ctx.Done():
			return

		case result := <-p.resultQueue:
			p.handleResult(result)
		}
	}
}

// handleResult handles a single execution result
func (p *Pool) handleResult(result *Result) {
	task := result.Task

	// Update metrics
	p.mu.Lock()
	if result.Success {
		p.completed++
	} else {
		p.failed++
	}
	p.mu.Unlock()

	// Update execution in database
	if err := p.updateExecution(task, result); err != nil {
		log.Error().
			Err(err).
			Str("execution_id", task.ExecutionID).
			Msg("Failed to update execution")
	}

	// Broadcast execution update via WebSocket
	if p.hub != nil {
		p.broadcastExecutionUpdate(task.ExecutionID, result)
	}

	// Notify dependency manager of execution completion
	if p.onExecutionComplete != nil {
		status := string(models.ExecutionStatusSuccess)
		if !result.Success {
			status = string(models.ExecutionStatusFailed)
		}
		go p.onExecutionComplete(context.Background(), task.SchedulerID, status)
	}

	// Handle retry if failed
	if !result.Success && result.RetryAfter > 0 && task.RetryAttempt < task.RetryCount {
		go p.scheduleRetry(task, result.RetryAfter)
	}
}

// broadcastExecutionUpdate sends execution status update via WebSocket
func (p *Pool) broadcastExecutionUpdate(executionID string, result *Result) {
	status := "SUCCESS"
	if !result.Success {
		status = "FAILED"
	}

	// Build update message
	update := map[string]interface{}{
		"type":        "execution_update",
		"executionId": executionID,
		"status":      status,
		"durationMs":  int(result.Duration.Milliseconds()),
		"timestamp":   time.Now().Unix(),
	}

	if result.Error != nil {
		update["error"] = result.Error.Error()
	}

	if result.Output != nil {
		update["output"] = result.Output
	}

	if result.Logs != "" {
		update["logs"] = result.Logs
	}

	// Marshal and broadcast
	data, err := json.Marshal(update)
	if err != nil {
		log.Error().Err(err).Msg("Failed to marshal WebSocket message")
		return
	}

	p.hub.Broadcast(executionID, data)
	log.Debug().
		Str("execution_id", executionID).
		Str("status", status).
		Msg("Broadcasted execution update")
}

// updateExecution updates the execution record in database
func (p *Pool) updateExecution(task *Task, result *Result) error {
	ctx := context.Background()

	status := models.ExecutionStatusSuccess
	var errorMsg *string

	if !result.Success {
		status = models.ExecutionStatusFailed
		if result.Error != nil {
			errStr := result.Error.Error()
			errorMsg = &errStr
		}
	}

	durationMs := int(result.Duration.Milliseconds())

	query := `
		UPDATE executions 
		SET status = $1, 
		    completed_at = NOW(), 
		    duration_ms = $2,
		    output = $3,
		    error_message = $4,
		    logs = $5
		WHERE id = $6
	`

	_, err := p.db.Pool.Exec(ctx, query,
		status,
		durationMs,
		result.Output,
		errorMsg,
		result.Logs,
		task.ExecutionID,
	)

	return err
}

// scheduleRetry schedules a task for retry
func (p *Pool) scheduleRetry(task *Task, delay time.Duration) {
	time.Sleep(delay)

	task.RetryAttempt++
	task.ID = idgen.New() // New task ID

	// Create new execution record for retry
	ctx := context.Background()
	newExecutionID := idgen.New()

	query := `
		INSERT INTO executions (id, scheduler_id, project_id, trigger_type, status, started_at, retry_attempt)
		VALUES ($1, $2, $3, $4, $5, NOW(), $6)
	`

	_, err := p.db.Pool.Exec(ctx, query,
		newExecutionID,
		task.SchedulerID,
		task.ProjectID,
		task.TriggerType,
		models.ExecutionStatusPending,
		task.RetryAttempt,
	)

	if err != nil {
		log.Error().
			Err(err).
			Str("scheduler_id", task.SchedulerID).
			Msg("Failed to create retry execution")
		return
	}

	task.ExecutionID = newExecutionID

	// Submit retry
	if err := p.Submit(task); err != nil {
		log.Error().
			Err(err).
			Str("execution_id", newExecutionID).
			Msg("Failed to submit retry task")
	}
}