package connector

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// HTTPConnector implements HTTP request actions
type HTTPConnector struct {
	baseURL    string
	headers    map[string]string
	timeout    time.Duration
	client     *http.Client
}

// NewHTTPConnector creates a new HTTP connector
func NewHTTPConnector() *HTTPConnector {
	return &HTTPConnector{
		timeout: 30 * time.Second,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// Metadata returns connector metadata
func (h *HTTPConnector) Metadata() ConnectorMetadata {
	return ConnectorMetadata{
		Type:        TypeWebhook,
		Name:        "HTTP Request",
		Description: "Make HTTP requests to external APIs",
		Category:    CategoryCommunication,
		Icon:        "globe",
		Version:     "1.0.0",
		ConfigSchema: ConfigSchema{
			Fields: []ConfigField{
				{
					Name:        "base_url",
					Type:        "string",
					Label:       "Base URL",
					Description: "Base URL for all requests (optional)",
					Required:    false,
				},
				{
					Name:        "timeout",
					Type:        "number",
					Label:       "Timeout (seconds)",
					Description: "Request timeout in seconds",
					Required:    false,
				},
				{
					Name:        "default_headers",
					Type:        "string",
					Label:       "Default Headers (JSON)",
					Description: "Default headers as JSON object",
					Required:    false,
				},
			},
		},
		SupportsActions: true,
	}
}

// ValidateConfig validates the configuration
func (h *HTTPConnector) ValidateConfig(config map[string]interface{}) error {
	// HTTP connector can work without base URL (URL can be provided per action)
	return nil
}

// Initialize initializes the connector
func (h *HTTPConnector) Initialize(ctx context.Context, config map[string]interface{}) error {
	if baseURL, ok := config["base_url"].(string); ok {
		h.baseURL = baseURL
	}

	if timeoutSecs, ok := config["timeout"].(float64); ok {
		h.timeout = time.Duration(timeoutSecs) * time.Second
		h.client.Timeout = h.timeout
	}

	if headersStr, ok := config["default_headers"].(string); ok && headersStr != "" {
		var headers map[string]string
		if err := json.Unmarshal([]byte(headersStr), &headers); err == nil {
			h.headers = headers
		}
	}

	return nil
}

// HealthCheck checks if the connector is healthy
func (h *HTTPConnector) HealthCheck(ctx context.Context) error {
	return nil
}

// Close closes the connector
func (h *HTTPConnector) Close() error {
	return nil
}

// GetActions returns available actions
func (h *HTTPConnector) GetActions() []ActionDefinition {
	return []ActionDefinition{
		{
			Name:        "get",
			Label:       "GET Request",
			Description: "Make a GET request",
			Params:      h.requestParams(),
			Output:      h.responseOutput(),
		},
		{
			Name:        "post",
			Label:       "POST Request",
			Description: "Make a POST request",
			Params:      h.requestParamsWithBody(),
			Output:      h.responseOutput(),
		},
		{
			Name:        "put",
			Label:       "PUT Request",
			Description: "Make a PUT request",
			Params:      h.requestParamsWithBody(),
			Output:      h.responseOutput(),
		},
		{
			Name:        "patch",
			Label:       "PATCH Request",
			Description: "Make a PATCH request",
			Params:      h.requestParamsWithBody(),
			Output:      h.responseOutput(),
		},
		{
			Name:        "delete",
			Label:       "DELETE Request",
			Description: "Make a DELETE request",
			Params:      h.requestParams(),
			Output:      h.responseOutput(),
		},
	}
}

func (h *HTTPConnector) requestParams() ConfigSchema {
	return ConfigSchema{
		Fields: []ConfigField{
			{
				Name:        "url",
				Type:        "string",
				Label:       "URL",
				Description: "Request URL (absolute or relative to base URL)",
				Required:    true,
			},
			{
				Name:        "headers",
				Type:        "string",
				Label:       "Headers (JSON)",
				Description: "Additional headers as JSON object",
				Required:    false,
			},
			{
				Name:        "query",
				Type:        "string",
				Label:       "Query Parameters (JSON)",
				Description: "Query parameters as JSON object",
				Required:    false,
			},
			{
				Name:        "auth",
				Type:        "select",
				Label:       "Authentication Type",
				Description: "Authentication method",
				Required:    false,
				Options:     []string{"none", "basic", "bearer", "api_key"},
			},
			{
				Name:        "auth_username",
				Type:        "string",
				Label:       "Username / API Key",
				Description: "For basic auth or API key",
				Required:    false,
			},
			{
				Name:        "auth_password",
				Type:        "string",
				Label:       "Password / Token",
				Description: "For basic auth or bearer token",
				Required:    false,
				Secret:      true,
			},
		},
	}
}

func (h *HTTPConnector) requestParamsWithBody() ConfigSchema {
	params := h.requestParams()
	params.Fields = append(params.Fields, []ConfigField{
		{
			Name:        "body",
			Type:        "string",
			Label:       "Request Body",
			Description: "Request body (JSON, form data, etc.)",
			Required:    false,
		},
		{
			Name:        "content_type",
			Type:        "select",
			Label:       "Content Type",
			Description: "Body content type",
			Required:    false,
			Options:     []string{"application/json", "application/x-www-form-urlencoded", "text/plain", "application/xml"},
		},
	}...)
	return params
}

func (h *HTTPConnector) responseOutput() ConfigSchema {
	return ConfigSchema{
		Fields: []ConfigField{
			{
				Name:        "status",
				Type:        "number",
				Label:       "HTTP Status",
				Required:    true,
			},
			{
				Name:        "statusText",
				Type:        "string",
				Label:       "Status Text",
				Required:    true,
			},
			{
				Name:        "body",
				Type:        "string",
				Label:       "Response Body",
				Required:    true,
			},
			{
				Name:        "headers",
				Type:        "string",
				Label:       "Response Headers (JSON)",
				Required:    true,
			},
			{
				Name:        "duration_ms",
				Type:        "number",
				Label:       "Duration (ms)",
				Required:    true,
			},
		},
	}
}

// privateIPNets are address ranges that must not be reachable via the HTTP connector.
var privateIPNets = func() []*net.IPNet {
	cidrs := []string{
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
		"127.0.0.0/8",
		"169.254.0.0/16", // link-local
		"::1/128",
		"fc00::/7",       // unique-local
		"fe80::/10",      // link-local IPv6
		"0.0.0.0/8",
	}
	var nets []*net.IPNet
	for _, cidr := range cidrs {
		_, n, _ := net.ParseCIDR(cidr)
		nets = append(nets, n)
	}
	return nets
}()

// validateRequestURL ensures the URL is https and does not target private/loopback addresses.
func validateRequestURL(rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	if u.Scheme != "https" {
		return fmt.Errorf("only https:// URLs are allowed (got %q)", u.Scheme)
	}
	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("URL has no host")
	}
	// Resolve host to IPs and block private ranges
	ips, err := net.LookupHost(host)
	if err != nil {
		// If resolution fails, reject to be safe
		return fmt.Errorf("cannot resolve host %q: %w", host, err)
	}
	for _, ipStr := range ips {
		ip := net.ParseIP(ipStr)
		if ip == nil {
			continue
		}
		if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
			return fmt.Errorf("requests to %s are not allowed", ipStr)
		}
		for _, block := range privateIPNets {
			if block.Contains(ip) {
				return fmt.Errorf("requests to private address %s are not allowed", ipStr)
			}
		}
	}
	return nil
}

// ExecuteAction executes an action
func (h *HTTPConnector) ExecuteAction(ctx context.Context, action string, params map[string]interface{}) (*ActionResult, error) {
	method := strings.ToUpper(action)

	urlStr, ok := params["url"].(string)
	if !ok || urlStr == "" {
		return nil, fmt.Errorf("url is required")
	}

	// Build full URL
	fullURL := h.buildURL(urlStr)

	// SSRF protection: only allow https to external hosts
	if err := validateRequestURL(fullURL); err != nil {
		return nil, fmt.Errorf("URL validation failed: %w", err)
	}

	// Add query parameters
	if queryStr, ok := params["query"].(string); ok && queryStr != "" {
		var query map[string]string
		if err := json.Unmarshal([]byte(queryStr), &query); err == nil {
			u, _ := url.Parse(fullURL)
			q := u.Query()
			for k, v := range query {
				q.Set(k, v)
			}
			u.RawQuery = q.Encode()
			fullURL = u.String()
		}
	}

	// Build body
	var body io.Reader
	if bodyStr, ok := params["body"].(string); ok && bodyStr != "" {
		body = bytes.NewBufferString(bodyStr)
	}

	// Create request
	req, err := http.NewRequestWithContext(ctx, method, fullURL, body)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	for k, v := range h.headers {
		req.Header.Set(k, v)
	}

	if headersStr, ok := params["headers"].(string); ok && headersStr != "" {
		var headers map[string]string
		if err := json.Unmarshal([]byte(headersStr), &headers); err == nil {
			for k, v := range headers {
				req.Header.Set(k, v)
			}
		}
	}

	// Set content type
	if contentType, ok := params["content_type"].(string); ok && contentType != "" {
		req.Header.Set("Content-Type", contentType)
	} else if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	// Set authentication
	if authType, ok := params["auth"].(string); ok && authType != "" && authType != "none" {
		switch authType {
		case "basic":
			username, _ := params["auth_username"].(string)
			password, _ := params["auth_password"].(string)
			req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(username+":"+password)))
		case "bearer":
			token, _ := params["auth_password"].(string)
			req.Header.Set("Authorization", "Bearer "+token)
		case "api_key":
			apiKey, _ := params["auth_username"].(string)
			// Try different common header names
			req.Header.Set("X-API-Key", apiKey)
			req.Header.Set("Authorization", apiKey)
		}
	}

	// Execute request
	start := time.Now()
	resp, err := h.client.Do(req)
	duration := time.Since(start)
	
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	// Read response body
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Build response headers
	respHeaders := make(map[string]string)
	for k, v := range resp.Header {
		if len(v) > 0 {
			respHeaders[k] = v[0]
		}
	}
	respHeadersJSON, _ := json.Marshal(respHeaders)

	return &ActionResult{
		Success: resp.StatusCode >= 200 && resp.StatusCode < 300,
		Data: map[string]interface{}{
			"status":      resp.StatusCode,
			"statusText":  resp.Status,
			"body":        string(respBody),
			"headers":     string(respHeadersJSON),
			"duration_ms": duration.Milliseconds(),
		},
	}, nil
}

func (h *HTTPConnector) buildURL(urlStr string) string {
	if h.baseURL == "" {
		return urlStr
	}
	
	// If urlStr is absolute, use it
	if strings.HasPrefix(urlStr, "http://") || strings.HasPrefix(urlStr, "https://") {
		return urlStr
	}
	
	// Otherwise, combine with base URL
	base := strings.TrimSuffix(h.baseURL, "/")
	path := strings.TrimPrefix(urlStr, "/")
	return base + "/" + path
}
