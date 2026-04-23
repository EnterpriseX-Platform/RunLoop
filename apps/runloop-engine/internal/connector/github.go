package connector

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// GitHubConnector implements GitHub API operations
type GitHubConnector struct {
	token      string
	baseURL    string
	owner      string
	repo       string
	client     *http.Client
}

// NewGitHubConnector creates a new GitHub connector
func NewGitHubConnector() *GitHubConnector {
	return &GitHubConnector{
		baseURL: "https://api.github.com",
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// Metadata returns connector metadata
func (g *GitHubConnector) Metadata() ConnectorMetadata {
	return ConnectorMetadata{
		Type:        TypeGitHub,
		Name:        "GitHub",
		Description: "Interact with GitHub repositories and workflows",
		Category:    CategoryDevOps,
		Icon:        "github",
		Version:     "1.0.0",
		ConfigSchema: ConfigSchema{
			Fields: []ConfigField{
				{
					Name:        "token",
					Type:        "string",
					Label:       "Personal Access Token",
					Description: "GitHub personal access token",
					Required:    true,
					Secret:      true,
				},
				{
					Name:        "owner",
					Type:        "string",
					Label:       "Default Owner",
					Description: "Default repository owner/organization",
					Required:    false,
				},
				{
					Name:        "repo",
					Type:        "string",
					Label:       "Default Repository",
					Description: "Default repository name",
					Required:    false,
				},
				{
					Name:        "base_url",
					Type:        "string",
					Label:       "Base URL",
					Description: "GitHub API base URL (for GitHub Enterprise)",
					Required:    false,
				},
			},
		},
		SupportsActions: true,
	}
}

// ValidateConfig validates the configuration
func (g *GitHubConnector) ValidateConfig(cfg map[string]interface{}) error {
	if val, ok := cfg["token"].(string); !ok || val == "" {
		return fmt.Errorf("token is required")
	}
	return nil
}

// Initialize initializes the connector
func (g *GitHubConnector) Initialize(ctx context.Context, cfg map[string]interface{}) error {
	if err := g.ValidateConfig(cfg); err != nil {
		return err
	}

	g.token = cfg["token"].(string)
	
	if owner, ok := cfg["owner"].(string); ok {
		g.owner = owner
	}
	if repo, ok := cfg["repo"].(string); ok {
		g.repo = repo
	}
	if baseURL, ok := cfg["base_url"].(string); ok && baseURL != "" {
		g.baseURL = baseURL
	}

	return nil
}

// HealthCheck checks if the connector is healthy
func (g *GitHubConnector) HealthCheck(ctx context.Context) error {
	if g.token == "" {
		return fmt.Errorf("not initialized")
	}
	
	// Try to get authenticated user
	_, err := g.request(ctx, "GET", "/user", nil)
	return err
}

// Close closes the connector
func (g *GitHubConnector) Close() error {
	return nil
}

// GetActions returns available actions
func (g *GitHubConnector) GetActions() []ActionDefinition {
	return []ActionDefinition{
		{
			Name:        "trigger_workflow",
			Label:       "Trigger Workflow",
			Description: "Trigger a GitHub Actions workflow",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "owner",
						Type:        "string",
						Label:       "Owner",
						Description: "Repository owner (uses default if not specified)",
						Required:    false,
					},
					{
						Name:        "repo",
						Type:        "string",
						Label:       "Repository",
						Description: "Repository name",
						Required:    false,
					},
					{
						Name:        "workflow_id",
						Type:        "string",
						Label:       "Workflow ID",
						Description: "Workflow ID or filename (e.g., main.yml)",
						Required:    true,
					},
					{
						Name:        "ref",
						Type:        "string",
						Label:       "Branch/Tag",
						Description: "Git ref (branch or tag name)",
						Required:    true,
					},
					{
						Name:        "inputs",
						Type:        "string",
						Label:       "Inputs (JSON)",
						Description: "Workflow inputs as JSON object",
						Required:    false,
					},
				},
			},
		},
		{
			Name:        "create_pull_request",
			Label:       "Create Pull Request",
			Description: "Create a new pull request",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "owner",
						Type:        "string",
						Label:       "Owner",
						Required:    false,
					},
					{
						Name:        "repo",
						Type:        "string",
						Label:       "Repository",
						Required:    false,
					},
					{
						Name:        "title",
						Type:        "string",
						Label:       "Title",
						Required:    true,
					},
					{
						Name:        "body",
						Type:        "string",
						Label:       "Body",
						Description: "Pull request description (supports Markdown)",
						Required:    false,
					},
					{
						Name:        "head",
						Type:        "string",
						Label:       "Head Branch",
						Description: "Branch with changes",
						Required:    true,
					},
					{
						Name:        "base",
						Type:        "string",
						Label:       "Base Branch",
						Description: "Branch to merge into (default: main)",
						Required:    false,
					},
					{
						Name:        "draft",
						Type:        "boolean",
						Label:       "Draft PR",
						Description: "Create as draft pull request",
						Required:    false,
					},
				},
			},
		},
		{
			Name:        "merge_pull_request",
			Label:       "Merge Pull Request",
			Description: "Merge an existing pull request",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "owner",
						Type:        "string",
						Label:       "Owner",
						Required:    false,
					},
					{
						Name:        "repo",
						Type:        "string",
						Label:       "Repository",
						Required:    false,
					},
					{
						Name:        "pull_number",
						Type:        "number",
						Label:       "PR Number",
						Required:    true,
					},
					{
						Name:        "commit_title",
						Type:        "string",
						Label:       "Commit Title",
						Required:    false,
					},
					{
						Name:        "commit_message",
						Type:        "string",
						Label:       "Commit Message",
						Required:    false,
					},
					{
						Name:        "merge_method",
						Type:        "select",
						Label:       "Merge Method",
						Description: "How to merge the PR",
						Required:    false,
						Options:     []string{"merge", "squash", "rebase"},
					},
				},
			},
		},
		{
			Name:        "create_issue",
			Label:       "Create Issue",
			Description: "Create a new issue",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "owner",
						Type:        "string",
						Label:       "Owner",
						Required:    false,
					},
					{
						Name:        "repo",
						Type:        "string",
						Label:       "Repository",
						Required:    false,
					},
					{
						Name:        "title",
						Type:        "string",
						Label:       "Title",
						Required:    true,
					},
					{
						Name:        "body",
						Type:        "string",
						Label:       "Body",
						Description: "Issue description (supports Markdown)",
						Required:    false,
					},
					{
						Name:        "labels",
						Type:        "string",
						Label:       "Labels",
						Description: "Comma-separated list of labels",
						Required:    false,
					},
					{
						Name:        "assignees",
						Type:        "string",
						Label:       "Assignees",
						Description: "Comma-separated list of usernames",
						Required:    false,
					},
				},
			},
		},
		{
			Name:        "list_workflow_runs",
			Label:       "List Workflow Runs",
			Description: "Get recent workflow runs",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "owner",
						Type:        "string",
						Label:       "Owner",
						Required:    false,
					},
					{
						Name:        "repo",
						Type:        "string",
						Label:       "Repository",
						Required:    false,
					},
					{
						Name:        "workflow_id",
						Type:        "string",
						Label:       "Workflow ID",
						Description: "Filter by specific workflow",
						Required:    false,
					},
					{
						Name:        "status",
						Type:        "select",
						Label:       "Status",
						Description: "Filter by status",
						Required:    false,
						Options:     []string{"queued", "in_progress", "completed", "waiting"},
					},
					{
						Name:        "limit",
						Type:        "number",
						Label:       "Limit",
						Description: "Maximum number of runs to return",
						Required:    false,
					},
				},
			},
		},
		{
			Name:        "get_file_contents",
			Label:       "Get File Contents",
			Description: "Read a file from the repository",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "owner",
						Type:        "string",
						Label:       "Owner",
						Required:    false,
					},
					{
						Name:        "repo",
						Type:        "string",
						Label:       "Repository",
						Required:    false,
					},
					{
						Name:        "path",
						Type:        "string",
						Label:       "File Path",
						Description: "Path to file in repository",
						Required:    true,
					},
					{
						Name:        "ref",
						Type:        "string",
						Label:       "Ref",
						Description: "Branch, tag, or commit SHA",
						Required:    false,
					},
				},
			},
		},
	}
}

// ExecuteAction executes an action
func (g *GitHubConnector) ExecuteAction(ctx context.Context, action string, params map[string]interface{}) (*ActionResult, error) {
	switch action {
	case "trigger_workflow":
		return g.triggerWorkflow(ctx, params)
	case "create_pull_request":
		return g.createPullRequest(ctx, params)
	case "merge_pull_request":
		return g.mergePullRequest(ctx, params)
	case "create_issue":
		return g.createIssue(ctx, params)
	case "list_workflow_runs":
		return g.listWorkflowRuns(ctx, params)
	case "get_file_contents":
		return g.getFileContents(ctx, params)
	default:
		return nil, fmt.Errorf("unknown action: %s", action)
	}
}

func (g *GitHubConnector) triggerWorkflow(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	owner := g.getOwner(params)
	repo := g.getRepo(params)
	workflowID := params["workflow_id"].(string)
	ref := params["ref"].(string)
	
	body := map[string]interface{}{
		"ref": ref,
	}
	
	if inputsStr, ok := params["inputs"].(string); ok && inputsStr != "" {
		var inputs map[string]interface{}
		if err := json.Unmarshal([]byte(inputsStr), &inputs); err == nil {
			body["inputs"] = inputs
		}
	}
	
	path := fmt.Sprintf("/repos/%s/%s/actions/workflows/%s/dispatches", owner, repo, workflowID)
	
	_, err := g.request(ctx, "POST", path, body)
	if err != nil {
		return nil, err
	}
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"triggered": true,
			"workflow":  workflowID,
			"ref":       ref,
		},
	}, nil
}

func (g *GitHubConnector) createPullRequest(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	owner := g.getOwner(params)
	repo := g.getRepo(params)
	
	body := map[string]interface{}{
		"title": params["title"].(string),
		"head":  params["head"].(string),
	}
	
	if desc, ok := params["body"].(string); ok {
		body["body"] = desc
	}
	if base, ok := params["base"].(string); ok && base != "" {
		body["base"] = base
	} else {
		body["base"] = "main"
	}
	if draft, ok := params["draft"].(bool); ok {
		body["draft"] = draft
	}
	
	path := fmt.Sprintf("/repos/%s/%s/pulls", owner, repo)
	
	resp, err := g.request(ctx, "POST", path, body)
	if err != nil {
		return nil, err
	}
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"number": resp["number"],
			"url":    resp["html_url"],
			"state":  resp["state"],
		},
	}, nil
}

func (g *GitHubConnector) mergePullRequest(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	owner := g.getOwner(params)
	repo := g.getRepo(params)
	pullNumber := int(params["pull_number"].(float64))
	
	body := map[string]interface{}{}
	
	if title, ok := params["commit_title"].(string); ok && title != "" {
		body["commit_title"] = title
	}
	if msg, ok := params["commit_message"].(string); ok && msg != "" {
		body["commit_message"] = msg
	}
	if method, ok := params["merge_method"].(string); ok && method != "" {
		body["merge_method"] = method
	}
	
	path := fmt.Sprintf("/repos/%s/%s/pulls/%d/merge", owner, repo, pullNumber)
	
	_, err := g.request(ctx, "PUT", path, body)
	if err != nil {
		return nil, err
	}
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"merged": true,
			"pr":     pullNumber,
		},
	}, nil
}

func (g *GitHubConnector) createIssue(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	owner := g.getOwner(params)
	repo := g.getRepo(params)
	
	body := map[string]interface{}{
		"title": params["title"].(string),
	}
	
	if desc, ok := params["body"].(string); ok {
		body["body"] = desc
	}
	if labels, ok := params["labels"].(string); ok && labels != "" {
		body["labels"] = splitComma(labels)
	}
	if assignees, ok := params["assignees"].(string); ok && assignees != "" {
		body["assignees"] = splitComma(assignees)
	}
	
	path := fmt.Sprintf("/repos/%s/%s/issues", owner, repo)
	
	resp, err := g.request(ctx, "POST", path, body)
	if err != nil {
		return nil, err
	}
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"number": resp["number"],
			"url":    resp["html_url"],
			"state":  resp["state"],
		},
	}, nil
}

func (g *GitHubConnector) listWorkflowRuns(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	owner := g.getOwner(params)
	repo := g.getRepo(params)
	
	query := ""
	if workflowID, ok := params["workflow_id"].(string); ok && workflowID != "" {
		query = fmt.Sprintf("?workflow_id=%s", workflowID)
	}
	if status, ok := params["status"].(string); ok && status != "" {
		if query == "" {
			query = "?"
		} else {
			query += "&"
		}
		query += fmt.Sprintf("status=%s", status)
	}
	
	path := fmt.Sprintf("/repos/%s/%s/actions/runs%s", owner, repo, query)
	
	resp, err := g.request(ctx, "GET", path, nil)
	if err != nil {
		return nil, err
	}
	
	workflowRuns := resp["workflow_runs"].([]interface{})
	
	// Limit results
	if limit, ok := params["limit"].(float64); ok && limit > 0 {
		if int(limit) < len(workflowRuns) {
			workflowRuns = workflowRuns[:int(limit)]
		}
	}
	
	runsJSON, _ := json.Marshal(workflowRuns)
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"runs":       string(runsJSON),
			"total":      resp["total_count"],
			"returned":   len(workflowRuns),
		},
	}, nil
}

func (g *GitHubConnector) getFileContents(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	owner := g.getOwner(params)
	repo := g.getRepo(params)
	path := params["path"].(string)
	
	apiPath := fmt.Sprintf("/repos/%s/%s/contents/%s", owner, repo, path)
	
	if ref, ok := params["ref"].(string); ok && ref != "" {
		apiPath += "?ref=" + ref
	}
	
	resp, err := g.request(ctx, "GET", apiPath, nil)
	if err != nil {
		return nil, err
	}
	
	content := resp["content"].(string)
	// GitHub returns base64 encoded content
	decoded, _ := base64.StdEncoding.DecodeString(content)
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"name":     resp["name"],
			"path":     resp["path"],
			"sha":      resp["sha"],
			"size":     resp["size"],
			"content":  string(decoded),
			"encoding": resp["encoding"],
		},
	}, nil
}

// Helper methods

func (g *GitHubConnector) request(ctx context.Context, method, path string, body interface{}) (map[string]interface{}, error) {
	var bodyReader io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(jsonBody)
	}
	
	url := g.baseURL + path
	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return nil, err
	}
	
	req.Header.Set("Authorization", "Bearer "+g.token)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	
	resp, err := g.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("GitHub API error: %s - %s", resp.Status, string(respBody))
	}
	
	// For 204 No Content
	if resp.StatusCode == 204 {
		return map[string]interface{}{}, nil
	}
	
	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}
	
	return result, nil
}

func (g *GitHubConnector) getOwner(params map[string]interface{}) string {
	if owner, ok := params["owner"].(string); ok && owner != "" {
		return owner
	}
	return g.owner
}

func (g *GitHubConnector) getRepo(params map[string]interface{}) string {
	if repo, ok := params["repo"].(string); ok && repo != "" {
		return repo
	}
	return g.repo
}

func splitComma(s string) []string {
	parts := []string{}
	for _, p := range strings.Split(s, ",") {
		parts = append(parts, strings.TrimSpace(p))
	}
	return parts
}
