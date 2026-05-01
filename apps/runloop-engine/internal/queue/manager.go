package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"os"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog/log"

	"github.com/runloop/runloop-engine/internal/db"
	"github.com/runloop/runloop-engine/internal/executor"
	"github.com/runloop/runloop-engine/internal/models"
	"github.com/runloop/runloop-engine/internal/worker"
)

// Manager is the top-level coordinator. It loads queue definitions from
// the DB, instantiates one Backend per (backend-type, queue) pair,
// supervises the consume loops, and enforces per-queue concurrency caps.
//
// Lifecycle:
//
//	mgr := NewManager(db, flowExec)
//	mgr.Start(ctx)   // spawns one consumer goroutine per enabled queue
//	// ... serve API traffic ...
//	mgr.Stop()       // cancels all consumers, closes backend connections
type Manager struct {
	db       *db.Postgres
	flowExec *executor.FlowExecutor
	dedupe   *Dedupe

	mu         sync.Mutex
	backends   map[string]Backend       // key: backend type ("postgres" etc.) — one instance per type
	consumers  map[string]context.CancelFunc // key: queue name
	workerID   string
}

// NewManager wires up the coordinator but does not start any consumers.
// Call Start to begin processing.
func NewManager(pg *db.Postgres, flowExec *executor.FlowExecutor) *Manager {
	host, _ := os.Hostname()
	if host == "" {
		host = fmt.Sprintf("worker-%d", rand.Intn(10000))
	}
	return &Manager{
		db:        pg,
		flowExec:  flowExec,
		dedupe:    NewDedupe(pg),
		backends:  map[string]Backend{},
		consumers: map[string]context.CancelFunc{},
		workerID:  host,
	}
}

// Producer returns a producer bound to this manager.
func (m *Manager) Producer() *Producer { return NewProducer(m) }

// Dedupe exposes the shared dedupe ledger (used by HTTP handlers for e.g.
// the manual retry endpoint).
func (m *Manager) Dedupe() *Dedupe { return m.dedupe }

// Start scans all enabled queues and begins consuming each. Also starts the
// background reaper (for stuck PG leases) and dedupe janitor.
func (m *Manager) Start(ctx context.Context) error {
	queues, err := m.listEnabledQueues(ctx)
	if err != nil {
		return fmt.Errorf("list queues: %w", err)
	}
	for _, q := range queues {
		if err := m.StartQueue(ctx, q); err != nil {
			log.Error().Err(err).Str("queue", q.Name).Msg("failed to start queue consumer")
		}
	}

	// Background janitors.
	go m.runReaper(ctx)
	go m.runDedupeJanitor(ctx)

	log.Info().Int("count", len(queues)).Msg("queue manager started")
	return nil
}

// Stop cancels every consumer and closes every backend. Safe to call
// multiple times.
func (m *Manager) Stop() {
	m.mu.Lock()
	for name, cancel := range m.consumers {
		cancel()
		delete(m.consumers, name)
	}
	for _, b := range m.backends {
		_ = b.Close()
	}
	m.backends = map[string]Backend{}
	m.mu.Unlock()
}

// StartQueue spins up a consume loop for one queue. Idempotent — calling
// again for a running queue is a no-op.
func (m *Manager) StartQueue(parent context.Context, q *QueueDef) error {
	m.mu.Lock()
	if _, running := m.consumers[q.Name]; running {
		m.mu.Unlock()
		return nil
	}
	ctx, cancel := context.WithCancel(parent)
	m.consumers[q.Name] = cancel
	m.mu.Unlock()

	backend, err := m.getBackend(q)
	if err != nil {
		return err
	}

	handler := m.buildHandler(q)

	go func() {
		log.Info().Str("queue", q.Name).Str("backend", q.Backend).Int("concurrency", q.Concurrency).Msg("consumer started")
		for {
			if err := backend.Consume(ctx, q, handler); err != nil {
				if errors.Is(err, context.Canceled) {
					return
				}
				log.Error().Err(err).Str("queue", q.Name).Msg("consumer returned error, restarting in 5s")
				select {
				case <-ctx.Done():
					return
				case <-time.After(5 * time.Second):
				}
				continue
			}
			return
		}
	}()
	return nil
}

// StopQueue cancels an individual queue consumer.
func (m *Manager) StopQueue(name string) {
	m.mu.Lock()
	if cancel, ok := m.consumers[name]; ok {
		cancel()
		delete(m.consumers, name)
	}
	m.mu.Unlock()
}

// buildHandler returns the per-queue handler that runs the flow and
// applies retry/DLQ policy based on the outcome.
//
// Each handler invocation also writes an `executions` row so queue-driven
// flow runs show up in the same UI as scheduler-driven runs — otherwise
// operators have no way to see what their queues have been doing.
// The execution id = queue_item.id, so one queue job can produce multiple
// executions (one per retry attempt) with matching ids that differ only
// in retry_attempt.
func (m *Manager) buildHandler(q *QueueDef) Handler {
	backend, _ := m.getBackend(q) // must exist — StartQueue ensured it

	return func(ctx context.Context, msg *Message) error {
		// Load the flow config fresh on each delivery so queue workers pick
		// up flow edits without a restart.
		flowConfig, err := m.loadFlowConfig(ctx, q.FlowID)
		if err != nil {
			log.Error().Err(err).Str("queue", q.Name).Str("flow_id", q.FlowID).Msg("failed to load flow config for queue message")
			return m.handleFailure(ctx, backend, q, msg, fmt.Sprintf("load flow: %v", err))
		}

		// Execution id per delivery so retries show up as separate rows in
		// the history. Use `<msg-id>-<attempt>` so it's obvious which rows
		// belong to the same logical job.
		execID := fmt.Sprintf("%s-%d", msg.ID, msg.Attempts)
		startedAt := time.Now()
		m.insertExecution(ctx, q, msg, execID, startedAt)

		task := &worker.Task{
			ID:          msg.ID,
			SchedulerID: "queue:" + q.Name,
			ProjectID:   q.ProjectID,
			ExecutionID: execID,
			Type:        models.JobTypeHTTP, // placeholder, flow executor reads FlowConfig
			FlowConfig:  flowConfig,
			Config:      models.JSONMap{"payload": msg.Payload, "job": msg.Payload},
			Timeout:     time.Duration(q.VisibilitySec) * time.Second,
			TriggerType: models.TriggerTypeQueue,
			CreatedAt:   startedAt,
		}

		result, execErr := m.flowExec.ExecuteFlow(ctx, task, flowConfig)

		// Decide outcome for the execution row + feed retry/DLQ policy.
		switch {
		case execErr != nil:
			m.finishExecution(ctx, execID, "FAILED", startedAt, nil, execErr.Error())
			return m.handleFailure(ctx, backend, q, msg, execErr.Error())

		case result != nil && !result.Success:
			reason := "flow returned Success=false"
			if result.ErrorMessage != nil && *result.ErrorMessage != "" {
				reason = *result.ErrorMessage
			}
			m.finishExecution(ctx, execID, "FAILED", startedAt, result.Output, reason)
			return m.handleFailure(ctx, backend, q, msg, reason)

		default:
			var out models.JSONMap
			if result != nil {
				out = result.Output
			}
			m.finishExecution(ctx, execID, "SUCCESS", startedAt, out, "")
			if err := backend.Ack(ctx, q, msg.Handle); err != nil {
				log.Error().Err(err).Str("queue", q.Name).Str("job", msg.ID).Msg("ack failed")
				return err
			}
			return nil
		}
	}
}

// insertExecution writes a RUNNING row. Failures are logged but non-fatal:
// observability shouldn't block delivery.
func (m *Manager) insertExecution(ctx context.Context, q *QueueDef, msg *Message, execID string, startedAt time.Time) {
	inputBytes, _ := json.Marshal(msg.Payload)
	_, err := m.db.Pool.Exec(ctx, `
		INSERT INTO executions
			(id, scheduler_id, project_id, trigger_type, status, started_at, input, retry_attempt, flow_id)
		VALUES ($1, $2, $3, 'QUEUE', 'RUNNING', $4, $5::jsonb, $6, $7)
		ON CONFLICT (id) DO NOTHING
	`, execID, "queue:"+q.Name, q.ProjectID, startedAt, string(inputBytes), msg.Attempts-1, q.FlowID)
	if err != nil {
		log.Error().Err(err).Str("queue", q.Name).Str("exec", execID).Msg("insertExecution failed")
	}
}

// finishExecution updates the RUNNING row with the final status + duration.
// Uses Background-derived context so it survives a cancelled jobCtx (e.g.
// visibility timeout) — the row would otherwise be stuck in RUNNING forever.
func (m *Manager) finishExecution(parent context.Context, execID, status string, startedAt time.Time, output models.JSONMap, errMsg string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = parent // silence unused — kept in signature for future use

	outBytes, _ := json.Marshal(output)
	completedAt := time.Now()
	duration := completedAt.Sub(startedAt).Milliseconds()

	var errPtr *string
	if errMsg != "" {
		errPtr = &errMsg
	}

	_, err := m.db.Pool.Exec(ctx, `
		UPDATE executions
		SET status=$1, completed_at=$2, duration_ms=$3, output=$4::jsonb, error_message=$5
		WHERE id=$6
	`, status, completedAt, duration, string(outBytes), errPtr, execID)
	if err != nil {
		log.Error().Err(err).Str("exec", execID).Msg("finishExecution failed")
	}
}

// handleFailure decides between retry (Nack) and DLQ based on attempts vs
// max_attempts, and asks the backend to act accordingly.
//
// Uses a fresh short-deadline context for the bookkeeping call — ctx passed
// in may have been cancelled (e.g. the jobCtx just timed out), in which case
// we still need to record the outcome.
func (m *Manager) handleFailure(ctx context.Context, backend Backend, q *QueueDef, msg *Message, reason string) error {
	opCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if msg.Attempts >= q.MaxAttempts {
		log.Warn().Str("queue", q.Name).Str("job", msg.ID).Int("attempts", msg.Attempts).Str("reason", reason).Msg("sending to DLQ")
		if err := backend.DeadLetter(opCtx, q, msg.Handle, reason); err != nil {
			log.Error().Err(err).Str("queue", q.Name).Str("job", msg.ID).Msg("DLQ failed")
		}
		return nil
	}
	delay := m.backoffDelay(q, msg.Attempts)
	log.Info().Str("queue", q.Name).Str("job", msg.ID).Int("attempts", msg.Attempts).Dur("requeue_after", delay).Str("reason", reason).Msg("requeue for retry")
	if err := backend.Nack(opCtx, q, msg.Handle, delay, reason); err != nil {
		log.Error().Err(err).Str("queue", q.Name).Str("job", msg.ID).Msg("nack failed")
		return err
	}
	return nil
}

// backoffDelay computes the wait before the next retry using exponential
// backoff with jitter (cap at backoff_max_ms).
func (m *Manager) backoffDelay(q *QueueDef, attempts int) time.Duration {
	// attempts is the count after the current failure (1 on first fail).
	exp := math.Pow(q.BackoffMult, float64(attempts-1))
	ms := float64(q.BackoffInitMs) * exp
	if ms > float64(q.BackoffMaxMs) {
		ms = float64(q.BackoffMaxMs)
	}
	// Full jitter — ± 25% to avoid thundering herd on shared failure modes.
	jitter := 1 + (rand.Float64()*0.5 - 0.25)
	return time.Duration(ms*jitter) * time.Millisecond
}

// loadFlowConfig fetches the flow's flow_config JSON and unmarshals it.
func (m *Manager) loadFlowConfig(ctx context.Context, flowID string) (*models.FlowConfig, error) {
	var raw []byte
	err := m.db.Pool.QueryRow(ctx,
		`SELECT flow_config FROM flows WHERE id=$1`, flowID,
	).Scan(&raw)
	if err != nil {
		return nil, err
	}
	var cfg models.FlowConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("unmarshal flow_config: %w", err)
	}
	return &cfg, nil
}

// GetQueue loads one queue definition by name. Returns pgx.ErrNoRows if
// not found (callers translate to 404).
func (m *Manager) GetQueue(ctx context.Context, name string) (*QueueDef, error) {
	row := m.db.Pool.QueryRow(ctx, `
		SELECT name, project_id, flow_id, backend, backend_config,
		       concurrency, max_attempts, visibility_sec,
		       backoff_init_ms, backoff_max_ms, backoff_mult, enabled
		FROM job_queues WHERE name=$1`, name)
	return scanQueue(row)
}

// listEnabledQueues is the startup scan that populates the consumer pool.
func (m *Manager) listEnabledQueues(ctx context.Context) ([]*QueueDef, error) {
	rows, err := m.db.Pool.Query(ctx, `
		SELECT name, project_id, flow_id, backend, backend_config,
		       concurrency, max_attempts, visibility_sec,
		       backoff_init_ms, backoff_max_ms, backoff_mult, enabled
		FROM job_queues WHERE enabled = TRUE`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var queues []*QueueDef
	for rows.Next() {
		q, err := scanQueue(rows)
		if err != nil {
			return nil, err
		}
		queues = append(queues, q)
	}
	return queues, rows.Err()
}

func scanQueue(row pgx.Row) (*QueueDef, error) {
	var q QueueDef
	var cfgBytes []byte
	if err := row.Scan(
		&q.Name, &q.ProjectID, &q.FlowID, &q.Backend, &cfgBytes,
		&q.Concurrency, &q.MaxAttempts, &q.VisibilitySec,
		&q.BackoffInitMs, &q.BackoffMaxMs, &q.BackoffMult, &q.Enabled,
	); err != nil {
		return nil, err
	}
	if len(cfgBytes) > 0 {
		_ = json.Unmarshal(cfgBytes, &q.BackendConfig)
	}
	if q.BackendConfig == nil {
		q.BackendConfig = map[string]interface{}{}
	}
	return &q, nil
}

// getBackend returns a cached Backend instance for the given queue's
// backend type. Instances are shared across queues of the same type, since
// they usually wrap a connection pool.
func (m *Manager) getBackend(q *QueueDef) (Backend, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if b, ok := m.backends[q.Backend]; ok {
		return b, nil
	}
	b, err := m.newBackend(q.Backend)
	if err != nil {
		return nil, err
	}
	m.backends[q.Backend] = b
	return b, nil
}

// newBackend is the registry. Adding a new backend = one case here.
func (m *Manager) newBackend(kind string) (Backend, error) {
	switch kind {
	case "postgres", "":
		return NewPostgresBackend(m.db, m.workerID), nil
	case "redis":
		return NewRedisBackend(m.db, m.workerID), nil
	case "rabbitmq":
		return NewRabbitBackend(m.db, m.workerID), nil
	case "kafka":
		return NewKafkaBackend(m.db, m.workerID), nil
	default:
		return nil, fmt.Errorf("unknown backend: %s", kind)
	}
}

// runReaper periodically resets leases that have expired (i.e. a worker
// crashed mid-processing) so the job becomes PENDING again.
// PG-backend only; other backends use their native lease mechanism.
func (m *Manager) runReaper(ctx context.Context) {
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			tag, err := m.db.Pool.Exec(ctx, `
				UPDATE job_queue_items
				SET status='PENDING', locked_by=NULL, locked_until=NULL
				WHERE status='PROCESSING' AND locked_until < NOW()
			`)
			if err != nil {
				log.Error().Err(err).Msg("reaper failed")
				continue
			}
			if n := tag.RowsAffected(); n > 0 {
				log.Info().Int64("reclaimed", n).Msg("reaper recovered stuck jobs")
			}
		}
	}
}

// runDedupeJanitor deletes expired dedupe keys. Runs infrequently — missed
// cleanups just mean dead rows pile up, not incorrectness.
func (m *Manager) runDedupeJanitor(ctx context.Context) {
	t := time.NewTicker(10 * time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if n, err := m.dedupe.Reap(ctx); err != nil {
				log.Error().Err(err).Msg("dedupe janitor failed")
			} else if n > 0 {
				log.Info().Int64("reaped", n).Msg("dedupe janitor cleaned expired keys")
			}
		}
	}
}
