# Architecture Overview

## System Components

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Next.js   │────▶│  Go Engine  │────▶│  PostgreSQL │
│   (Web UI)  │     │ (Scheduler) │     │  (Database) │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Workers   │
                    │ (Job Exec)  │
                    └─────────────┘
```

## Key Concepts

### Task
Workflow definition using React Flow. Defines WHAT to run.

### Schedule
Execution configuration. Defines WHEN and HOW to run.

### Execution
A single run instance of a Task.

## Data Flow

1. User creates Task (workflow) in UI
2. User creates Schedule linked to Task
3. Go Scheduler triggers based on cron expression
4. Flow Executor runs DAG nodes in topological order
5. Results saved to database, broadcast via WebSocket
