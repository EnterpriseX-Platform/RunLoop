package executor

import (
	"bytes"
	"context"
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/smtp"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/runloop/runloop-engine/internal/models"
	"github.com/runloop/runloop-engine/internal/worker"
)

// JobExecutor implements the worker.Executor interface
type JobExecutor struct {
	httpClient   *http.Client
	dbConn       *sql.DB
	flowExecutor *FlowExecutor // Used when task.FlowConfig is present
}

// NewJobExecutor creates a new job executor
func NewJobExecutor() *JobExecutor {
	return &JobExecutor{
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// SetFlowExecutor wires a FlowExecutor so multi-node flows run through the
// parallel DAG engine instead of the single-task dispatcher.
func (e *JobExecutor) SetFlowExecutor(fe *FlowExecutor) {
	e.flowExecutor = fe
}

// Execute executes a task based on its type
func (e *JobExecutor) Execute(ctx context.Context, task *worker.Task) (*models.JobResult, error) {
	// Flow tasks (multi-node DAG) route to the flow executor which runs
	// independent branches in parallel.
	if task.FlowConfig != nil && len(task.FlowConfig.Nodes) > 0 && e.flowExecutor != nil {
		return e.flowExecutor.ExecuteFlow(ctx, task, task.FlowConfig)
	}

	switch task.Type {
	case models.JobTypeHTTP:
		return e.executeHTTP(ctx, task)
	case models.JobTypeDatabase:
		return e.executeDatabase(ctx, task)
	case models.JobTypeShell:
		return e.executeShell(ctx, task)
	case models.JobTypePython:
		return e.executePython(ctx, task)
	case models.JobTypeNodeJS:
		return e.executeNodeJS(ctx, task)
	case models.JobTypeSlack:
		return e.executeSlack(ctx, task)
	case models.JobTypeEmail:
		return e.executeEmail(ctx, task)
	case models.JobTypeDocker:
		return e.executeDocker(ctx, task)
	default:
		return nil, fmt.Errorf("unsupported job type: %s", task.Type)
	}
}

// executeHTTP executes an HTTP request job
func (e *JobExecutor) executeHTTP(ctx context.Context, task *worker.Task) (*models.JobResult, error) {
	config := task.Config
	
	// Extract configuration
	method, _ := config["method"].(string)
	if method == "" {
		method = "GET"
	}
	
	url, _ := config["url"].(string)
	if url == "" {
		return nil, fmt.Errorf("URL is required for HTTP jobs")
	}
	
	headers, _ := config["headers"].(map[string]interface{})
	body, _ := config["body"].(string)
	
	// Get timeout from config (default 30 seconds)
	timeout := 30 * time.Second
	if timeoutVal, ok := config["timeout"].(float64); ok && timeoutVal > 0 {
		timeout = time.Duration(timeoutVal) * time.Second
	}
	
	// Check follow redirects
	followRedirects := true
	if followVal, ok := config["followRedirects"].(bool); ok {
		followRedirects = followVal
	}
	
	// Create HTTP client with timeout and redirect policy
	client := &http.Client{
		Timeout: timeout,
	}
	
	if !followRedirects {
		client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		}
	}
	
	// Create request
	var bodyReader io.Reader
	if body != "" {
		bodyReader = strings.NewReader(body)
	}
	
	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("failed to create HTTP request: %w", err)
	}
	
	// Add headers
	for key, value := range headers {
		if strValue, ok := value.(string); ok {
			req.Header.Set(key, strValue)
		}
	}
	
	// Handle authentication
	authType, _ := config["authType"].(string)
	switch authType {
	case "bearer":
		if authToken, ok := config["authToken"].(string); ok && authToken != "" {
			req.Header.Set("Authorization", "Bearer "+authToken)
		}
	case "basic":
		if authUsername, ok := config["authUsername"].(string); ok && authUsername != "" {
			if authPassword, ok := config["authPassword"].(string); ok {
				req.SetBasicAuth(authUsername, authPassword)
			}
		}
	case "apiKey":
		if apiKeyName, ok := config["apiKeyName"].(string); ok && apiKeyName != "" {
			if apiKeyValue, ok := config["apiKeyValue"].(string); ok && apiKeyValue != "" {
				req.Header.Set(apiKeyName, apiKeyValue)
			}
		}
	}
	
	// Execute request
	start := time.Now()
	resp, err := client.Do(req)
	duration := time.Since(start)
	
	if err != nil {
		return &models.JobResult{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("HTTP request failed: %v", err)),
			Logs:         fmt.Sprintf("Request: %s %s\nDuration: %v\nError: %v", method, url, duration, err),
		}, nil
	}
	defer resp.Body.Close()
	
	// Read response
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return &models.JobResult{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("Failed to read response: %v", err)),
			Logs:         fmt.Sprintf("Request: %s %s\nDuration: %v\nError: %v", method, url, duration, err),
		}, nil
	}
	
	// Parse response
	var responseData interface{}
	if err := json.Unmarshal(respBody, &responseData); err != nil {
		responseData = string(respBody)
	}
	
	// Check status code
	success := resp.StatusCode >= 200 && resp.StatusCode < 300
	expectedStatus, hasExpected := config["expectedStatus"].(float64)
	if hasExpected {
		success = resp.StatusCode == int(expectedStatus)
	}

	// Body-level success check. Many APIs (Mendix microflows, GraphQL,
	// SOAP-over-JSON, …) return HTTP 200 with an in-body status flag
	// when business logic failed. Without this guard a flow shows
	// SUCCESS while the upstream actually rejected the call.
	//
	// Two options the flow author can use:
	//   successWhenJsonPath: { path: "responseStatus", equals: "SUCCESS" }
	//   failWhenJsonPath:    { path: "responseStatus", equals: "FAIL" }
	// (path is dot-notation, e.g. "data.items.0.status").
	failureReason := ""
	if success {
		if check, ok := config["successWhenJsonPath"].(map[string]interface{}); ok {
			path, _ := check["path"].(string)
			expected := check["equals"]
			actual := jsonPathGet(responseData, path)
			if !looseEqual(actual, expected) {
				success = false
				failureReason = fmt.Sprintf(
					"successWhenJsonPath failed: expected %s=%v but got %v",
					path, expected, actual)
			}
		}
		if check, ok := config["failWhenJsonPath"].(map[string]interface{}); ok {
			path, _ := check["path"].(string)
			marker := check["equals"]
			actual := jsonPathGet(responseData, path)
			if looseEqual(actual, marker) {
				success = false
				failureReason = fmt.Sprintf(
					"failWhenJsonPath matched: %s=%v indicates failure",
					path, actual)
			}
		}
	}
	
	// Build auth info for logs — never log credentials
	authInfo := "Auth: None"
	switch authType {
	case "bearer":
		authInfo = "Auth: Bearer Token"
	case "basic":
		authInfo = "Auth: Basic Auth"
	case "apiKey":
		if apiKeyName, ok := config["apiKeyName"].(string); ok {
			authInfo = fmt.Sprintf("Auth: API Key (%s)", apiKeyName)
		}
	}

	// Redact sensitive response headers before logging
	safeRespHeaders := make(http.Header)
	redactedHeaders := map[string]bool{
		"Authorization": true, "Set-Cookie": true, "Cookie": true,
		"X-Api-Key": true, "X-Auth-Token": true,
	}
	for k, v := range resp.Header {
		if redactedHeaders[http.CanonicalHeaderKey(k)] {
			safeRespHeaders[k] = []string{"[REDACTED]"}
		} else {
			safeRespHeaders[k] = v
		}
	}

	result := &models.JobResult{
		Success: success,
		Output: models.JSONMap{
			"statusCode": resp.StatusCode,
			"headers":    safeRespHeaders,
			"body":       responseData,
			"durationMs": duration.Milliseconds(),
		},
		Logs: fmt.Sprintf(
			"Request: %s %s\nTimeout: %v\n%s\nFollow Redirects: %v\nDuration: %v\nStatus: %d\nResponse: %s",
			method, url, timeout, authInfo, followRedirects, duration, resp.StatusCode, string(respBody),
		),
	}
	
	if !success {
		if failureReason != "" {
			result.ErrorMessage = strPtr(fmt.Sprintf("HTTP %d but %s; body=%s",
				resp.StatusCode, failureReason, truncate(string(respBody), 400)))
		} else {
			result.ErrorMessage = strPtr(fmt.Sprintf("HTTP %d: %s",
				resp.StatusCode, truncate(string(respBody), 400)))
		}
	}

	return result, nil
}

// jsonPathGet walks a dot-notation path into a JSON-decoded value.
// "a.b.0.c" descends through map keys and array indices; missing keys
// return nil. Used by HTTP node's successWhenJsonPath / failWhenJsonPath
// checks so flows can fail when an upstream returns 200 with an
// in-body error flag (Mendix microflows, GraphQL, SOAP-over-JSON, …).
func jsonPathGet(v interface{}, path string) interface{} {
	if path == "" {
		return v
	}
	parts := strings.Split(path, ".")
	cur := v
	for _, p := range parts {
		if cur == nil {
			return nil
		}
		switch node := cur.(type) {
		case map[string]interface{}:
			cur = node[p]
		case []interface{}:
			idx := 0
			for _, c := range p {
				if c < '0' || c > '9' {
					return nil
				}
				idx = idx*10 + int(c-'0')
			}
			if idx >= len(node) {
				return nil
			}
			cur = node[idx]
		default:
			return nil
		}
	}
	return cur
}

// looseEqual compares values using JSON-friendly rules: numbers cast to
// float64, strings compared verbatim, booleans direct. Anything else
// uses fmt.Sprint.
func looseEqual(a, b interface{}) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	if as, ok := a.(string); ok {
		if bs, ok := b.(string); ok {
			return as == bs
		}
	}
	if ab, ok := a.(bool); ok {
		if bb, ok := b.(bool); ok {
			return ab == bb
		}
	}
	return fmt.Sprint(a) == fmt.Sprint(b)
}

// executeDatabase executes a database query job
func (e *JobExecutor) executeDatabase(ctx context.Context, task *worker.Task) (*models.JobResult, error) {
	config := task.Config
	
	// Extract configuration
	driver, _ := config["driver"].(string)
	if driver == "" {
		driver = "postgres"
	}
	
	connectionString, _ := config["connectionString"].(string)
	if connectionString == "" {
		return nil, fmt.Errorf("connectionString is required for database jobs")
	}
	
	query, _ := config["query"].(string)
	if query == "" {
		return nil, fmt.Errorf("query is required for database jobs")
	}
	
	// Connect to database
	db, err := sql.Open(driver, connectionString)
	if err != nil {
		return &models.JobResult{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("Failed to connect to database: %v", err)),
			Logs:         fmt.Sprintf("Driver: %s\nError: %v", driver, err),
		}, nil
	}
	defer db.Close()
	
	// Set connection limits
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	
	// Test connection
	if err := db.PingContext(ctx); err != nil {
		return &models.JobResult{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("Failed to ping database: %v", err)),
			Logs:         fmt.Sprintf("Driver: %s\nError: %v", driver, err),
		}, nil
	}
	
	// Execute query
	start := time.Now()
	
	// Check if it's a SELECT query
	isSelect := strings.HasPrefix(strings.TrimSpace(strings.ToUpper(query)), "SELECT")
	
	if isSelect {
		rows, err := db.QueryContext(ctx, query)
		duration := time.Since(start)
		
		if err != nil {
			return &models.JobResult{
				Success:      false,
				ErrorMessage: strPtr(fmt.Sprintf("Query failed: %v", err)),
				Logs:         fmt.Sprintf("Query: %s\nDuration: %v\nError: %v", query, duration, err),
			}, nil
		}
		defer rows.Close()
		
		// Get column names
		columns, err := rows.Columns()
		if err != nil {
			return &models.JobResult{
				Success:      false,
				ErrorMessage: strPtr(fmt.Sprintf("Failed to get columns: %v", err)),
				Logs:         fmt.Sprintf("Query: %s\nDuration: %v\nError: %v", query, duration, err),
			}, nil
		}
		
		// Fetch results
		var results []map[string]interface{}
		for rows.Next() {
			values := make([]interface{}, len(columns))
			valuePtrs := make([]interface{}, len(columns))
			for i := range values {
				valuePtrs[i] = &values[i]
			}
			
			if err := rows.Scan(valuePtrs...); err != nil {
				return &models.JobResult{
					Success:      false,
					ErrorMessage: strPtr(fmt.Sprintf("Failed to scan row: %v", err)),
					Logs:         fmt.Sprintf("Query: %s\nDuration: %v\nError: %v", query, duration, err),
				}, nil
			}
			
			row := make(map[string]interface{})
			for i, col := range columns {
				row[col] = values[i]
			}
			results = append(results, row)
		}
		
		return &models.JobResult{
			Success: true,
			Output: models.JSONMap{
				"columns":    columns,
				"rows":       results,
				"rowCount":   len(results),
				"durationMs": duration.Milliseconds(),
			},
			Logs: fmt.Sprintf("Query: %s\nDuration: %v\nRows returned: %d", query, duration, len(results)),
		}, nil
	}
	
	// Execute non-SELECT query
	result, err := db.ExecContext(ctx, query)
	duration := time.Since(start)
	
	if err != nil {
		return &models.JobResult{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("Query failed: %v", err)),
			Logs:         fmt.Sprintf("Query: %s\nDuration: %v\nError: %v", query, duration, err),
		}, nil
	}
	
	rowsAffected, _ := result.RowsAffected()
	
	return &models.JobResult{
		Success: true,
		Output: models.JSONMap{
			"rowsAffected": rowsAffected,
			"durationMs":   duration.Milliseconds(),
		},
		Logs: fmt.Sprintf("Query: %s\nDuration: %v\nRows affected: %d", query, duration, rowsAffected),
	}, nil
}

// executeShell executes a shell command job. Honours the UI's two modes:
//   mode="command" (default) — single line in `command`
//   mode="script"            — multi-line in `script`
// And the UI knobs failOnError + captureStderr.
func (e *JobExecutor) executeShell(ctx context.Context, task *worker.Task) (*models.JobResult, error) {
	config := task.Config

	mode := strFromConfig(config, "mode", "command")
	command := strFromConfig(config, "command", "")
	if mode == "script" || command == "" {
		if s := strFromConfig(config, "script", ""); s != "" {
			command = s
		}
	}
	if command == "" {
		return nil, fmt.Errorf("command is required for shell jobs (provide `command` or `script`)")
	}

	shell := strFromConfig(config, "shell", "sh")
	// Whitelist of allowed shells — never let a flow choose an arbitrary
	// path. /bin/sh is always available; bash is in the runtime image.
	switch shell {
	case "sh", "bash":
		// OK
	default:
		shell = "sh"
	}

	workingDir, _ := config["workingDir"].(string)
	env, _ := config["env"].(map[string]interface{})
	// captureStderr: default true (UI checks `!== false`). When false, we
	// pipe stderr to the process's own stderr so it surfaces in container
	// logs instead of the execution output.
	captureStderr := boolFromConfig(config, "captureStderr", true)
	failOnError := boolFromConfig(config, "failOnError", true)

	// Create command
	cmd := exec.CommandContext(ctx, shell, "-c", command)

	if workingDir != "" {
		cmd.Dir = workingDir
	}
	
	// Set environment variables
	if env != nil {
		for key, value := range env {
			if strValue, ok := value.(string); ok {
				cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", key, strValue))
			}
		}
	}
	
	// Capture output
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	if captureStderr {
		cmd.Stderr = &stderr
	} else {
		cmd.Stderr = os.Stderr
	}

	// Execute
	start := time.Now()
	err := cmd.Run()
	duration := time.Since(start)

	logs := fmt.Sprintf(
		"Command: %s\nDuration: %v\nExit Code: %d\n\nSTDOUT:\n%s\n\nSTDERR:\n%s",
		command, duration, cmd.ProcessState.ExitCode(), stdout.String(), stderr.String(),
	)

	if err != nil && failOnError {
		return &models.JobResult{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("Command failed: %v\nSTDERR: %s", err, stderr.String())),
			Logs:         logs,
		}, nil
	}

	return &models.JobResult{
		Success: true,
		Output: models.JSONMap{
			"exitCode":   cmd.ProcessState.ExitCode(),
			"stdout":     stdout.String(),
			"stderr":     stderr.String(),
			"durationMs": duration.Milliseconds(),
		},
		Logs: logs,
	}, nil
}

// executePython executes a Python script job
func (e *JobExecutor) executePython(ctx context.Context, task *worker.Task) (*models.JobResult, error) {
	config := task.Config

	// Accept `script` (canonical), `code` (flow-editor UI) and `source`.
	// The UI's "file mode" sets `mode: "file"` + `file: <path>` — when
	// requested we read the file from disk, otherwise inline code wins.
	script := firstNonEmpty(
		strFromConfig(config, "script", ""),
		strFromConfig(config, "code", ""),
		strFromConfig(config, "source", ""),
	)
	if script == "" {
		mode := strFromConfig(config, "mode", "")
		if mode == "file" {
			path := strFromConfig(config, "file", "")
			if path == "" {
				return nil, fmt.Errorf("python: 'file' is required when mode=file")
			}
			data, rerr := os.ReadFile(path)
			if rerr != nil {
				return nil, fmt.Errorf("python: cannot read file %q: %w", path, rerr)
			}
			script = string(data)
		}
	}
	if script == "" {
		return nil, fmt.Errorf("script is required for Python jobs (provide `code`, `script`, or mode=file + file)")
	}

	pythonPath, _ := config["pythonPath"].(string)
	if pythonPath == "" {
		pythonPath = "python3"
	}
	failOnStderr := boolFromConfig(config, "failOnStderr", false) || boolFromConfig(config, "fail_on_stderr", false)
	
	// Create command
	cmd := exec.CommandContext(ctx, pythonPath, "-c", script)
	
	// Capture output
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	
	// Execute
	start := time.Now()
	err := cmd.Run()
	duration := time.Since(start)
	
	logs := fmt.Sprintf(
		"Python Script:\n%s\n\nDuration: %v\nExit Code: %d\n\nSTDOUT:\n%s\n\nSTDERR:\n%s",
		script, duration, cmd.ProcessState.ExitCode(), stdout.String(), stderr.String(),
	)
	
	if err != nil {
		return &models.JobResult{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("Python script failed: %v\nSTDERR: %s", err, stderr.String())),
			Logs:         logs,
		}, nil
	}

	// failOnStderr — opt-in: treat any stderr output as a failure even if
	// the process exited 0. Useful when scripts use stderr for warnings.
	if failOnStderr && stderr.Len() > 0 {
		return &models.JobResult{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("Python wrote to stderr (failOnStderr=true): %s", stderr.String())),
			Logs:         logs,
		}, nil
	}

	// Try to parse stdout as JSON
	var output interface{}
	if err := json.Unmarshal(stdout.Bytes(), &output); err != nil {
		output = stdout.String()
	}

	return &models.JobResult{
		Success: true,
		Output: models.JSONMap{
			"output":     output,
			"exitCode":   cmd.ProcessState.ExitCode(),
			"durationMs": duration.Milliseconds(),
		},
		Logs: logs,
	}, nil
}

// executeNodeJS executes a Node.js script job
func (e *JobExecutor) executeNodeJS(ctx context.Context, task *worker.Task) (*models.JobResult, error) {
	config := task.Config

	// Same alias handling as Python: accept `script` (canonical), `code`
	// (UI), `source`, plus mode=file + file=<path>.
	script := firstNonEmpty(
		strFromConfig(config, "script", ""),
		strFromConfig(config, "code", ""),
		strFromConfig(config, "source", ""),
	)
	if script == "" {
		mode := strFromConfig(config, "mode", "")
		if mode == "file" {
			path := firstNonEmpty(
				strFromConfig(config, "file", ""),
				strFromConfig(config, "entryPoint", ""),
			)
			if path == "" {
				return nil, fmt.Errorf("nodejs: 'file' is required when mode=file")
			}
			data, rerr := os.ReadFile(path)
			if rerr != nil {
				return nil, fmt.Errorf("nodejs: cannot read file %q: %w", path, rerr)
			}
			script = string(data)
		}
	}
	if script == "" {
		return nil, fmt.Errorf("script is required for Node.js jobs (provide `code`, `script`, or mode=file + file)")
	}
	failOnStderr := boolFromConfig(config, "failOnStderr", false) || boolFromConfig(config, "fail_on_stderr", false)

	nodePath, _ := config["nodePath"].(string)
	if nodePath == "" {
		nodePath = "node"
	}
	
	// Create command
	cmd := exec.CommandContext(ctx, nodePath, "-e", script)
	
	// Capture output
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	
	// Execute
	start := time.Now()
	err := cmd.Run()
	duration := time.Since(start)
	
	logs := fmt.Sprintf(
		"Node.js Script:\n%s\n\nDuration: %v\nExit Code: %d\n\nSTDOUT:\n%s\n\nSTDERR:\n%s",
		script, duration, cmd.ProcessState.ExitCode(), stdout.String(), stderr.String(),
	)
	
	if err != nil {
		return &models.JobResult{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("Node.js script failed: %v\nSTDERR: %s", err, stderr.String())),
			Logs:         logs,
		}, nil
	}

	if failOnStderr && stderr.Len() > 0 {
		return &models.JobResult{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("Node.js wrote to stderr (failOnStderr=true): %s", stderr.String())),
			Logs:         logs,
		}, nil
	}

	// Try to parse stdout as JSON
	var output interface{}
	if err := json.Unmarshal(stdout.Bytes(), &output); err != nil {
		output = stdout.String()
	}
	
	return &models.JobResult{
		Success: true,
		Output: models.JSONMap{
			"output":     output,
			"exitCode":   cmd.ProcessState.ExitCode(),
			"durationMs": duration.Milliseconds(),
		},
		Logs: logs,
	}, nil
}

// executeSlack executes a Slack notification job
func (e *JobExecutor) executeSlack(ctx context.Context, task *worker.Task) (*models.JobResult, error) {
	config := task.Config
	
	webhookURL, _ := config["webhook_url"].(string)
	if webhookURL == "" {
		return nil, fmt.Errorf("webhook_url is required for Slack jobs")
	}
	
	channel, _ := config["channel"].(string)
	text, _ := config["text"].(string)
	action, _ := config["action"].(string)
	if action == "" {
		action = "send_message"
	}
	
	// Build Slack payload
	payload := map[string]interface{}{
		"text": text,
	}
	
	if channel != "" {
		payload["channel"] = channel
	}
	
	jsonBody, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}
	
	req, err := http.NewRequestWithContext(ctx, "POST", webhookURL, bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	
	req.Header.Set("Content-Type", "application/json")
	
	start := time.Now()
	resp, err := e.httpClient.Do(req)
	duration := time.Since(start)
	
	if err != nil {
		return &models.JobResult{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("Slack request failed: %v", err)),
			Logs:         fmt.Sprintf("Slack %s to %s\nDuration: %v\nError: %v", action, channel, duration, err),
		}, nil
	}
	defer resp.Body.Close()
	
	return &models.JobResult{
		Success: resp.StatusCode == 200,
		Output: models.JSONMap{
			"statusCode": resp.StatusCode,
			"action":     action,
			"channel":    channel,
			"durationMs": duration.Milliseconds(),
		},
		Logs: fmt.Sprintf("Slack %s to %s\nDuration: %v\nStatus: %d", action, channel, duration, resp.StatusCode),
	}, nil
}

// executeEmail executes an email sending job via SMTP.
// SMTP config resolves in this order: job config fields → environment variables.
// Env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_TLS.
func (e *JobExecutor) executeEmail(ctx context.Context, task *worker.Task) (*models.JobResult, error) {
	config := task.Config

	to, _ := config["to"].(string)
	if to == "" {
		return nil, fmt.Errorf("to is required for Email jobs")
	}

	subject, _ := config["subject"].(string)
	body, _ := config["body"].(string)
	isHTML, _ := config["html"].(bool)

	// Resolve SMTP settings: config first, env fallback
	smtpHost := strFromConfig(config, "smtpHost", os.Getenv("SMTP_HOST"))
	smtpPort := intFromConfig(config, "smtpPort", envInt("SMTP_PORT", 587))
	smtpUser := strFromConfig(config, "smtpUser", os.Getenv("SMTP_USER"))
	smtpPass := strFromConfig(config, "smtpPassword", os.Getenv("SMTP_PASSWORD"))
	fromAddr := strFromConfig(config, "from", firstNonEmpty(os.Getenv("SMTP_FROM"), smtpUser))
	useTLS := boolFromConfig(config, "tls", envBool("SMTP_TLS", true))

	contentType := "text/plain; charset=UTF-8"
	if isHTML {
		contentType = "text/html; charset=UTF-8"
	}

	start := time.Now()

	if smtpHost == "" {
		duration := time.Since(start)
		return &models.JobResult{
			Success:      false,
			ErrorMessage: strPtr("SMTP not configured: set SMTP_HOST or provide smtpHost in job config"),
			Logs:         fmt.Sprintf("Email to: %s\nSubject: %s\nDuration: %v\nNo SMTP host configured", to, subject, duration),
		}, nil
	}

	if fromAddr == "" {
		fromAddr = "no-reply@runloop.local"
	}

	// Build RFC 822 message
	toList := splitRecipients(to)
	headers := map[string]string{
		"From":         fromAddr,
		"To":           strings.Join(toList, ", "),
		"Subject":      subject,
		"MIME-Version": "1.0",
		"Content-Type": contentType,
		"Date":         time.Now().UTC().Format(time.RFC1123Z),
	}
	var msg bytes.Buffer
	for k, v := range headers {
		msg.WriteString(fmt.Sprintf("%s: %s\r\n", k, v))
	}
	msg.WriteString("\r\n")
	msg.WriteString(body)

	addr := fmt.Sprintf("%s:%d", smtpHost, smtpPort)

	// Run SMTP send in a goroutine so ctx cancellation is respected
	type sendResult struct{ err error }
	done := make(chan sendResult, 1)
	go func() {
		done <- sendResult{err: sendSMTP(addr, smtpHost, smtpUser, smtpPass, fromAddr, toList, msg.Bytes(), useTLS)}
	}()

	select {
	case <-ctx.Done():
		return &models.JobResult{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("Email send cancelled: %v", ctx.Err())),
			Logs:         fmt.Sprintf("Email to: %s\nSubject: %s\nHost: %s\nContext cancelled", to, subject, addr),
		}, nil
	case res := <-done:
		duration := time.Since(start)
		if res.err != nil {
			return &models.JobResult{
				Success:      false,
				ErrorMessage: strPtr(fmt.Sprintf("Email send failed: %v", res.err)),
				Logs:         fmt.Sprintf("Email to: %s\nSubject: %s\nHost: %s\nDuration: %v\nError: %v", to, subject, addr, duration, res.err),
			}, nil
		}
		return &models.JobResult{
			Success: true,
			Output: models.JSONMap{
				"to":          toList,
				"from":        fromAddr,
				"subject":     subject,
				"contentType": contentType,
				"host":        addr,
				"durationMs":  duration.Milliseconds(),
			},
			Logs: fmt.Sprintf("Email sent\nTo: %s\nFrom: %s\nSubject: %s\nContent-Type: %s\nHost: %s\nDuration: %v", strings.Join(toList, ", "), fromAddr, subject, contentType, addr, duration),
		}, nil
	}
}

// sendSMTP sends an email via SMTP with optional STARTTLS.
func sendSMTP(addr, host, user, pass, from string, to []string, msg []byte, useTLS bool) error {
	client, err := smtp.Dial(addr)
	if err != nil {
		return fmt.Errorf("dial %s: %w", addr, err)
	}
	defer client.Close()

	if useTLS {
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err := client.StartTLS(&tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}); err != nil {
				return fmt.Errorf("starttls: %w", err)
			}
		}
	}

	if user != "" && pass != "" {
		if ok, _ := client.Extension("AUTH"); ok {
			auth := smtp.PlainAuth("", user, pass, host)
			if err := client.Auth(auth); err != nil {
				return fmt.Errorf("auth: %w", err)
			}
		}
	}

	if err := client.Mail(from); err != nil {
		return fmt.Errorf("MAIL FROM: %w", err)
	}
	for _, rcpt := range to {
		if err := client.Rcpt(rcpt); err != nil {
			return fmt.Errorf("RCPT TO %s: %w", rcpt, err)
		}
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("DATA: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		return fmt.Errorf("write body: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("close body: %w", err)
	}
	return client.Quit()
}

// executeDocker runs a container via the local `docker` CLI. The engine host
// must have Docker installed and the daemon running. Removes the container on
// completion unless keepContainer is true.
func (e *JobExecutor) executeDocker(ctx context.Context, task *worker.Task) (*models.JobResult, error) {
	config := task.Config

	image, _ := config["image"].(string)
	if image == "" {
		return nil, fmt.Errorf("image is required for Docker jobs")
	}

	command, _ := config["command"].(string)
	workingDir, _ := config["workingDir"].(string)
	envMap, _ := config["env"].(map[string]interface{})
	keepContainer, _ := config["keepContainer"].(bool)
	pull, _ := config["pull"].(bool)

	args := []string{"run"}
	if !keepContainer {
		args = append(args, "--rm")
	}
	if pull {
		args = append(args, "--pull", "always")
	}
	if workingDir != "" {
		args = append(args, "-w", workingDir)
	}
	for k, v := range envMap {
		if strV, ok := v.(string); ok {
			args = append(args, "-e", fmt.Sprintf("%s=%s", k, strV))
		}
	}
	args = append(args, image)
	if command != "" {
		args = append(args, "sh", "-c", command)
	}

	cmd := exec.CommandContext(ctx, "docker", args...)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	start := time.Now()
	err := cmd.Run()
	duration := time.Since(start)

	exitCode := 0
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}

	logs := fmt.Sprintf(
		"Docker: %s %s\nDuration: %v\nExit Code: %d\n\nSTDOUT:\n%s\n\nSTDERR:\n%s",
		image, command, duration, exitCode, stdout.String(), stderr.String(),
	)

	if err != nil {
		return &models.JobResult{
			Success:      false,
			ErrorMessage: strPtr(fmt.Sprintf("Docker run failed: %v\nSTDERR: %s", err, stderr.String())),
			Logs:         logs,
		}, nil
	}

	return &models.JobResult{
		Success: true,
		Output: models.JSONMap{
			"image":      image,
			"command":    command,
			"exitCode":   exitCode,
			"stdout":     stdout.String(),
			"stderr":     stderr.String(),
			"durationMs": duration.Milliseconds(),
		},
		Logs: logs,
	}, nil
}

// ---------- helpers ----------

func strPtr(s string) *string {
	return &s
}

func strFromConfig(cfg map[string]interface{}, key, fallback string) string {
	if v, ok := cfg[key].(string); ok && v != "" {
		return v
	}
	return fallback
}

func intFromConfig(cfg map[string]interface{}, key string, fallback int) int {
	switch v := cfg[key].(type) {
	case float64:
		return int(v)
	case int:
		return v
	case string:
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func boolFromConfig(cfg map[string]interface{}, key string, fallback bool) bool {
	if v, ok := cfg[key].(bool); ok {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	v := strings.ToLower(os.Getenv(key))
	switch v {
	case "true", "1", "yes":
		return true
	case "false", "0", "no":
		return false
	}
	return fallback
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

func splitRecipients(to string) []string {
	parts := strings.Split(to, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if s := strings.TrimSpace(p); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// Ensure JobExecutor implements worker.Executor interface
var _ worker.Executor = (*JobExecutor)(nil)
