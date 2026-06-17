package llm

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCompleteClaude(t *testing.T) {
	var gotPath, gotKey, gotVersion string
	var gotBody map[string]interface{}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotKey = r.Header.Get("x-api-key")
		gotVersion = r.Header.Get("anthropic-version")
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &gotBody)

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"model": "claude-sonnet-4-7",
			"stop_reason": "end_turn",
			"content": [{"type":"text","text":"hello world"}],
			"usage": {"input_tokens": 12, "output_tokens": 3}
		}`))
	}))
	defer srv.Close()

	orig := anthropicEndpoint
	anthropicEndpoint = srv.URL
	defer func() { anthropicEndpoint = orig }()

	temp := 0.5
	resp, err := New(srv.Client()).Complete(context.Background(), Request{
		Provider:    ProviderClaude,
		APIKey:      "sk-test",
		System:      "be terse",
		Messages:    []Message{{Role: "user", Content: "hi"}},
		MaxTokens:   100,
		Temperature: &temp,
	})
	if err != nil {
		t.Fatalf("Complete returned error: %v", err)
	}

	if gotPath == "" || gotKey != "sk-test" || gotVersion != "2023-06-01" {
		t.Errorf("request headers wrong: key=%q version=%q", gotKey, gotVersion)
	}
	if gotBody["system"] != "be terse" {
		t.Errorf("system not forwarded: %v", gotBody["system"])
	}
	if gotBody["max_tokens"].(float64) != 100 {
		t.Errorf("max_tokens wrong: %v", gotBody["max_tokens"])
	}
	if gotBody["temperature"].(float64) != 0.5 {
		t.Errorf("temperature wrong: %v", gotBody["temperature"])
	}
	if resp.Text != "hello world" {
		t.Errorf("text = %q, want %q", resp.Text, "hello world")
	}
	if resp.StopReason != "end_turn" {
		t.Errorf("stopReason = %q", resp.StopReason)
	}
	if resp.Usage.TotalTokens != 15 {
		t.Errorf("totalTokens = %d, want 15", resp.Usage.TotalTokens)
	}
}

func TestCompleteOpenAIJSONMode(t *testing.T) {
	var gotBody map[string]interface{}
	var gotAuth string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"model": "gpt-4o-mini",
			"choices": [{"message": {"content": "{\"ok\":true}"}, "finish_reason": "stop"}],
			"usage": {"prompt_tokens": 5, "completion_tokens": 4, "total_tokens": 9}
		}`))
	}))
	defer srv.Close()

	orig := openaiEndpoint
	openaiEndpoint = srv.URL
	defer func() { openaiEndpoint = orig }()

	resp, err := New(srv.Client()).Complete(context.Background(), Request{
		Provider:  ProviderOpenAI,
		APIKey:    "sk-oai",
		System:    "sys",
		Messages:  []Message{{Role: "user", Content: "give me json"}},
		MaxTokens: 50,
		JSONMode:  true,
	})
	if err != nil {
		t.Fatalf("Complete returned error: %v", err)
	}

	if gotAuth != "Bearer sk-oai" {
		t.Errorf("auth header = %q", gotAuth)
	}
	rf, ok := gotBody["response_format"].(map[string]interface{})
	if !ok || rf["type"] != "json_object" {
		t.Errorf("response_format not set for JSON mode: %v", gotBody["response_format"])
	}
	// system + user message should both be present, system first
	msgs, _ := gotBody["messages"].([]interface{})
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	if first := msgs[0].(map[string]interface{}); first["role"] != "system" {
		t.Errorf("first message role = %v, want system", first["role"])
	}
	if resp.Text != `{"ok":true}` {
		t.Errorf("text = %q", resp.Text)
	}
	if resp.Usage.TotalTokens != 9 {
		t.Errorf("totalTokens = %d, want 9", resp.Usage.TotalTokens)
	}
}

func TestCompleteMaxTokensCapped(t *testing.T) {
	var gotBody map[string]interface{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"content":[{"type":"text","text":"x"}],"usage":{}}`))
	}))
	defer srv.Close()

	orig := anthropicEndpoint
	anthropicEndpoint = srv.URL
	defer func() { anthropicEndpoint = orig }()

	_, err := New(srv.Client()).Complete(context.Background(), Request{
		Provider:  ProviderClaude,
		APIKey:    "k",
		Messages:  []Message{{Role: "user", Content: "hi"}},
		MaxTokens: 999999,
	})
	if err != nil {
		t.Fatalf("Complete returned error: %v", err)
	}
	if gotBody["max_tokens"].(float64) != float64(MaxTokensCap) {
		t.Errorf("max_tokens = %v, want capped at %d", gotBody["max_tokens"], MaxTokensCap)
	}
}

func TestCompleteUpstreamError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"invalid key"}`))
	}))
	defer srv.Close()

	orig := openaiEndpoint
	openaiEndpoint = srv.URL
	defer func() { openaiEndpoint = orig }()

	_, err := New(srv.Client()).Complete(context.Background(), Request{
		Provider: ProviderOpenAI,
		APIKey:   "bad",
		Messages: []Message{{Role: "user", Content: "hi"}},
	})
	if err == nil {
		t.Fatal("expected error on 401, got nil")
	}
}

func TestCompleteValidation(t *testing.T) {
	c := New(nil)
	if _, err := c.Complete(context.Background(), Request{Provider: ProviderClaude, Messages: []Message{{Role: "user", Content: "x"}}}); err == nil {
		t.Error("expected error for empty API key")
	}
	if _, err := c.Complete(context.Background(), Request{Provider: ProviderClaude, APIKey: "k"}); err == nil {
		t.Error("expected error for no messages")
	}
	if _, err := c.Complete(context.Background(), Request{Provider: "bogus", APIKey: "k", Messages: []Message{{Role: "user", Content: "x"}}}); err == nil {
		t.Error("expected error for unknown provider")
	}
}
