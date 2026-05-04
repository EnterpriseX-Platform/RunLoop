package executor

import (
	"reflect"
	"testing"

	"github.com/runloop/runloop-engine/internal/models"
)

// findUnresolvedTemplates: pre-flight check that catches ${{...}}
// placeholders left in node config after substitution. Without this guard
// the literal text gets shipped downstream and the upstream may quietly
// accept or cryptically reject it (e.g. Mendix's MFR2003 STREAM_READ_FAIL
// hides the cause behind an HTTP 200 + body.responseStatus="FAIL").

func TestFindUnresolvedTemplates_NoneFound(t *testing.T) {
	cfg := models.JSONMap{
		"url":     "https://api.example.com/v1/users",
		"method":  "POST",
		"timeout": 30,
		"body":    "all literal",
	}
	if got := findUnresolvedTemplates(cfg); len(got) != 0 {
		t.Errorf("expected nil, got %v", got)
	}
}

func TestFindUnresolvedTemplates_TopLevelString(t *testing.T) {
	cfg := models.JSONMap{
		"url":  "https://api.example.com/${{env.MISSING}}/users",
		"body": "user=${{input.name}}",
	}
	got := findUnresolvedTemplates(cfg)
	want := []string{"env.MISSING", "input.name"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestFindUnresolvedTemplates_NestedMap(t *testing.T) {
	cfg := models.JSONMap{
		"headers": map[string]interface{}{
			"Authorization": "Bearer ${{secrets.TOKEN}}",
		},
	}
	got := findUnresolvedTemplates(cfg)
	if len(got) != 1 || got[0] != "secrets.TOKEN" {
		t.Errorf("got %v, want [secrets.TOKEN]", got)
	}
}

func TestFindUnresolvedTemplates_Array(t *testing.T) {
	cfg := models.JSONMap{
		"items": []interface{}{
			"first",
			"second-${{var.x}}",
			map[string]interface{}{"k": "${{var.y}}"},
		},
	}
	got := findUnresolvedTemplates(cfg)
	want := []string{"var.x", "var.y"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestFindUnresolvedTemplates_DedupesSameKey(t *testing.T) {
	cfg := models.JSONMap{
		"a": "${{env.X}}",
		"b": "prefix-${{env.X}}-suffix",
	}
	got := findUnresolvedTemplates(cfg)
	if len(got) != 1 || got[0] != "env.X" {
		t.Errorf("expected single dedup'd key, got %v", got)
	}
}

func TestFindUnresolvedTemplates_IgnoresSingleBrace(t *testing.T) {
	// `${Hello}` (single brace) is foreign syntax — Mendix microflows
	// use it. We only flag double-brace ${{...}} which is the RunLoop
	// substitution syntax.
	cfg := models.JSONMap{"body": `{"text":"${Hello}"}`}
	got := findUnresolvedTemplates(cfg)
	if len(got) != 0 {
		t.Errorf("single-brace placeholder should not be flagged, got %v", got)
	}
}

// HTTP node body-content checks
func TestJsonPathGet_Basic(t *testing.T) {
	v := map[string]interface{}{
		"responseStatus": "FAIL",
		"data": map[string]interface{}{
			"items": []interface{}{
				map[string]interface{}{"status": "ok"},
				map[string]interface{}{"status": "bad"},
			},
		},
	}
	cases := []struct {
		path string
		want interface{}
	}{
		{"responseStatus", "FAIL"},
		{"data.items.0.status", "ok"},
		{"data.items.1.status", "bad"},
		{"missing", nil},
		{"data.items.99.status", nil},
	}
	for _, c := range cases {
		got := jsonPathGet(v, c.path)
		if got != c.want {
			t.Errorf("jsonPathGet(%q) = %v, want %v", c.path, got, c.want)
		}
	}
}

// evalHTTPExpr — per-node expression check on response body.
func TestEvalHTTPExpr_BodyResponseStatus(t *testing.T) {
	body := map[string]interface{}{"responseStatus": "SUCCESS", "data": "x"}
	hdr := map[string][]string{"Content-Type": {"application/json"}}

	cases := []struct {
		expr string
		want bool
	}{
		{`body.responseStatus == "SUCCESS"`, true},
		{`body.responseStatus == "FAIL"`, false},
		{`statusCode == 200`, true},
		{`statusCode == 500`, false},
		{`body.responseStatus == "SUCCESS" && statusCode == 200`, true},
		{`body.responseStatus == "SUCCESS" || statusCode == 500`, true},
	}
	for _, c := range cases {
		got, err := evalHTTPExpr(c.expr, body, 200, hdr)
		if err != nil {
			t.Errorf("expr %q errored: %v", c.expr, err)
			continue
		}
		if got != c.want {
			t.Errorf("expr %q = %v, want %v", c.expr, got, c.want)
		}
	}
}

func TestEvalHTTPExpr_ArrayLen(t *testing.T) {
	// GraphQL-style: errors is empty array on success
	body := map[string]interface{}{
		"data":   map[string]interface{}{"id": "1"},
		"errors": []interface{}{},
	}
	got, err := evalHTTPExpr(`len(body.errors) == 0`, body, 200, nil)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !got {
		t.Errorf("expected true for empty errors, got false")
	}

	body["errors"] = []interface{}{
		map[string]interface{}{"message": "boom"},
	}
	got, _ = evalHTTPExpr(`len(body.errors) == 0`, body, 200, nil)
	if got {
		t.Errorf("expected false for non-empty errors, got true")
	}
}

func TestEvalHTTPExpr_NestedAccess(t *testing.T) {
	body := map[string]interface{}{
		"data": map[string]interface{}{
			"user": map[string]interface{}{"id": "u1", "active": true},
		},
	}
	got, err := evalHTTPExpr(`body.data.user.active == true`, body, 200, nil)
	if err != nil || !got {
		t.Errorf("expected true, got %v err=%v", got, err)
	}
}

func TestEvalHTTPExpr_CompileError(t *testing.T) {
	_, err := evalHTTPExpr(`body.responseStatus ==`, nil, 200, nil)
	if err == nil {
		t.Errorf("expected compile error for malformed expression")
	}
}

func TestEvalHTTPExpr_NonBoolResult(t *testing.T) {
	// expr.AsBool() should reject non-bool results at compile time
	_, err := evalHTTPExpr(`body.responseStatus`, map[string]interface{}{"responseStatus": "OK"}, 200, nil)
	if err == nil {
		t.Errorf("expected error for non-bool expression result")
	}
}

func TestEvalHTTPExpr_StringBody(t *testing.T) {
	// Plain-text body — body is the string itself
	got, err := evalHTTPExpr(`body == "OK"`, "OK", 200, nil)
	if err != nil || !got {
		t.Errorf("expected true on string body match, got %v err=%v", got, err)
	}
}

func TestLooseEqual(t *testing.T) {
	cases := []struct {
		a, b interface{}
		want bool
	}{
		{"FAIL", "FAIL", true},
		{"FAIL", "fail", false},
		{nil, nil, true},
		{nil, "x", false},
		{true, true, true},
		{200, 200.0, true}, // JSON-decoded numbers are float64
		{200, "200", true}, // loose: stringify-then-compare
	}
	for _, c := range cases {
		got := looseEqual(c.a, c.b)
		if got != c.want {
			t.Errorf("looseEqual(%v, %v) = %v, want %v", c.a, c.b, got, c.want)
		}
	}
}
