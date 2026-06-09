// Package llm is a tiny, dependency-free client for the three chat providers
// RunLoop supports: Claude (Anthropic Messages API), OpenAI, and Kimi
// (Moonshot, OpenAI-compatible). It is the engine-side twin of the Next.js
// AI assistant proxy (apps/runloop/src/app/api/ai/chat/route.ts) — same
// provider set, same secret names, same default models — so a flow's AI node
// behaves identically to the in-app assistant.
//
// The package deliberately depends only on the standard library: the AI node
// is on the flow execution hot path and we don't want a vendor SDK pulling in
// its own retry/transport behavior underneath the engine's own retry +
// circuit-breaker machinery.
package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// Provider identifies a chat backend. Values match the strings stored in the
// CLAUDE_DEFAULT_PROVIDER secret and accepted by the AI node's `provider`
// field.
type Provider string

const (
	ProviderClaude Provider = "claude"
	ProviderOpenAI Provider = "openai"
	ProviderKimi   Provider = "kimi"
)

// DefaultModel is the per-provider fallback model, used when neither the node
// config nor a <PROVIDER>_DEFAULT_MODEL secret specifies one. Kept in sync
// with DEFAULT_MODEL in the Next.js route.
var DefaultModel = map[Provider]string{
	ProviderClaude: "claude-sonnet-4-7",
	ProviderOpenAI: "gpt-4o-mini",
	ProviderKimi:   "kimi-latest",
}

// MaxTokensCap is the hard ceiling on completion length, matching the
// assistant proxy. Defends against a runaway flow burning a provider budget.
const MaxTokensCap = 4096

// Provider endpoints. Vars (not consts) so tests can point them at an
// httptest server; never reassigned in production code.
var (
	anthropicEndpoint = "https://api.anthropic.com/v1/messages"
	openaiEndpoint    = "https://api.openai.com/v1/chat/completions"
	kimiEndpoint      = "https://api.moonshot.cn/v1/chat/completions"
)

// Message is one turn of the conversation. The AI node only ever sends a
// single user message today, but the slice keeps the door open for an
// agent/tool loop later.
type Message struct {
	Role    string `json:"role"` // "user" | "assistant"
	Content string `json:"content"`
}

// Request is a provider-agnostic completion request.
type Request struct {
	Provider    Provider
	APIKey      string
	Model       string
	System      string
	Messages    []Message
	MaxTokens   int
	Temperature *float64 // pointer so "unset" is distinguishable from 0
	JSONMode    bool     // ask the model to emit a single JSON object
}

// Usage reports token counts, normalized across providers.
type Usage struct {
	PromptTokens     int `json:"promptTokens"`
	CompletionTokens int `json:"completionTokens"`
	TotalTokens      int `json:"totalTokens"`
}

// Response is the normalized result.
type Response struct {
	Text       string   `json:"text"`
	Model      string   `json:"model"`
	Provider   Provider `json:"provider"`
	StopReason string   `json:"stopReason"`
	Usage      Usage    `json:"usage"`
}

// Client performs completions. The zero value is unusable; construct with New.
type Client struct {
	http *http.Client
}

// New builds a Client over the given http.Client. Pass an *http.Client with
// the timeout you want the LLM call bounded by — the engine sizes this from
// the node's timeout config.
func New(httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return &Client{http: httpClient}
}

// Complete dispatches to the right provider and returns a normalized response.
func (c *Client) Complete(ctx context.Context, req Request) (*Response, error) {
	if req.APIKey == "" {
		return nil, fmt.Errorf("llm: API key is empty for provider %q", req.Provider)
	}
	if len(req.Messages) == 0 {
		return nil, fmt.Errorf("llm: at least one message is required")
	}
	if req.MaxTokens <= 0 {
		req.MaxTokens = 1024
	}
	if req.MaxTokens > MaxTokensCap {
		req.MaxTokens = MaxTokensCap
	}
	if req.Model == "" {
		req.Model = DefaultModel[req.Provider]
	}

	switch req.Provider {
	case ProviderClaude:
		return c.completeClaude(ctx, req)
	case ProviderOpenAI:
		return c.completeOpenAICompatible(ctx, req, openaiEndpoint)
	case ProviderKimi:
		return c.completeOpenAICompatible(ctx, req, kimiEndpoint)
	default:
		return nil, fmt.Errorf("llm: unknown provider %q", req.Provider)
	}
}

// ---- Anthropic (Claude) ----

func (c *Client) completeClaude(ctx context.Context, req Request) (*Response, error) {
	system := req.System
	if req.JSONMode {
		// Claude has no native JSON-mode param, so steer via the system text.
		hint := "Respond with a single valid JSON object and nothing else — no prose, no markdown fences."
		if system == "" {
			system = hint
		} else {
			system = system + "\n\n" + hint
		}
	}

	payload := map[string]interface{}{
		"model":      req.Model,
		"max_tokens": req.MaxTokens,
		"messages":   req.Messages,
	}
	if system != "" {
		payload["system"] = system
	}
	if req.Temperature != nil {
		payload["temperature"] = *req.Temperature
	}

	httpReq, err := c.newJSONRequest(ctx, anthropicEndpoint, payload)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("x-api-key", req.APIKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	body, err := c.do(httpReq, ProviderClaude)
	if err != nil {
		return nil, err
	}

	var parsed struct {
		Model      string `json:"model"`
		StopReason string `json:"stop_reason"`
		Content    []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		Usage struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("llm: failed to parse Claude response: %w", err)
	}

	var text strings.Builder
	for _, block := range parsed.Content {
		if block.Type == "text" {
			text.WriteString(block.Text)
		}
	}

	return &Response{
		Text:       text.String(),
		Model:      orDefault(parsed.Model, req.Model),
		Provider:   ProviderClaude,
		StopReason: parsed.StopReason,
		Usage: Usage{
			PromptTokens:     parsed.Usage.InputTokens,
			CompletionTokens: parsed.Usage.OutputTokens,
			TotalTokens:      parsed.Usage.InputTokens + parsed.Usage.OutputTokens,
		},
	}, nil
}

// ---- OpenAI / Kimi (chat completions) ----

func (c *Client) completeOpenAICompatible(ctx context.Context, req Request, endpoint string) (*Response, error) {
	messages := make([]map[string]string, 0, len(req.Messages)+1)
	if req.System != "" {
		messages = append(messages, map[string]string{"role": "system", "content": req.System})
	}
	for _, m := range req.Messages {
		messages = append(messages, map[string]string{"role": m.Role, "content": m.Content})
	}

	payload := map[string]interface{}{
		"model":      req.Model,
		"messages":   messages,
		"max_tokens": req.MaxTokens,
	}
	if req.Temperature != nil {
		payload["temperature"] = *req.Temperature
	}
	if req.JSONMode {
		payload["response_format"] = map[string]string{"type": "json_object"}
	}

	httpReq, err := c.newJSONRequest(ctx, endpoint, payload)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+req.APIKey)

	body, err := c.do(httpReq, req.Provider)
	if err != nil {
		return nil, err
	}

	var parsed struct {
		Model   string `json:"model"`
		Choices []struct {
			Message      struct{ Content string `json:"content"` } `json:"message"`
			FinishReason string                                     `json:"finish_reason"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			TotalTokens      int `json:"total_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("llm: failed to parse %s response: %w", req.Provider, err)
	}
	if len(parsed.Choices) == 0 {
		return nil, fmt.Errorf("llm: %s returned no choices", req.Provider)
	}

	return &Response{
		Text:       parsed.Choices[0].Message.Content,
		Model:      orDefault(parsed.Model, req.Model),
		Provider:   req.Provider,
		StopReason: parsed.Choices[0].FinishReason,
		Usage: Usage{
			PromptTokens:     parsed.Usage.PromptTokens,
			CompletionTokens: parsed.Usage.CompletionTokens,
			TotalTokens:      parsed.Usage.TotalTokens,
		},
	}, nil
}

// ---- shared transport ----

func (c *Client) newJSONRequest(ctx context.Context, endpoint string, payload interface{}) (*http.Request, error) {
	buf, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("llm: failed to encode request: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(buf))
	if err != nil {
		return nil, fmt.Errorf("llm: failed to build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	return httpReq, nil
}

func (c *Client) do(req *http.Request, provider Provider) ([]byte, error) {
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("llm: %s request failed: %w", provider, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("llm: failed to read %s response: %w", provider, err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet := string(body)
		if len(snippet) > 500 {
			snippet = snippet[:500]
		}
		return nil, fmt.Errorf("llm: %s API %d: %s", provider, resp.StatusCode, snippet)
	}
	return body, nil
}

func orDefault(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}
