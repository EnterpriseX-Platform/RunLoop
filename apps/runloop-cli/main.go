// Package main is the entrypoint for the `runloop` CLI.
//
// Usage:
//
//	runloop login <email>                       # prompts for password, stores JWT in ~/.runloop/config
//	runloop use <project-id>                    # set the default project for subsequent commands
//	runloop flows list                          # list flows in the current project
//	runloop flows show <flow-id>                # print a flow as JSON
//	runloop schedulers list                     # list schedulers
//	runloop schedulers run <scheduler-id>       # manually trigger a scheduler
//	runloop executions list [--status=FAILED]   # list executions
//	runloop executions logs <execution-id>      # print logs
//	runloop executions cancel <execution-id>    # cancel a running execution
//	runloop secrets list                        # list secrets (without values)
//	runloop health                              # ping the engine
//
// Auth can also be provided via the RUNLOOP_API_KEY env var (an API key
// generated from the UI under Settings → API Keys).
package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}
	cmd := os.Args[1]
	args := os.Args[2:]

	cfg, err := LoadConfig()
	if err != nil {
		// A missing config is fine — most commands just need URL + token
		cfg = &Config{BaseURL: defaultBaseURL()}
	}

	switch cmd {
	case "help", "-h", "--help":
		printUsage()
	case "login":
		if err := runLogin(cfg, args); err != nil {
			fail(err)
		}
	case "logout":
		if err := runLogout(cfg); err != nil {
			fail(err)
		}
	case "use":
		if err := runUse(cfg, args); err != nil {
			fail(err)
		}
	case "health":
		if err := runHealth(cfg); err != nil {
			fail(err)
		}
	case "flows":
		if err := runFlows(cfg, args); err != nil {
			fail(err)
		}
	case "schedulers":
		if err := runSchedulers(cfg, args); err != nil {
			fail(err)
		}
	case "executions":
		if err := runExecutions(cfg, args); err != nil {
			fail(err)
		}
	case "secrets":
		if err := runSecrets(cfg, args); err != nil {
			fail(err)
		}
	case "version":
		fmt.Println("runloop-cli v0.1.0")
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n\n", cmd)
		printUsage()
		os.Exit(1)
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "Error:", err)
	os.Exit(1)
}

func printUsage() {
	fmt.Println(`runloop - command-line client for RunLoop scheduler

Usage:
  runloop <command> [options]

Commands:
  login <email>                   Authenticate with email + password
  logout                          Remove stored credentials
  use <project-id>                Set default project
  health                          Ping the engine
  flows list                      List flows
  flows show <flow-id>            Print a flow as JSON
  schedulers list                 List schedulers
  schedulers run <scheduler-id>   Trigger a scheduler manually
  executions list [--status=X]    List executions (optionally by status)
  executions logs <execution-id>  Print execution logs
  executions cancel <exec-id>     Cancel a running execution
  secrets list                    List secret names (values never shown)
  version                         Print CLI version
  help                            This help

Environment:
  RUNLOOP_URL         Base URL of RunLoop API  (default: http://localhost:3081/runloop)
  RUNLOOP_API_KEY     API key (overrides stored JWT)
  RUNLOOP_PROJECT     Project id (overrides stored default)

Config is stored at ~/.runloop/config (JSON).`)
}
