package executor

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/expr-lang/expr"
	"github.com/rs/zerolog/log"

	"github.com/runloop/runloop-engine/internal/connector"
	"github.com/runloop/runloop-engine/internal/db"
	"github.com/runloop/runloop-engine/internal/idgen"
	"github.com/runloop/runloop-engine/internal/logging"
	"github.com/runloop/runloop-engine/internal/models"
	"github.com/runloop/runloop-engine/internal/worker"
)

// FlowExecutor runs flow-based jobs as a parallel DAG with retry, circuit
// breaker, secret resolution, variable interpolation, and conditional edge
// routing.
type FlowExecutor struct {
	jobExecutor   *JobExecutor
	db            *db.Postgres
	logAggregator *logging.LogAggregator
	cbManager     *CircuitBreakerManager
	secretStore   SecretStore
	queueProducer QueueProducer
	notifyHub     NotifyHub
	dlq           *DeadLetterQueue
	plugins       *PluginRegistry
}

// SecretStore resolves ${{secrets.NAME}} placeholders.
type SecretStore interface {
	GetSecret(ctx context.Context, name string, projectID string) (string, error)
}

// QueueProducer is the minimal surface FlowExecutor needs to power the
// ENQUEUE node — kept as an interface so the executor doesn't import the
// queue package (avoids a cycle and keeps the executor unit-testable).
type QueueProducer interface {
	Enqueue(ctx context.Context, queueName string, payload map[string]interface{}, idempotencyKey string, priority int) (jobID string, duplicate bool, err error)
}

// NotifyHub is the minimal surface FlowExecutor needs to power the
// NOTIFY node. Kept narrow so the executor doesn't import the notify
// package's full surface.
type NotifyHub interface {
	Publish(channelKey string, payload map[string]interface{}) (delivered int, err error)
}

// NewFlowExecutor wires up the executor.
func NewFlowExecutor(
	jobExecutor *JobExecutor,
	db *db.Postgres,
	logAggregator *logging.LogAggregator,
	secretStore SecretStore,
) *FlowExecutor {
	return &FlowExecutor{
		jobExecutor:   jobExecutor,
		db:            db,
		logAggregator: logAggregator,
		cbManager:     NewCircuitBreakerManager(DefaultCircuitBreakerConfig()),
		secretStore:   secretStore,
		dlq:           NewDeadLetterQueue(db),
		plugins:       NewPluginRegistry(db),
	}
}

// SetQueueProducer wires the queue producer after construction. main.go
// builds the queue manager *after* the flow executor (because the queue
// manager itself uses the executor as the worker), so we need a setter.
func (fe *FlowExecutor) SetQueueProducer(p QueueProducer) { fe.queueProducer = p }

// SetNotifyHub wires the pub/sub hub used by the NOTIFY node.
func (fe *FlowExecutor) SetNotifyHub(h NotifyHub) { fe.notifyHub = h }

// PluginRegistry exposes the registry so main.go can Reload() on startup
// and install/uninstall handlers can refresh after mutating the table.
func (fe *FlowExecutor) PluginRegistry() *PluginRegistry { return fe.plugins }

// FlowNodeResult is the outcome of executing a single node in a flow.
type FlowNodeResult struct {
	NodeID        string         `json:"node_id"`
	Success       bool           `json:"success"`
	Skipped       bool           `json:"skipped,omitempty"`
	Output        models.JSONMap `json:"output"`
	Error         string         `json:"error,omitempty"`
	Duration      time.Duration  `json:"duration"`
	RetryAttempts int            `json:"retry_attempts"`
	Logs          []string       `json:"logs"`
}

// FlowExecutionContext carries per-execution state.
//
// Predecessors is populated when a Graph is attached to the context —
// it maps each nodeID to the list of upstream nodeIDs that feed into it.
// MERGE nodes read this to know which predecessors to gather.
type FlowExecutionContext struct {
	NodeResults  map[string]*FlowNodeResult
	Variables    map[string]interface{}
	Predecessors map[string][]string
	mu           sync.RWMutex
}

func NewFlowExecutionContext() *FlowExecutionContext {
	return &FlowExecutionContext{
		NodeResults:  make(map[string]*FlowNodeResult),
		Variables:    make(map[string]interface{}),
		Predecessors: make(map[string][]string),
	}
}

func (ctx *FlowExecutionContext) SetNodeResult(nodeID string, result *FlowNodeResult) {
	ctx.mu.Lock()
	defer ctx.mu.Unlock()
	ctx.NodeResults[nodeID] = result
	if result.Success && result.Output != nil {
		for key, value := range result.Output {
			ctx.Variables[fmt.Sprintf("%s.%s", nodeID, key)] = value
		}
	}
}

func (ctx *FlowExecutionContext) GetNodeResult(nodeID string) (*FlowNodeResult, bool) {
	ctx.mu.RLock()
	defer ctx.mu.RUnlock()
	r, ok := ctx.NodeResults[nodeID]
	return r, ok
}

// FlowNode is the internal representation of a flow node.
type FlowNode struct {
	ID     string
	Type   models.JobType
	Name   string
	Config models.JSONMap
}

// GraphEdge is an outgoing connection with a condition gate.
type GraphEdge struct {
	Target    string
	Condition string // "" == ON_SUCCESS (default)
}

// Graph is the internal DAG.
type Graph struct {
	Nodes map[string]*FlowNode
	Edges map[string][]GraphEdge // source -> outgoing edges
}

// edgePasses reports whether an edge fires given its source node's outcome.
func edgePasses(edge GraphEdge, sourceOK bool, sourceSkipped bool) bool {
	// Skipped sources don't fire any outgoing edges.
	if sourceSkipped {
		return false
	}
	cond := edge.Condition
	if cond == "" {
		cond = "ON_SUCCESS"
	}
	switch cond {
	case "ON_SUCCESS":
		return sourceOK
	case "ON_FAILURE":
		return !sourceOK
	case "ON_COMPLETE":
		return true
	default:
		return sourceOK
	}
}

// ExecuteFlow is the public entry point. Creates a fresh execution context
// and runs the flow.
func (fe *FlowExecutor) ExecuteFlow(
	ctx context.Context,
	task *worker.Task,
	flowConfig *models.FlowConfig,
) (*models.JobResult, error) {
	flowCtx := NewFlowExecutionContext()
	return fe.runFlow(ctx, task, flowConfig, flowCtx)
}

// runFlow is the inner runner. Exposed (via method) so LOOP's body iteration
// can reuse scheduling logic while sharing the parent's variable context.
func (fe *FlowExecutor) runFlow(
	ctx context.Context,
	task *worker.Task,
	flowConfig *models.FlowConfig,
	flowCtx *FlowExecutionContext,
) (*models.JobResult, error) {

	startTime := time.Now()
	executionID := task.ExecutionID

	fe.log(logging.LevelInfo, "Starting flow execution", executionID, "", map[string]interface{}{
		"scheduler_id": task.SchedulerID,
		"node_count":   len(flowConfig.Nodes),
		"edge_count":   len(flowConfig.Edges),
	})

	graph := buildGraph(flowConfig)

	if _, err := topologicalSort(graph); err != nil {
		return nil, fmt.Errorf("failed to sort graph: %w", err)
	}

	nodeResults := make(map[string]*FlowNodeResult)
	var resultsMu sync.Mutex

	// in-degree counts ALL incoming edges; each resolved edge (passed or
	// dropped) decrements it. A node is ready when in-degree hits 0.
	inDegree := make(map[string]int)
	// passedCount counts incoming edges that actually fired. A node with
	// 0 passed when ready is skipped.
	passedCount := make(map[string]int)
	for nid := range graph.Nodes {
		inDegree[nid] = 0
	}
	for source, edges := range graph.Edges {
		for _, e := range edges {
			inDegree[e.Target]++
			// Record predecessors on the context so MERGE and similar
			// nodes can enumerate their upstream sources at run time.
			flowCtx.Predecessors[e.Target] = append(flowCtx.Predecessors[e.Target], source)
		}
	}

	ready := make(chan string, len(graph.Nodes))
	// Seed with in-degree-0 nodes. These are roots — they run unconditionally,
	// so bump passedCount so they don't get mistaken for "skipped".
	for nid, deg := range inDegree {
		if deg == 0 {
			passedCount[nid] = 1
			ready <- nid
		}
	}

	const maxParallel = 16
	sem := make(chan struct{}, maxParallel)

	var wg sync.WaitGroup
	errCh := make(chan error, 1)
	remaining := int32(len(graph.Nodes))

	var stopOnce sync.Once
	fail := func(err error) {
		stopOnce.Do(func() {
			select {
			case errCh <- err:
			default:
			}
		})
	}

	// finalize processes a node's outgoing edges after the node completes or
	// is skipped. It updates passedCount/inDegree for successors and enqueues
	// any that become ready.
	//
	// SWITCH nodes override the standard edge-gating: each outgoing edge's
	// `condition` field is treated as a case label, matched against the
	// node's `matched` output. The first matching edge fires; if none match,
	// the edge with condition "default" (or "ON_FAILURE", kept for
	// backwards compat) fires as fallthrough.
	finalize := func(nid string, succeeded, skipped bool) {
		sourceNode := graph.Nodes[nid]
		isSwitch := sourceNode != nil && sourceNode.Type == models.JobTypeSwitch

		// Precompute which case label the switch selected.
		var selectedCase string
		if isSwitch && succeeded && !skipped {
			if r, ok := flowCtx.GetNodeResult(nid); ok && r.Output != nil {
				if m, ok := r.Output["matched"].(string); ok {
					selectedCase = m
				}
			}
		}

		for _, edge := range graph.Edges[nid] {
			fires := false
			if isSwitch && !skipped {
				// Switch case match wins; otherwise fall back to default/ON_FAILURE.
				if selectedCase != "" && edge.Condition == selectedCase {
					fires = true
				} else if selectedCase == "" && (edge.Condition == "default" || edge.Condition == "ON_FAILURE") {
					fires = true
				}
			} else {
				fires = edgePasses(edge, succeeded, skipped)
			}

			resultsMu.Lock()
			inDegree[edge.Target]--
			if fires {
				passedCount[edge.Target]++
			}
			deg := inDegree[edge.Target]
			resultsMu.Unlock()
			if deg == 0 {
				select {
				case ready <- edge.Target:
				default:
				}
			}
		}
		atomic.AddInt32(&remaining, -1)
	}

	fe.log(logging.LevelInfo, "Flow executor: parallel dispatch", executionID, "", map[string]interface{}{
		"node_count":   len(graph.Nodes),
		"max_parallel": maxParallel,
	})

	for atomic.LoadInt32(&remaining) > 0 {
		select {
		case <-ctx.Done():
			return fe.buildErrorResult("Execution cancelled", nodeResults, time.Since(startTime)), nil
		case err := <-errCh:
			wg.Wait()
			return fe.buildErrorResult(err.Error(), nodeResults, time.Since(startTime)), nil
		case nodeID := <-ready:
			// Skip if no incoming edge fired (all branches leading here were
			// gated off). Skipped nodes still propagate — their outgoing
			// edges evaluate as "source skipped" and never fire.
			resultsMu.Lock()
			passed := passedCount[nodeID]
			resultsMu.Unlock()
			if passed == 0 {
				node := graph.Nodes[nodeID]
				skipResult := &FlowNodeResult{
					NodeID:  nodeID,
					Success: true,
					Skipped: true,
				}
				resultsMu.Lock()
				nodeResults[nodeID] = skipResult
				resultsMu.Unlock()
				flowCtx.SetNodeResult(nodeID, skipResult)
				fe.log(logging.LevelInfo, fmt.Sprintf("Node skipped: %s (no incoming edge fired)", node.Name), executionID, nodeID, nil)
				finalize(nodeID, true, true)
				continue
			}

			wg.Add(1)
			sem <- struct{}{}
			go func(nid string) {
				defer wg.Done()
				defer func() { <-sem }()

				node := graph.Nodes[nid]
				result := fe.executeNode(ctx, task, node, flowCtx)

				resultsMu.Lock()
				nodeResults[nid] = result
				resultsMu.Unlock()

				flowCtx.SetNodeResult(nid, result)

				// A CONDITION node that evaluates to false is *not* a flow
				// failure — it's a routing decision. Proceed so ON_FAILURE
				// edges can fire.
				isRouting := node.Type == models.JobTypeCondition
				if !result.Success && !isRouting && !fe.shouldContinueOnError(node) {
					fail(fmt.Errorf("node %s failed: %s", nid, result.Error))
					return
				}

				finalize(nid, result.Success, false)
			}(nodeID)
		default:
			time.Sleep(5 * time.Millisecond)
		}
	}

	wg.Wait()

	duration := time.Since(startTime)

	fe.log(logging.LevelInfo, "Flow execution completed", executionID, "", map[string]interface{}{
		"duration_ms": duration.Milliseconds(),
	})

	return &models.JobResult{
		Success: true,
		Output:  fe.buildOutput(nodeResults),
		Logs:    fe.formatLogs(nodeResults),
	}, nil
}

// executeNode runs a single node with retry, circuit breaker, and secret
// resolution. Always returns a FlowNodeResult (Success=false on error).
func (fe *FlowExecutor) executeNode(
	ctx context.Context,
	task *worker.Task,
	node *FlowNode,
	flowCtx *FlowExecutionContext,
) *FlowNodeResult {

	startTime := time.Now()
	nodeID := node.ID
	executionID := task.ExecutionID

	fe.log(logging.LevelInfo, fmt.Sprintf("Executing node: %s (%s)", node.Name, node.Type), executionID, nodeID, nil)

	config, err := fe.resolveSecrets(ctx, node.Config, task.ProjectID)
	if err != nil {
		fe.log(logging.LevelError, fmt.Sprintf("Failed to resolve secrets: %v", err), executionID, nodeID, nil)
		return &FlowNodeResult{
			NodeID:   nodeID,
			Success:  false,
			Error:    fmt.Sprintf("secret resolution failed: %v", err),
			Duration: time.Since(startTime),
		}
	}

	config = fe.substituteVariables(config, flowCtx)

	// Flow-shape nodes are handled inline — they don't go through the retry /
	// circuit-breaker / per-type executor machinery because they have no
	// external side effects that could flake.
	if isFlowShapeNode(node.Type) {
		out, success, nodeErr := fe.executeFlowShapeNode(ctx, task, node, config, flowCtx)
		duration := time.Since(startTime)
		errStr := ""
		if nodeErr != nil {
			errStr = nodeErr.Error()
		}
		return &FlowNodeResult{
			NodeID:   nodeID,
			Success:  success,
			Output:   out,
			Error:    errStr,
			Duration: duration,
		}
	}

	retryPolicy := fe.getRetryPolicy(node)
	cb := fe.cbManager.GetOrCreate(fmt.Sprintf("%s-%s", task.SchedulerID, nodeID))

	var retryCount int
	var lastOutput models.JSONMap

	err = Retry(ctx, retryPolicy, func() error {
		retryCount++

		return cb.Execute(func() error {
			nodeStart := time.Now()

			if retryCount > 1 {
				fe.log(logging.LevelWarning, fmt.Sprintf("Retry attempt %d for node %s", retryCount-1, nodeID), executionID, nodeID, nil)
			}

			nodeTask := &worker.Task{
				ID:          idgen.New(),
				SchedulerID: task.SchedulerID,
				ProjectID:   task.ProjectID,
				ExecutionID: executionID,
				Type:        node.Type,
				Config:      config,
				Timeout:     task.Timeout,
			}

			result, execErr := fe.dispatchNode(ctx, nodeTask, node, config)
			duration := time.Since(nodeStart)

			if execErr != nil {
				fe.log(logging.LevelError, fmt.Sprintf("Node execution failed: %v", execErr), executionID, nodeID, map[string]interface{}{
					"duration_ms": duration.Milliseconds(),
				})
				return execErr
			}

			// The per-type executors signal failure through result.Success=false
			// (with ErrorMessage set) rather than returning a Go error. Without
			// this check the retry wrapper would think the node succeeded —
			// Retry only retries when the callback returns a non-nil error.
			if result != nil && !result.Success {
				msg := "node returned Success=false"
				if result.ErrorMessage != nil && *result.ErrorMessage != "" {
					msg = *result.ErrorMessage
				}
				fe.log(logging.LevelError, "Node returned failure: "+msg, executionID, nodeID, map[string]interface{}{
					"duration_ms": duration.Milliseconds(),
				})
				return fmt.Errorf("%s", msg)
			}

			if result != nil && result.Success {
				lastOutput = result.Output
			}

			fe.log(logging.LevelInfo, fmt.Sprintf("Node executed successfully in %v", duration), executionID, nodeID, map[string]interface{}{
				"duration_ms": duration.Milliseconds(),
			})

			return nil
		})
	})

	duration := time.Since(startTime)

	if err != nil {
		if err == ErrCircuitOpen {
			fe.log(logging.LevelError, "Circuit breaker is open", executionID, nodeID, nil)
		}

		if fe.dlq != nil && (retryCount >= retryPolicy.MaxRetries || err == ErrCircuitOpen) {
			reason := DLQMaxRetriesExceeded
			if err == ErrCircuitOpen {
				reason = DLQCircuitBreakerOpen
			}
			dlqExec := &models.Execution{
				ID:           executionID,
				SchedulerID:  task.SchedulerID,
				ProjectID:    task.ProjectID,
				Input:        task.Config,
				RetryAttempt: retryCount,
			}
			if dlqErr := fe.dlq.SendToDLQ(ctx, dlqExec, reason, err.Error(), fmt.Sprintf("node=%s type=%s attempts=%d", nodeID, node.Type, retryCount)); dlqErr != nil {
				fe.log(logging.LevelError, fmt.Sprintf("Failed to send to DLQ: %v", dlqErr), executionID, nodeID, nil)
			} else {
				fe.log(logging.LevelWarning, fmt.Sprintf("Sent to DLQ: %s", reason), executionID, nodeID, map[string]interface{}{
					"reason":   string(reason),
					"attempts": retryCount,
				})
			}
		}

		return &FlowNodeResult{
			NodeID:        nodeID,
			Success:       false,
			Error:         err.Error(),
			Duration:      duration,
			RetryAttempts: retryCount - 1,
		}
	}

	return &FlowNodeResult{
		NodeID:        nodeID,
		Success:       true,
		Output:        lastOutput,
		Duration:      duration,
		RetryAttempts: retryCount - 1,
	}
}

// dispatchNode routes the node to the right executor based on its type.
// Flow-shape nodes are handled separately in executeFlowShapeNode.
//
// Plugin lookup happens *after* the built-in switch so core types can't be
// shadowed (uniqueness is also enforced at plugin install time, but defense
// in depth is free here).
func (fe *FlowExecutor) dispatchNode(
	ctx context.Context,
	task *worker.Task,
	node *FlowNode,
	config models.JSONMap,
) (*models.JobResult, error) {

	switch node.Type {
	case models.JobTypeDatabase:
		return fe.executeDatabaseNode(ctx, config)

	case "SLACK", "EMAIL", "WEBHOOK":
		return fe.executeConnectorNode(ctx, string(node.Type), config)
	}

	// Fall through to plugin registry. The node's type string becomes the
	// plugin's logical name (case-insensitive match).
	if fe.plugins != nil {
		if p := fe.plugins.Lookup(string(node.Type)); p != nil {
			// Snapshot flow variables for the plugin. Plugins can read them
			// but mutations don't propagate back — keeps the blast radius
			// small for a third-party handler.
			var vars map[string]interface{}
			// We only have access to flowCtx through the outer scope; read
			// it via the task if available. Variables aren't critical for
			// the minimum contract so we pass config-only when not wired.
			_ = vars
			return fe.plugins.Dispatch(ctx, p, PluginDispatchRequest{
				NodeID:      node.ID,
				ExecutionID: task.ExecutionID,
				ProjectID:   task.ProjectID,
				Config:      config,
			})
		}
	}

	return fe.jobExecutor.Execute(ctx, task)
}

// isFlowShapeNode identifies control/flow-shape nodes that don't perform
// external work and are handled directly by the executor.
func isFlowShapeNode(t models.JobType) bool {
	switch t {
	case models.JobTypeStart, models.JobTypeEnd,
		models.JobTypeCondition, models.JobTypeDelay,
		models.JobTypeLoop, models.JobTypeTransform,
		models.JobTypeMerge, models.JobTypeSwitch,
		models.JobTypeLog, models.JobTypeSetVar,
		models.JobTypeSubFlow, models.JobTypeWebhook,
		models.JobTypeWaitHook, models.JobTypeEnqueue,
		models.JobTypeNotify:
		return true
	}
	return false
}

// executeFlowShapeNode handles Start/End/Condition/Delay/Loop/Transform.
// Returns (output, success, error). Error is only for unexpected problems
// (bad config); routing decisions like a failing CONDITION return
// success=false with no error.
func (fe *FlowExecutor) executeFlowShapeNode(
	ctx context.Context,
	task *worker.Task,
	node *FlowNode,
	config models.JSONMap,
	flowCtx *FlowExecutionContext,
) (models.JSONMap, bool, error) {

	switch node.Type {
	case models.JobTypeStart, models.JobTypeEnd:
		return models.JSONMap{"node": string(node.Type)}, true, nil

	case models.JobTypeDelay:
		ms := 1000
		if v, ok := config["duration"]; ok {
			ms = toInt(v, 1000)
		} else if v, ok := config["durationMs"]; ok {
			ms = toInt(v, 1000)
		}
		select {
		case <-ctx.Done():
			return nil, false, ctx.Err()
		case <-time.After(time.Duration(ms) * time.Millisecond):
		}
		return models.JSONMap{"waitedMs": ms}, true, nil

	case models.JobTypeTransform:
		return fe.executeTransform(config, flowCtx)

	case models.JobTypeCondition:
		matched, err := evalCondition(config)
		if err != nil {
			return nil, false, err
		}
		return models.JSONMap{"matched": matched}, matched, nil

	case models.JobTypeLoop:
		return fe.executeLoop(ctx, task, config, flowCtx)

	case models.JobTypeMerge:
		return fe.executeMerge(node, config, flowCtx)

	case models.JobTypeSwitch:
		// Switch just computes the matched case label; the actual routing
		// happens in finalize() which reads output["matched"].
		raw, _ := config["value"].(string)
		matched := strings.TrimSpace(raw)
		return models.JSONMap{"matched": matched, "value": raw}, true, nil

	case models.JobTypeLog:
		return fe.executeLogNode(node, config, task.ExecutionID)

	case models.JobTypeSetVar:
		return fe.executeSetVarNode(config, flowCtx)

	case models.JobTypeSubFlow:
		return fe.executeSubFlowNode(ctx, task, config, flowCtx)

	case models.JobTypeWebhook:
		return fe.executeOutboundWebhook(ctx, config)

	case models.JobTypeWaitHook:
		return fe.executeWaitWebhookNode(ctx, config)

	case models.JobTypeEnqueue:
		return fe.executeEnqueueNode(ctx, config)

	case models.JobTypeNotify:
		return fe.executeNotifyNode(task, config)
	}

	return nil, false, fmt.Errorf("unknown flow-shape node type: %s", node.Type)
}

// executeEnqueueNode pushes a job to a named queue from inside a flow.
//
// Required config:
//   queue:   string — queue name (must exist in the same project)
//   payload: map    — JSON object passed to the bound flow as input
// Optional:
//   idempotencyKey: string — dedupe key
//   priority:       int    — backend-specific
//
// Returns immediately on enqueue (does NOT wait for the consumer flow to
// finish). Output exposes jobId, duplicate, queue.
func (fe *FlowExecutor) executeEnqueueNode(
	ctx context.Context,
	config models.JSONMap,
) (models.JSONMap, bool, error) {
	if fe.queueProducer == nil {
		return nil, false, fmt.Errorf("enqueue: queue producer not configured on engine")
	}
	queueName, _ := config["queue"].(string)
	if queueName == "" {
		return nil, false, fmt.Errorf("enqueue: 'queue' is required")
	}
	payload, _ := config["payload"].(map[string]interface{})
	if payload == nil {
		// Allow string (JSON) or empty payload — normalize to empty map.
		if raw, ok := config["payload"].(string); ok && raw != "" {
			if err := json.Unmarshal([]byte(raw), &payload); err != nil {
				return nil, false, fmt.Errorf("enqueue: payload is not valid JSON: %w", err)
			}
		} else {
			payload = map[string]interface{}{}
		}
	}
	idem, _ := config["idempotencyKey"].(string)
	priority := toInt(config["priority"], 0)

	jobID, duplicate, err := fe.queueProducer.Enqueue(ctx, queueName, payload, idem, priority)
	if err != nil {
		return nil, false, fmt.Errorf("enqueue: %w", err)
	}
	return models.JSONMap{
		"jobId":     jobID,
		"duplicate": duplicate,
		"queue":     queueName,
	}, true, nil
}

// executeNotifyNode publishes a payload to a project-scoped pub/sub
// channel. Subscribers (mobile apps, web dashboards, chat clients)
// connected to /ws/channel/<name> receive the payload in real time.
//
// Required config:
//   channel: string — channel name (project-scoped automatically)
// Optional:
//   payload: map    — JSON object delivered to subscribers
//
// Returns immediately. Output exposes how many subscribers received the
// message — 0 is not an error (channel may have no live subscribers).
func (fe *FlowExecutor) executeNotifyNode(
	task *worker.Task,
	config models.JSONMap,
) (models.JSONMap, bool, error) {
	if fe.notifyHub == nil {
		return nil, false, fmt.Errorf("notify: hub not configured on engine")
	}
	channel, _ := config["channel"].(string)
	if channel == "" {
		return nil, false, fmt.Errorf("notify: 'channel' is required")
	}
	if task.ProjectID == "" {
		return nil, false, fmt.Errorf("notify: task has no projectID — cannot scope channel")
	}
	payload, _ := config["payload"].(map[string]interface{})
	if payload == nil {
		if raw, ok := config["payload"].(string); ok && raw != "" {
			if err := json.Unmarshal([]byte(raw), &payload); err != nil {
				return nil, false, fmt.Errorf("notify: payload is not valid JSON: %w", err)
			}
		} else {
			payload = map[string]interface{}{}
		}
	}
	channelKey := task.ProjectID + ":" + channel
	delivered, err := fe.notifyHub.Publish(channelKey, payload)
	if err != nil {
		return nil, false, fmt.Errorf("notify: %w", err)
	}
	return models.JSONMap{
		"channel":   channel,
		"delivered": delivered,
	}, true, nil
}

// executeTransform evaluates config.expression. Two modes:
//   mode="json" (default if expression looks like a JSON literal) — parse
//     as JSON after variable substitution. Good for shaping output.
//   mode="expr" — evaluate with expr-lang. Env exposes `nodes` (a map of
//     nodeId → {output, success, skipped}) and `vars` (the flat
//     ${{nodeId.key}} variable map). Expression result is returned directly
//     when it's an object, otherwise wrapped as {value: ...}.
func (fe *FlowExecutor) executeTransform(config models.JSONMap, flowCtx *FlowExecutionContext) (models.JSONMap, bool, error) {
	source, _ := config["expression"].(string)
	if source == "" {
		return models.JSONMap{}, true, nil
	}

	mode, _ := config["mode"].(string)
	if mode == "" {
		trimmed := strings.TrimSpace(source)
		if strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[") {
			mode = "json"
		} else {
			mode = "expr"
		}
	}

	switch mode {
	case "json":
		var parsed interface{}
		if err := json.Unmarshal([]byte(source), &parsed); err != nil {
			return nil, false, fmt.Errorf("transform(json): invalid JSON: %w", err)
		}
		if m, ok := parsed.(map[string]interface{}); ok {
			return models.JSONMap(m), true, nil
		}
		return models.JSONMap{"value": parsed}, true, nil

	case "expr":
		env := fe.buildExprEnv(flowCtx)
		program, err := expr.Compile(source, expr.Env(env))
		if err != nil {
			return nil, false, fmt.Errorf("transform(expr): compile: %w", err)
		}
		out, err := expr.Run(program, env)
		if err != nil {
			return nil, false, fmt.Errorf("transform(expr): run: %w", err)
		}
		if m, ok := out.(map[string]interface{}); ok {
			return models.JSONMap(m), true, nil
		}
		return models.JSONMap{"value": out}, true, nil

	default:
		return nil, false, fmt.Errorf("transform: unknown mode %q (use 'json' or 'expr')", mode)
	}
}

// buildExprEnv snapshots flowCtx into a plain map suitable as an expr-lang
// environment. Holds the lock for the snapshot to avoid races.
func (fe *FlowExecutor) buildExprEnv(flowCtx *FlowExecutionContext) map[string]interface{} {
	flowCtx.mu.RLock()
	defer flowCtx.mu.RUnlock()

	nodes := make(map[string]interface{}, len(flowCtx.NodeResults))
	for nid, r := range flowCtx.NodeResults {
		nodes[nid] = map[string]interface{}{
			"output":  r.Output,
			"success": r.Success,
			"skipped": r.Skipped,
		}
	}
	vars := make(map[string]interface{}, len(flowCtx.Variables))
	for k, v := range flowCtx.Variables {
		vars[k] = v
	}
	return map[string]interface{}{
		"nodes": nodes,
		"vars":  vars,
	}
}

// executeLoop iterates an embedded body subgraph N times. Each iteration
// runs as a nested flow, inheriting the parent's variables; a virtual
// `loop` node is exposed so the body can read `${{loop.iteration}}`.
// Output is {iterations: N, results: [<body-output-per-iter>]}.
//
// If config.body is absent, falls back to emitting just the count — useful
// as a delay/counter primitive.
// executeLoop runs the body subgraph once per "iteration unit" determined
// by the mode:
//
//	mode="count"   (default) — run `iterations` times (0,1,…). Exposes
//	                           ${{loop.iteration}} and ${{loop.index}}.
//	mode="forEach"            — iterate `items` (a literal array or a ref
//	                           like ${{someNode.output.rows}}). Exposes
//	                           ${{loop.item}} and ${{loop.index}}.
//	mode="batch"              — split `items` into chunks of `batchSize`.
//	                           Each iteration sees ${{loop.batch}} (slice)
//	                           and ${{loop.index}} (batch number).
//
// When `parallel=true` iterations run concurrently up to `concurrency`
// (default: min(items, 16)). Order of results matches input order.
//
// A no-body loop is still valid — it just emits the resolved iteration
// count, useful as a delay/counter.
func (fe *FlowExecutor) executeLoop(
	ctx context.Context,
	task *worker.Task,
	config models.JSONMap,
	flowCtx *FlowExecutionContext,
) (models.JSONMap, bool, error) {

	mode, _ := config["mode"].(string)
	if mode == "" {
		mode = "count"
	}
	bodyRaw, hasBody := config["body"]

	// Figure out the iteration set before we do anything expensive.
	var units []loopUnit
	switch mode {
	case "count":
		n := toInt(config["iterations"], 1)
		if n < 0 {
			n = 0
		}
		units = make([]loopUnit, n)
		for i := 0; i < n; i++ {
			units[i] = loopUnit{index: i, vars: map[string]interface{}{
				"loop.iteration": i,
				"loop.index":     i,
			}}
		}

	case "forEach":
		items, err := fe.resolveItems(config["items"], flowCtx)
		if err != nil {
			return nil, false, fmt.Errorf("loop(forEach): %w", err)
		}
		units = make([]loopUnit, len(items))
		for i, item := range items {
			units[i] = loopUnit{index: i, vars: flatten(map[string]interface{}{
				"loop.item":  item,
				"loop.index": i,
			})}
		}

	case "batch":
		items, err := fe.resolveItems(config["items"], flowCtx)
		if err != nil {
			return nil, false, fmt.Errorf("loop(batch): %w", err)
		}
		size := toInt(config["batchSize"], 100)
		if size < 1 {
			size = 1
		}
		for start := 0; start < len(items); start += size {
			end := start + size
			if end > len(items) {
				end = len(items)
			}
			chunk := items[start:end]
			units = append(units, loopUnit{
				index: len(units),
				vars: flatten(map[string]interface{}{
					"loop.batch": chunk,
					"loop.index": len(units),
					"loop.start": start,
					"loop.end":   end,
				}),
			})
		}

	default:
		return nil, false, fmt.Errorf("loop: unknown mode %q (use count | forEach | batch)", mode)
	}

	// No-body shortcut — still honor the mode and report counts.
	if !hasBody {
		return models.JSONMap{"mode": mode, "iterations": len(units)}, true, nil
	}

	bodyConfig, err := parseBodyFlowConfig(bodyRaw)
	if err != nil {
		return nil, false, fmt.Errorf("loop: invalid body: %w", err)
	}
	if bodyConfig == nil || len(bodyConfig.Nodes) == 0 {
		return models.JSONMap{"mode": mode, "iterations": len(units), "results": []interface{}{}}, true, nil
	}

	parallel, _ := config["parallel"].(bool)
	concurrency := toInt(config["concurrency"], 0)
	if concurrency <= 0 {
		concurrency = len(units)
	}
	if concurrency > 16 {
		concurrency = 16 // keep goroutine fan-out reasonable
	}

	results, runErr := fe.runLoopUnits(ctx, task, bodyConfig, flowCtx, units, parallel, concurrency)
	if runErr != nil {
		return nil, false, runErr
	}

	return models.JSONMap{
		"mode":       mode,
		"iterations": len(units),
		"results":    results,
	}, true, nil
}

// loopUnit is one iteration's state — which variables to expose when the
// body runs.
type loopUnit struct {
	index int
	vars  map[string]interface{}
}

// runLoopUnits executes each loopUnit through fe.runFlow. When parallel is
// false we keep ordering naturally; when true we use a semaphore-bounded
// goroutine fan-out but assemble results into a pre-sized slice indexed
// by unit.index so the returned array preserves input order.
func (fe *FlowExecutor) runLoopUnits(
	ctx context.Context,
	task *worker.Task,
	bodyConfig *models.FlowConfig,
	parent *FlowExecutionContext,
	units []loopUnit,
	parallel bool,
	concurrency int,
) ([]interface{}, error) {
	results := make([]interface{}, len(units))

	run := func(u loopUnit) error {
		subCtx := NewFlowExecutionContext()
		parent.mu.RLock()
		for k, v := range parent.Variables {
			subCtx.Variables[k] = v
		}
		parent.mu.RUnlock()
		for k, v := range u.vars {
			subCtx.Variables[k] = v
		}
		iterResult, err := fe.runFlow(ctx, task, bodyConfig, subCtx)
		if err != nil {
			return fmt.Errorf("iteration %d: %w", u.index, err)
		}
		results[u.index] = iterResult.Output
		return nil
	}

	if !parallel {
		for _, u := range units {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			if err := run(u); err != nil {
				return nil, err
			}
		}
		return results, nil
	}

	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup
	errCh := make(chan error, 1)
	var stopOnce sync.Once
	setErr := func(err error) { stopOnce.Do(func() { errCh <- err }) }

	for _, u := range units {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		select {
		case err := <-errCh:
			wg.Wait()
			return nil, err
		default:
		}
		sem <- struct{}{}
		wg.Add(1)
		go func(u loopUnit) {
			defer wg.Done()
			defer func() { <-sem }()
			if err := run(u); err != nil {
				setErr(err)
			}
		}(u)
	}
	wg.Wait()
	close(errCh)
	if err := <-errCh; err != nil {
		return nil, err
	}
	return results, nil
}

// resolveItems accepts a literal array from config or a reference string
// like "${{someNode.output.rows}}" and returns the concrete []interface{}.
// Ambiguous values (e.g. a string that doesn't look like a reference) are
// rejected so misconfigurations surface early.
func (fe *FlowExecutor) resolveItems(raw interface{}, flowCtx *FlowExecutionContext) ([]interface{}, error) {
	switch v := raw.(type) {
	case nil:
		return nil, fmt.Errorf("'items' is required for forEach/batch")
	case []interface{}:
		return v, nil
	case string:
		// Reference form: single ${{path}} spanning the whole string.
		trimmed := strings.TrimSpace(v)
		m := varPattern.FindStringSubmatch(trimmed)
		if m == nil || m[0] != trimmed {
			return nil, fmt.Errorf("'items' string must be a single ${{path}} reference, got %q", v)
		}
		parts := strings.Split(m[1], ".")
		val := fe.lookupPath(flowCtx, parts)
		if arr, ok := val.([]interface{}); ok {
			return arr, nil
		}
		return nil, fmt.Errorf("${{%s}} did not resolve to an array", m[1])
	default:
		// JSON-marshaled round-trip catches any concrete array type.
		b, err := json.Marshal(raw)
		if err != nil {
			return nil, fmt.Errorf("'items' type %T not supported", raw)
		}
		var arr []interface{}
		if err := json.Unmarshal(b, &arr); err != nil {
			return nil, fmt.Errorf("'items' is not an array")
		}
		return arr, nil
	}
}

// executeMerge is the explicit fan-in node. By the time runFlow dispatches
// it, all incoming edges have resolved — so every predecessor's output is
// already in flowCtx.NodeResults. We combine them according to `strategy`:
//
//	"collect" (default) — output = { <predId>: <predOutput>, ... }
//	"array"             — output = { items: [<predOutput>, ...] } in graph order
//	"first"             — output = first successful predecessor's output (useful
//	                     for branch-winners pattern after a CONDITION)
//
// The node intentionally never fails — MERGE is a shape concern, not a
// business one. If a predecessor was skipped its entry is simply omitted.
func (fe *FlowExecutor) executeMerge(node *FlowNode, config models.JSONMap, flowCtx *FlowExecutionContext) (models.JSONMap, bool, error) {
	strategy, _ := config["strategy"].(string)
	if strategy == "" {
		strategy = "collect"
	}

	flowCtx.mu.RLock()
	preds := append([]string{}, flowCtx.Predecessors[node.ID]...)
	flowCtx.mu.RUnlock()

	switch strategy {
	case "collect":
		out := models.JSONMap{}
		for _, pid := range preds {
			if r, ok := flowCtx.GetNodeResult(pid); ok && r.Success && !r.Skipped {
				out[pid] = r.Output
			}
		}
		return models.JSONMap{"merged": out, "sources": preds}, true, nil

	case "array":
		arr := make([]interface{}, 0, len(preds))
		for _, pid := range preds {
			if r, ok := flowCtx.GetNodeResult(pid); ok && r.Success && !r.Skipped {
				arr = append(arr, r.Output)
			}
		}
		return models.JSONMap{"items": arr, "count": len(arr)}, true, nil

	case "first":
		for _, pid := range preds {
			if r, ok := flowCtx.GetNodeResult(pid); ok && r.Success && !r.Skipped {
				return models.JSONMap{"from": pid, "output": r.Output}, true, nil
			}
		}
		return models.JSONMap{"from": "", "output": nil}, true, nil

	default:
		return nil, false, fmt.Errorf("merge: unknown strategy %q (use collect | array | first)", strategy)
	}
}

// flatten expands a nested map into dotted keys so ${{loop.item.to}} can
// resolve when `loop.item` is a map. We also keep the top-level value (so
// ${{loop.item}} stringifies to JSON) for templating flexibility.
func flatten(in map[string]interface{}) map[string]interface{} {
	out := map[string]interface{}{}
	for k, v := range in {
		out[k] = v
		if m, ok := v.(map[string]interface{}); ok {
			for nk, nv := range m {
				out[k+"."+nk] = nv
			}
		}
	}
	return out
}

// parseBodyFlowConfig normalizes the various shapes the body may arrive in:
// a JSON string, a plain map, or already-unmarshaled FlowConfig-shaped data.
// We round-trip through JSON so any concrete map type (map[string]interface{},
// models.JSONMap, etc.) decodes cleanly into the typed struct.
func parseBodyFlowConfig(raw interface{}) (*models.FlowConfig, error) {
	if raw == nil {
		return nil, nil
	}
	var bytes []byte
	if s, ok := raw.(string); ok {
		bytes = []byte(s)
	} else {
		b, err := json.Marshal(raw)
		if err != nil {
			return nil, err
		}
		bytes = b
	}
	var cfg models.FlowConfig
	if err := json.Unmarshal(bytes, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// evalCondition evaluates a simple comparison from config:
//   operator: eq | neq | gt | lt | gte | lte | contains
//   left, right: string values (already variable-substituted).
func evalCondition(config models.JSONMap) (bool, error) {
	op, _ := config["operator"].(string)
	if op == "" {
		op = "eq"
	}
	left := fmt.Sprintf("%v", config["left"])
	right := fmt.Sprintf("%v", config["right"])

	// Numeric comparison if both sides parse as numbers; otherwise string.
	switch op {
	case "eq":
		return left == right, nil
	case "neq":
		return left != right, nil
	case "contains":
		return strings.Contains(left, right), nil
	case "gt", "lt", "gte", "lte":
		lf, le := parseFloat(left)
		rf, re := parseFloat(right)
		if le != nil || re != nil {
			return false, fmt.Errorf("condition %s requires numeric operands, got %q / %q", op, left, right)
		}
		switch op {
		case "gt":
			return lf > rf, nil
		case "lt":
			return lf < rf, nil
		case "gte":
			return lf >= rf, nil
		case "lte":
			return lf <= rf, nil
		}
	}
	return false, fmt.Errorf("unknown operator: %s", op)
}

func toInt(v interface{}, def int) int {
	switch n := v.(type) {
	case int:
		return n
	case int64:
		return int(n)
	case float64:
		return int(n)
	case string:
		if f, err := parseFloat(n); err == nil {
			return int(f)
		}
	}
	return def
}

func parseFloat(s string) (float64, error) {
	var f float64
	_, err := fmt.Sscanf(s, "%f", &f)
	return f, err
}

func (fe *FlowExecutor) executeDatabaseNode(ctx context.Context, config models.JSONMap) (*models.JobResult, error) {
	conn := connector.NewDatabaseConnector()
	if err := conn.Initialize(ctx, config); err != nil {
		return &models.JobResult{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("failed to connect to database: %v", err)),
		}, nil
	}
	defer conn.Close()

	action := "query"
	if a, ok := config["action"].(string); ok {
		action = a
	}

	result, err := conn.ExecuteAction(ctx, action, config)
	if err != nil {
		return &models.JobResult{
			Success:      false,
			ErrorMessage: strPtr(err.Error()),
		}, nil
	}

	return &models.JobResult{
		Success: result.Success,
		Output:  result.Data,
	}, nil
}

func (fe *FlowExecutor) executeConnectorNode(ctx context.Context, connType string, config models.JSONMap) (*models.JobResult, error) {
	var conn connector.Connector

	switch connType {
	case "SLACK":
		conn = connector.NewSlackConnector()
	case "EMAIL":
		conn = connector.NewEmailConnector()
	case "WEBHOOK":
		conn = connector.NewHTTPConnector()
	default:
		return &models.JobResult{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("unknown connector type: %s", connType)),
		}, nil
	}

	if err := conn.Initialize(ctx, config); err != nil {
		return &models.JobResult{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("failed to initialize connector: %v", err)),
		}, nil
	}
	defer conn.Close()

	action := "send"
	if a, ok := config["action"].(string); ok {
		action = a
	}

	if actionable, ok := conn.(connector.ActionConnector); ok {
		result, err := actionable.ExecuteAction(ctx, action, config)
		if err != nil {
			return &models.JobResult{
				Success:      false,
				ErrorMessage: strPtr(err.Error()),
			}, nil
		}
		return &models.JobResult{
			Success: result.Success,
			Output:  result.Data,
		}, nil
	}

	return &models.JobResult{
		Success:      false,
		ErrorMessage: strPtr("connector does not support actions"),
	}, nil
}

func (fe *FlowExecutor) resolveSecrets(ctx context.Context, config models.JSONMap, projectID string) (models.JSONMap, error) {
	result := make(models.JSONMap)
	for key, value := range config {
		switch v := value.(type) {
		case string:
			resolved, err := fe.resolveSecretString(ctx, v, projectID)
			if err != nil {
				return nil, err
			}
			result[key] = resolved
		case map[string]interface{}:
			resolved, err := fe.resolveSecrets(ctx, v, projectID)
			if err != nil {
				return nil, err
			}
			result[key] = resolved
		default:
			result[key] = value
		}
	}
	return result, nil
}

var secretPattern = regexp.MustCompile(`\$\{\{secrets\.(\w+)\}\}`)

func (fe *FlowExecutor) resolveSecretString(ctx context.Context, s string, projectID string) (string, error) {
	matches := secretPattern.FindAllStringSubmatch(s, -1)
	if matches == nil {
		return s, nil
	}
	result := s
	for _, match := range matches {
		secretName := match[1]
		if fe.secretStore != nil {
			secretValue, err := fe.secretStore.GetSecret(ctx, secretName, projectID)
			if err != nil {
				return "", fmt.Errorf("failed to resolve secret '%s': %w", secretName, err)
			}
			result = strings.Replace(result, match[0], secretValue, -1)
		}
	}
	return result, nil
}

func (fe *FlowExecutor) substituteVariables(config models.JSONMap, flowCtx *FlowExecutionContext) models.JSONMap {
	result := make(models.JSONMap)
	for key, value := range config {
		switch v := value.(type) {
		case string:
			result[key] = fe.substituteString(v, flowCtx)
		case map[string]interface{}:
			result[key] = fe.substituteVariables(v, flowCtx)
		default:
			result[key] = value
		}
	}
	return result
}

// varPattern matches ${{path.with.any.depth}} — arbitrary dotted identifier.
// The whole inner path is captured as one group; we split on `.` at lookup
// time so the regex stays simple.
var varPattern = regexp.MustCompile(`\$\{\{([\w\.]+)\}\}`)

// substituteString replaces every ${{...}} occurrence with the value found
// at that path. The lookup walks two sources:
//
//   1. Node results: first segment is a node id, remaining segments are a
//      path into that node's Output (e.g. ${{http.body.user.id}}).
//   2. Flat variables: e.g. ${{loop.item.to}} where `loop.item` is stored
//      directly in flowCtx.Variables as a map.
//
// When the value is a primitive (string/number/bool) it's stringified with
// %v; maps and arrays are JSON-marshaled so the result is valid JSON when
// the template is consumed by a node expecting JSON (body, headers, etc.).
func (fe *FlowExecutor) substituteString(s string, flowCtx *FlowExecutionContext) string {
	return varPattern.ReplaceAllStringFunc(s, func(match string) string {
		inner := match[3 : len(match)-2] // strip "${{" and "}}"
		parts := strings.Split(inner, ".")
		if len(parts) == 0 {
			return match
		}

		val := fe.lookupPath(flowCtx, parts)
		if val == nil {
			return match
		}
		return stringifyForTemplate(val)
	})
}

// lookupPath resolves a dotted path against both sources in
// substituteString's order of preference. Returns nil if nothing found.
func (fe *FlowExecutor) lookupPath(flowCtx *FlowExecutionContext, parts []string) interface{} {
	flowCtx.mu.RLock()
	defer flowCtx.mu.RUnlock()

	// 1. Node result lookup. First part = nodeID; rest walks the Output map.
	if nodeResult, ok := flowCtx.NodeResults[parts[0]]; ok && nodeResult.Success && nodeResult.Output != nil {
		if len(parts) == 1 {
			return nodeResult.Output
		}
		if v := walkMap(nodeResult.Output, parts[1:]); v != nil {
			return v
		}
	}

	// 2. Flat variables. Try longest-prefix match then walk remaining.
	for split := len(parts); split >= 2; split-- {
		key := strings.Join(parts[:split], ".")
		v, ok := flowCtx.Variables[key]
		if !ok {
			continue
		}
		rest := parts[split:]
		if len(rest) == 0 {
			return v
		}
		if walked := walkValue(v, rest); walked != nil {
			return walked
		}
	}
	return nil
}

// walkMap descends into a JSONMap along the given path.
func walkMap(m models.JSONMap, path []string) interface{} {
	var cur interface{} = map[string]interface{}(m)
	for _, p := range path {
		cur = walkOne(cur, p)
		if cur == nil {
			return nil
		}
	}
	return cur
}

// walkValue is walkMap for an arbitrary interface{} (could be map or slice).
func walkValue(v interface{}, path []string) interface{} {
	cur := v
	for _, p := range path {
		cur = walkOne(cur, p)
		if cur == nil {
			return nil
		}
	}
	return cur
}

// walkOne steps into a value by one path segment. Handles map access
// (key lookup) and array access (numeric index).
func walkOne(v interface{}, key string) interface{} {
	switch x := v.(type) {
	case map[string]interface{}:
		return x[key]
	case models.JSONMap:
		return x[key]
	case []interface{}:
		var idx int
		if _, err := fmt.Sscanf(key, "%d", &idx); err != nil {
			return nil
		}
		if idx < 0 || idx >= len(x) {
			return nil
		}
		return x[idx]
	}
	return nil
}

// stringifyForTemplate produces a render-safe string. Scalars use %v; maps
// and slices marshal as JSON so downstream templates that paste the value
// into a JSON body stay well-formed.
func stringifyForTemplate(v interface{}) string {
	switch x := v.(type) {
	case string:
		return x
	case nil:
		return ""
	case map[string]interface{}, []interface{}, models.JSONMap:
		b, err := json.Marshal(x)
		if err == nil {
			return string(b)
		}
	}
	return fmt.Sprintf("%v", v)
}

func (fe *FlowExecutor) getRetryPolicy(node *FlowNode) *RetryPolicy {
	if retryConfig, ok := node.Config["retry"].(map[string]interface{}); ok {
		maxRetries := 3
		if mr, ok := retryConfig["max_retries"].(float64); ok {
			maxRetries = int(mr)
		}
		return &RetryPolicy{
			MaxRetries:   maxRetries,
			InitialDelay: 1 * time.Second,
			MaxDelay:     60 * time.Second,
			Multiplier:   2.0,
			Jitter:       true,
		}
	}
	return DefaultRetryPolicy()
}

func (fe *FlowExecutor) shouldContinueOnError(node *FlowNode) bool {
	if continueOnError, ok := node.Config["continue_on_error"].(bool); ok {
		return continueOnError
	}
	return false
}

func (fe *FlowExecutor) log(level logging.LogLevel, message string, executionID, nodeID string, fields map[string]interface{}) {
	if fe.logAggregator != nil {
		fe.logAggregator.Log(logging.LogEntry{
			Level:       level,
			Message:     message,
			ExecutionID: executionID,
			NodeID:      nodeID,
			Source:      "executor",
			Fields:      fields,
		})
	}
}

func (fe *FlowExecutor) buildErrorResult(errorMsg string, results map[string]*FlowNodeResult, duration time.Duration) *models.JobResult {
	return &models.JobResult{
		Success:      false,
		ErrorMessage: &errorMsg,
		Output:       fe.buildOutput(results),
		Logs:         fe.formatLogs(results),
	}
}

func (fe *FlowExecutor) buildOutput(results map[string]*FlowNodeResult) models.JSONMap {
	output := make(models.JSONMap)
	for nodeID, result := range results {
		if result.Success {
			output[nodeID] = result.Output
		}
	}
	return output
}

func (fe *FlowExecutor) formatLogs(results map[string]*FlowNodeResult) string {
	var logs []string
	for nodeID, result := range results {
		status := "SUCCESS"
		if result.Skipped {
			status = "SKIPPED"
		} else if !result.Success {
			status = "FAILED"
		}
		logs = append(logs, fmt.Sprintf("[%s] %s: %s (%dms, %d retries)",
			nodeID, status, result.Error, result.Duration.Milliseconds(), result.RetryAttempts))
	}
	return strings.Join(logs, "\n")
}

func buildGraph(flowConfig *models.FlowConfig) *Graph {
	graph := &Graph{
		Nodes: make(map[string]*FlowNode),
		Edges: make(map[string][]GraphEdge),
	}

	for _, n := range flowConfig.Nodes {
		node := &FlowNode{
			ID:     n.ID,
			Type:   n.Type,
			Name:   n.Name,
			Config: n.Config,
		}
		graph.Nodes[n.ID] = node
		graph.Edges[n.ID] = []GraphEdge{}
	}

	for _, e := range flowConfig.Edges {
		if e.Source != "" && e.Target != "" {
			graph.Edges[e.Source] = append(graph.Edges[e.Source], GraphEdge{
				Target:    e.Target,
				Condition: e.Condition,
			})
		}
	}

	return graph
}

// topologicalSort produces a linear ordering; returns an error on cycles.
func topologicalSort(graph *Graph) ([]string, error) {
	inDegree := make(map[string]int)
	for nodeID := range graph.Nodes {
		inDegree[nodeID] = 0
	}
	for _, edges := range graph.Edges {
		for _, e := range edges {
			inDegree[e.Target]++
		}
	}

	var queue []string
	for nodeID, degree := range inDegree {
		if degree == 0 {
			queue = append(queue, nodeID)
		}
	}

	var result []string
	for len(queue) > 0 {
		nodeID := queue[0]
		queue = queue[1:]
		result = append(result, nodeID)
		for _, e := range graph.Edges[nodeID] {
			inDegree[e.Target]--
			if inDegree[e.Target] == 0 {
				queue = append(queue, e.Target)
			}
		}
	}

	if len(result) < len(graph.Nodes) {
		return nil, fmt.Errorf("graph contains a cycle")
	}
	return result, nil
}

// ─────────────────────────────────────────────────────────────────────────
// Tier-1 flow-shape nodes: Log / SetVariable / SubFlow / HTTPWebhook(out) /
// WaitForWebhook. All small, independent, and intentionally minimal — they
// cover the common "glue" gaps between executor nodes.
// ─────────────────────────────────────────────────────────────────────────

// executeLogNode writes the config.message to the engine's logger and
// returns it as output so downstream nodes can see the line too. Level
// defaults to info; invalid levels silently become info.
func (fe *FlowExecutor) executeLogNode(node *FlowNode, config models.JSONMap, executionID string) (models.JSONMap, bool, error) {
	msg, _ := config["message"].(string)
	level, _ := config["level"].(string)

	ev := log.Info()
	switch strings.ToLower(level) {
	case "warn", "warning":
		ev = log.Warn()
	case "error":
		ev = log.Error()
	case "debug":
		ev = log.Debug()
	}
	ev.Str("execution_id", executionID).Str("node", node.ID).Msg(msg)
	return models.JSONMap{"message": msg, "level": level}, true, nil
}

// executeSetVarNode writes one or more variables into the flow context.
// Two shapes supported:
//
//   { "name": "userId", "value": "abc" }             — single key
//   { "variables": { "a": 1, "b": "hello" } }        — batch
//
// The value goes into flowCtx.Variables *and* becomes the node's output, so
// downstream nodes can read via ${{set.name}} or ${{set.variables.a}} too.
func (fe *FlowExecutor) executeSetVarNode(config models.JSONMap, flowCtx *FlowExecutionContext) (models.JSONMap, bool, error) {
	flowCtx.mu.Lock()
	defer flowCtx.mu.Unlock()

	out := models.JSONMap{}
	if name, ok := config["name"].(string); ok && name != "" {
		flowCtx.Variables[name] = config["value"]
		out[name] = config["value"]
	}
	if vars, ok := config["variables"].(map[string]interface{}); ok {
		for k, v := range vars {
			flowCtx.Variables[k] = v
			out[k] = v
		}
	}
	return out, true, nil
}

// executeSubFlowNode loads a persisted flow by id and runs it as a nested
// flow. The caller's variables are inherited (cheap composability for
// shared state) but node outputs live in a fresh sub-context so node id
// collisions across flows don't matter.
//
// The sub-flow's overall Output becomes this node's output. A failing
// sub-flow fails this node, which the outer flow routes via normal edge
// conditions.
func (fe *FlowExecutor) executeSubFlowNode(ctx context.Context, task *worker.Task, config models.JSONMap, flowCtx *FlowExecutionContext) (models.JSONMap, bool, error) {
	flowID, _ := config["flowId"].(string)
	if flowID == "" {
		return nil, false, fmt.Errorf("subflow: 'flowId' is required")
	}

	var raw []byte
	if err := fe.db.Pool.QueryRow(ctx, `SELECT flow_config FROM flows WHERE id=$1`, flowID).Scan(&raw); err != nil {
		return nil, false, fmt.Errorf("subflow: load %s: %w", flowID, err)
	}
	var subConfig models.FlowConfig
	if err := json.Unmarshal(raw, &subConfig); err != nil {
		return nil, false, fmt.Errorf("subflow: parse config: %w", err)
	}
	if len(subConfig.Nodes) == 0 {
		return models.JSONMap{"flowId": flowID, "note": "empty flow, no-op"}, true, nil
	}

	subCtx := NewFlowExecutionContext()
	flowCtx.mu.RLock()
	for k, v := range flowCtx.Variables {
		subCtx.Variables[k] = v
	}
	flowCtx.mu.RUnlock()

	// Optional input map — merged into variables before execution.
	if input, ok := config["input"].(map[string]interface{}); ok {
		for k, v := range input {
			subCtx.Variables[k] = v
		}
	}

	subResult, err := fe.runFlow(ctx, task, &subConfig, subCtx)
	if err != nil {
		return nil, false, fmt.Errorf("subflow run: %w", err)
	}
	out := models.JSONMap{"flowId": flowID}
	if subResult != nil && subResult.Output != nil {
		out["output"] = subResult.Output
	}
	success := subResult != nil && subResult.Success
	return out, success, nil
}

// executeOutboundWebhook is a specialized HTTP POST that adds HMAC signing
// headers. Standard HTTP node is fine when you don't need signing; this
// exists so receivers can verify authenticity (GitHub/Stripe-style).
//
// Signature: hex(HMAC_SHA256(secret, body)). Header name defaults to
// X-Signature but is configurable.
func (fe *FlowExecutor) executeOutboundWebhook(ctx context.Context, config models.JSONMap) (models.JSONMap, bool, error) {
	url, _ := config["url"].(string)
	if url == "" {
		return nil, false, fmt.Errorf("webhook: 'url' is required")
	}
	method, _ := config["method"].(string)
	if method == "" {
		method = "POST"
	}

	var body []byte
	if b, ok := config["body"].(string); ok && b != "" {
		body = []byte(b)
	} else if bm, ok := config["body"].(map[string]interface{}); ok {
		body, _ = json.Marshal(bm)
	}

	sigHeader, _ := config["signatureHeader"].(string)
	if sigHeader == "" {
		sigHeader = "X-Signature"
	}
	secret, _ := config["secret"].(string)

	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(body))
	if err != nil {
		return nil, false, err
	}
	req.Header.Set("Content-Type", "application/json")
	if secret != "" {
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write(body)
		req.Header.Set(sigHeader, hex.EncodeToString(mac.Sum(nil)))
	}
	if h, ok := config["headers"].(map[string]interface{}); ok {
		for k, v := range h {
			if s, ok := v.(string); ok {
				req.Header.Set(k, s)
			}
		}
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, false, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	out := models.JSONMap{
		"statusCode": resp.StatusCode,
		"body":       string(respBody),
		"signed":     secret != "",
	}
	return out, resp.StatusCode >= 200 && resp.StatusCode < 300, nil
}

// executeWaitWebhookNode registers with the global wait registry under a
// correlation id and parks the flow until a matching HTTP arrives at
// /rl/api/webhooks/wait/:id. The incoming body becomes the node's output
// so downstream nodes can branch on it.
//
// correlationId is required — the client (who triggered the flow) must
// know how to call back. Generate and pass via variables if dynamic.
func (fe *FlowExecutor) executeWaitWebhookNode(ctx context.Context, config models.JSONMap) (models.JSONMap, bool, error) {
	cid, _ := config["correlationId"].(string)
	if cid == "" {
		return nil, false, fmt.Errorf("wait_webhook: 'correlationId' is required")
	}
	timeoutSec := toInt(config["timeoutSec"], 300)
	timeout := time.Duration(timeoutSec) * time.Second

	ev, err := waitForWebhook(ctx, cid, timeout)
	if err != nil {
		if err == context.DeadlineExceeded {
			return models.JSONMap{"correlationId": cid, "timedOut": true}, false, nil
		}
		return nil, false, err
	}
	out := models.JSONMap{
		"correlationId": cid,
		"body":          ev.Body,
		"headers":       ev.Headers,
		"raw":           ev.Raw,
	}
	return out, true, nil
}

