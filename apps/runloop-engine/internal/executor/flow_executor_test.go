package executor

import (
	"testing"

	"github.com/runloop/runloop-engine/internal/models"
)

func TestEvalCondition_Numeric(t *testing.T) {
	cases := []struct {
		op    string
		l, r  string
		want  bool
		isErr bool
	}{
		{"eq", "5", "5", true, false},
		{"eq", "5", "6", false, false},
		{"neq", "x", "y", true, false},
		{"gt", "5", "3", true, false},
		{"gt", "3", "5", false, false},
		{"lt", "3", "5", true, false},
		{"gte", "5", "5", true, false},
		{"lte", "5", "5", true, false},
		{"contains", "hello world", "world", true, false},
		{"contains", "hello", "xyz", false, false},
		{"gt", "abc", "def", false, true}, // non-numeric
		{"foo", "5", "5", false, true},    // unknown op
	}
	for _, tc := range cases {
		cfg := models.JSONMap{
			"operator": tc.op,
			"left":     tc.l,
			"right":    tc.r,
		}
		got, err := evalCondition(cfg)
		if tc.isErr {
			if err == nil {
				t.Errorf("evalCondition(%q,%q,%q) expected error, got nil", tc.op, tc.l, tc.r)
			}
			continue
		}
		if err != nil {
			t.Errorf("evalCondition(%q,%q,%q) error: %v", tc.op, tc.l, tc.r, err)
			continue
		}
		if got != tc.want {
			t.Errorf("evalCondition(%q,%q,%q) = %v, want %v", tc.op, tc.l, tc.r, got, tc.want)
		}
	}
}

func TestEvalCondition_DefaultsToEq(t *testing.T) {
	cfg := models.JSONMap{"left": "x", "right": "x"} // no operator
	got, err := evalCondition(cfg)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !got {
		t.Errorf("default operator should be eq → true for equal operands")
	}
}

func TestToInt(t *testing.T) {
	cases := []struct {
		in   interface{}
		def  int
		want int
	}{
		{42, 0, 42},
		{int64(7), 0, 7},
		{float64(3.7), 0, 3}, // truncates
		{"15", 0, 15},
		{"not-a-number", 99, 99},
		{nil, 7, 7},
		{[]int{1, 2}, 5, 5}, // unsupported → default
	}
	for i, tc := range cases {
		got := toInt(tc.in, tc.def)
		if got != tc.want {
			t.Errorf("case %d toInt(%v, %d) = %d, want %d", i, tc.in, tc.def, got, tc.want)
		}
	}
}

func TestIsFlowShapeNode(t *testing.T) {
	shape := []models.JobType{
		models.JobTypeStart, models.JobTypeEnd, models.JobTypeCondition,
		models.JobTypeDelay, models.JobTypeLoop, models.JobTypeTransform,
		models.JobTypeMerge, models.JobTypeSwitch, models.JobTypeLog,
		models.JobTypeSetVar, models.JobTypeSubFlow, models.JobTypeWebhook,
		models.JobTypeWaitHook, models.JobTypeEnqueue, models.JobTypeNotify,
	}
	for _, jt := range shape {
		if !isFlowShapeNode(jt) {
			t.Errorf("isFlowShapeNode(%q) = false, want true", jt)
		}
	}
	external := []models.JobType{
		models.JobTypeHTTP, models.JobTypeDatabase, models.JobTypeShell,
		models.JobTypePython, models.JobTypeNodeJS, models.JobTypeDocker,
		models.JobTypeSlack, models.JobTypeEmail,
	}
	for _, jt := range external {
		if isFlowShapeNode(jt) {
			t.Errorf("isFlowShapeNode(%q) = true, want false (external I/O)", jt)
		}
	}
}

// edgePasses + edgePasses default behaviour
func TestEdgePasses(t *testing.T) {
	cases := []struct {
		condition  string
		sourceOK   bool
		skipped    bool
		wantFires  bool
	}{
		{"ON_SUCCESS", true, false, true},
		{"ON_SUCCESS", false, false, false},
		{"ON_FAILURE", false, false, true},
		{"ON_FAILURE", true, false, false},
		{"ON_COMPLETE", true, false, true},
		{"ON_COMPLETE", false, false, true},
		{"", true, false, true},        // default = ON_SUCCESS
		{"unknown", true, false, true}, // unknown falls back to sourceOK
		{"ON_SUCCESS", true, true, false}, // skipped never fires
	}
	for _, tc := range cases {
		got := edgePasses(GraphEdge{Condition: tc.condition}, tc.sourceOK, tc.skipped)
		if got != tc.wantFires {
			t.Errorf("edgePasses(%q, ok=%v, skipped=%v) = %v, want %v",
				tc.condition, tc.sourceOK, tc.skipped, got, tc.wantFires)
		}
	}
}
