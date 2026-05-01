package main

import (
	"bufio"
	"fmt"
	"net/url"
	"os"
	"strings"
	"syscall"

	"golang.org/x/term"
)

// ---------- auth ----------

func runLogin(cfg *Config, args []string) error {
	if len(args) < 1 {
		return fmt.Errorf("usage: runloop login <email>")
	}
	email := args[0]
	fmt.Print("Password: ")
	pw, err := term.ReadPassword(int(syscall.Stdin))
	fmt.Println()
	if err != nil {
		return err
	}

	var resp struct {
		Token string `json:"token"`
		User  struct {
			ID    string `json:"id"`
			Email string `json:"email"`
		} `json:"user"`
	}
	if err := doRequest(cfg, "POST", "/api/auth/login", map[string]string{
		"email":    email,
		"password": string(pw),
	}, nil, &resp); err != nil {
		return err
	}
	cfg.Token = resp.Token
	cfg.Email = resp.User.Email
	if err := cfg.Save(); err != nil {
		return err
	}
	fmt.Printf("Logged in as %s\n", resp.User.Email)
	return nil
}

func runLogout(cfg *Config) error {
	cfg.Clear()
	if err := cfg.Save(); err != nil {
		return err
	}
	fmt.Println("Logged out.")
	return nil
}

func runUse(cfg *Config, args []string) error {
	if len(args) < 1 {
		return fmt.Errorf("usage: runloop use <project-id>")
	}
	cfg.ProjectID = args[0]
	if err := cfg.Save(); err != nil {
		return err
	}
	fmt.Printf("Default project: %s\n", args[0])
	return nil
}

// ---------- health ----------

func runHealth(cfg *Config) error {
	var resp map[string]any
	// Try both /health (engine proxy) and /api/health paths
	if err := doRequest(cfg, "GET", "/proxy/engine/health", nil, nil, &resp); err != nil {
		return err
	}
	fmt.Println(prettyJSON(resp))
	return nil
}

// ---------- flows ----------

func runFlows(cfg *Config, args []string) error {
	if len(args) < 1 {
		return fmt.Errorf("usage: runloop flows <list|show>")
	}
	switch args[0] {
	case "list":
		q := url.Values{}
		if cfg.ProjectID != "" {
			q.Set("projectId", cfg.ProjectID)
		}
		var resp struct {
			Data []map[string]any `json:"data"`
		}
		if err := doRequest(cfg, "GET", "/api/flows", nil, q, &resp); err != nil {
			return err
		}
		if len(resp.Data) == 0 {
			fmt.Println("(no flows)")
			return nil
		}
		fmt.Printf("%-28s %-24s %-8s %s\n", "ID", "NAME", "TYPE", "STATUS")
		for _, f := range resp.Data {
			fmt.Printf("%-28s %-24s %-8s %s\n", str(f["id"]), str(f["name"]), str(f["type"]), str(f["status"]))
		}
		return nil
	case "show":
		if len(args) < 2 {
			return fmt.Errorf("usage: runloop flows show <flow-id>")
		}
		var resp map[string]any
		if err := doRequest(cfg, "GET", "/api/flows/"+args[1], nil, nil, &resp); err != nil {
			return err
		}
		fmt.Println(prettyJSON(resp))
		return nil
	}
	return fmt.Errorf("unknown subcommand: %s", args[0])
}

// ---------- schedulers ----------

func runSchedulers(cfg *Config, args []string) error {
	if len(args) < 1 {
		return fmt.Errorf("usage: runloop schedulers <list|run>")
	}
	switch args[0] {
	case "list":
		q := url.Values{}
		if cfg.ProjectID != "" {
			q.Set("projectId", cfg.ProjectID)
		}
		var resp struct {
			Data []map[string]any `json:"data"`
		}
		if err := doRequest(cfg, "GET", "/api/schedulers", nil, q, &resp); err != nil {
			return err
		}
		if len(resp.Data) == 0 {
			fmt.Println("(no schedulers)")
			return nil
		}
		fmt.Printf("%-28s %-24s %-14s %-14s %s\n", "ID", "NAME", "TRIGGER", "STATUS", "NEXT_RUN")
		for _, s := range resp.Data {
			fmt.Printf("%-28s %-24s %-14s %-14s %s\n",
				str(s["id"]), str(s["name"]), str(s["triggerType"]), str(s["status"]), str(s["nextRunAt"]))
		}
		return nil
	case "run":
		if len(args) < 2 {
			return fmt.Errorf("usage: runloop schedulers run <scheduler-id>")
		}
		var resp map[string]any
		if err := doRequest(cfg, "POST", "/api/schedulers/"+args[1]+"/trigger", map[string]any{"input": map[string]any{}}, nil, &resp); err != nil {
			return err
		}
		fmt.Println(prettyJSON(resp))
		return nil
	}
	return fmt.Errorf("unknown subcommand: %s", args[0])
}

// ---------- executions ----------

func runExecutions(cfg *Config, args []string) error {
	if len(args) < 1 {
		return fmt.Errorf("usage: runloop executions <list|logs|cancel>")
	}
	switch args[0] {
	case "list":
		q := url.Values{}
		if cfg.ProjectID != "" {
			q.Set("projectId", cfg.ProjectID)
		}
		for _, a := range args[1:] {
			if strings.HasPrefix(a, "--status=") {
				q.Set("status", strings.TrimPrefix(a, "--status="))
			}
			if strings.HasPrefix(a, "--limit=") {
				q.Set("limit", strings.TrimPrefix(a, "--limit="))
			}
		}
		var resp struct {
			Data []map[string]any `json:"data"`
		}
		if err := doRequest(cfg, "GET", "/api/executions", nil, q, &resp); err != nil {
			return err
		}
		if len(resp.Data) == 0 {
			fmt.Println("(no executions)")
			return nil
		}
		fmt.Printf("%-28s %-24s %-10s %-10s %s\n", "ID", "SCHEDULER", "STATUS", "DURATION", "STARTED")
		for _, e := range resp.Data {
			fmt.Printf("%-28s %-24s %-10s %-10v %s\n",
				str(e["id"]), str(e["schedulerName"]), str(e["status"]), e["durationMs"], str(e["startedAt"]))
		}
		return nil
	case "logs":
		if len(args) < 2 {
			return fmt.Errorf("usage: runloop executions logs <execution-id>")
		}
		var resp struct {
			Data map[string]any `json:"data"`
		}
		if err := doRequest(cfg, "GET", "/api/executions/"+args[1], nil, nil, &resp); err != nil {
			return err
		}
		fmt.Println(str(resp.Data["logs"]))
		return nil
	case "cancel":
		if len(args) < 2 {
			return fmt.Errorf("usage: runloop executions cancel <execution-id>")
		}
		var resp map[string]any
		if err := doRequest(cfg, "POST", "/api/executions/"+args[1]+"/cancel", nil, nil, &resp); err != nil {
			return err
		}
		fmt.Println(prettyJSON(resp))
		return nil
	}
	return fmt.Errorf("unknown subcommand: %s", args[0])
}

// ---------- secrets ----------

func runSecrets(cfg *Config, args []string) error {
	if len(args) < 1 {
		return fmt.Errorf("usage: runloop secrets list")
	}
	switch args[0] {
	case "list":
		q := url.Values{}
		if cfg.ProjectID != "" {
			q.Set("projectId", cfg.ProjectID)
		}
		var resp struct {
			Secrets []map[string]any `json:"secrets"`
		}
		if err := doRequest(cfg, "GET", "/api/secrets", nil, q, &resp); err != nil {
			return err
		}
		if len(resp.Secrets) == 0 {
			fmt.Println("(no secrets)")
			return nil
		}
		fmt.Printf("%-24s %-12s %-12s %s\n", "NAME", "CATEGORY", "SCOPE", "LAST_USED")
		for _, s := range resp.Secrets {
			fmt.Printf("%-24s %-12s %-12s %s\n", str(s["name"]), str(s["category"]), str(s["scope"]), str(s["lastUsedAt"]))
		}
		return nil
	}
	return fmt.Errorf("unknown subcommand: %s", args[0])
}

// ---------- helpers ----------

func str(v any) string {
	if v == nil {
		return "-"
	}
	switch x := v.(type) {
	case string:
		if x == "" {
			return "-"
		}
		return x
	default:
		return fmt.Sprintf("%v", x)
	}
}

// readLine reads a trimmed line from stdin (used by a few interactive flows).
func readLine(prompt string) string {
	fmt.Print(prompt)
	r := bufio.NewReader(os.Stdin)
	line, _ := r.ReadString('\n')
	return strings.TrimSpace(line)
}
