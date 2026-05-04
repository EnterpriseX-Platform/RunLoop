package scheduler

import (
	"testing"

	"github.com/runloop/runloop-engine/internal/models"
)

// hasFlowGraph: scheduler trigger uses this to decide whether the
// attached flow has a real per-node graph (route through FlowExecutor)
// or is just a wrapper that needs the legacy direct-executor path.
//
// The bug it guards against: when a SIMPLE flow with an HTTP node was
// triggered by cron, the old code dispatched task.Type=HTTP with the
// scheduler's top-level config (no `url` field), failing every run with
// "URL is required for HTTP jobs". hasFlowGraph + the surrounding logic
// route those flows through FlowExecutor instead, where the per-node
// config is read correctly.

func TestHasFlowGraph_NilOrEmpty(t *testing.T) {
	if hasFlowGraph(nil) {
		t.Errorf("nil flowConfig should not be a flow graph")
	}
	if hasFlowGraph(models.JSONMap{}) {
		t.Errorf("empty flowConfig should not be a flow graph")
	}
	if hasFlowGraph(models.JSONMap{"nodes": []interface{}{}}) {
		t.Errorf("empty nodes array should not be a flow graph")
	}
}

func TestHasFlowGraph_OnlyStartEnd(t *testing.T) {
	// A stub flow with just START + END should fall through to legacy
	// path so resolveTaskReferences gets a chance.
	cfg := models.JSONMap{
		"nodes": []interface{}{
			map[string]interface{}{"id": "s", "type": "START"},
			map[string]interface{}{"id": "e", "type": "END"},
		},
	}
	if hasFlowGraph(cfg) {
		t.Errorf("START+END only should not be considered a flow graph")
	}
}

func TestHasFlowGraph_RealHTTPNode(t *testing.T) {
	// This is the user-reported scenario: SIMPLE flow with an embedded
	// HTTP node. Must route through FlowExecutor.
	cfg := models.JSONMap{
		"nodes": []interface{}{
			map[string]interface{}{"id": "s", "type": "START"},
			map[string]interface{}{
				"id":   "h",
				"type": "HTTP",
				"config": map[string]interface{}{
					"url":    "https://example.com/api",
					"method": "POST",
				},
			},
			map[string]interface{}{"id": "e", "type": "END"},
		},
	}
	if !hasFlowGraph(cfg) {
		t.Errorf("flow with an HTTP node should be a flow graph")
	}
}

func TestHasFlowGraph_DAGShapeNodes(t *testing.T) {
	// Even pure shape nodes (CONDITION, LOG, …) count — anything that
	// FlowExecutor knows how to dispatch.
	cfg := models.JSONMap{
		"nodes": []interface{}{
			map[string]interface{}{"id": "s", "type": "START"},
			map[string]interface{}{"id": "c", "type": "CONDITION"},
			map[string]interface{}{"id": "l", "type": "LOG"},
			map[string]interface{}{"id": "e", "type": "END"},
		},
	}
	if !hasFlowGraph(cfg) {
		t.Errorf("flow with shape nodes (CONDITION, LOG) should still be a flow graph")
	}
}

func TestHasFlowGraph_MalformedNodeIgnored(t *testing.T) {
	// A node entry that isn't an object should be skipped, not panic.
	cfg := models.JSONMap{
		"nodes": []interface{}{
			"not-an-object",
			map[string]interface{}{"id": "h", "type": "HTTP"},
		},
	}
	if !hasFlowGraph(cfg) {
		t.Errorf("malformed node should be skipped; the HTTP node still qualifies")
	}
}
