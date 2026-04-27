# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RunLoop is a job scheduling platform with a hybrid architecture:
- **Next.js 14 web app** (`apps/runloop/`, port 3081) — UI, internal API, Prisma ORM
- **Go engine** (`apps/runloop-engine/`, port 8092) — Scheduling, worker pool, job execution (Fiber + gocron)
- **PostgreSQL 16** — Shared database (dev port 5481)
- **Turborepo** monorepo with npm workspaces

## Build & Development Commands

```bash
# Full setup (install, start DB, push schema, seed)
npm run setup

# Start dev (all apps via Turborepo)
npm run dev

# Build / Lint / Typecheck
npm run build
npm run lint
npm run typecheck

# Database (Prisma, runs inside apps/runloop)
npm run db:start        # Start Postgres Docker container (port 5481)
npm run db:stop
npm run db:push         # Push schema (dev)
npm run db:migrate      # Run migrations (production)
npm run db:generate     # Regenerate Prisma client
npm run db:studio       # Open Prisma Studio
npm run db:seed         # Seed with admin@runloop.io / admin123

# Go engine (manual)
cd apps/runloop-engine && go run main.go
```

No automated tests exist yet. Manual testing with `NEXT_PUBLIC_SKIP_AUTH=true` bypasses auth.

## Architecture

### Request Flow

```
Browser → Next.js (3081/runloop/) → [next.config.js rewrites] → Go Engine (8092/rl/)
```

Next.js serves the UI and handles auth/projects/metrics/secrets via Prisma. Scheduler and execution CRUD is **proxied** to the Go engine — there are no Next.js route handlers for these. The proxy mapping in `next.config.js`:

- `/api/schedulers/*` → `ENGINE_URL/rl/api/schedulers/*`
- `/api/executions/*` → `ENGINE_URL/rl/api/executions/*`
- `/proxy/engine/*` → `ENGINE_URL/rl/*`

### Shared JWT Auth

Both services validate the **same JWT** using `JWT_SECRET`. Next.js issues tokens (login API, `src/lib/auth.ts`), and the Go engine validates them (`internal/middleware/auth.go`). Token is stored in an httpOnly cookie (`token`) and optionally as `Authorization: Bearer`.

### WebSocket

Real-time execution updates: browser connects directly to Go engine at `ws://host/rl/ws/executions/{id}`. The worker pool broadcasts status changes via `internal/websocket/hub.go`.

### Go Engine Internals

- **Scheduler Manager** (`internal/scheduler/manager.go`) — Uses gocron. On startup loads all ACTIVE schedulers from DB. `AddJob` creates cron tasks, `TriggerJob` handles manual runs.
- **Worker Pool** (`internal/worker/pool.go`) — Configurable goroutine count + buffered task channel. Results processed by dedicated goroutine that updates DB and broadcasts WebSocket.
- **Executors** — `internal/executor/executor.go` dispatches by JobType (HTTP, DATABASE, SHELL, PYTHON, NODEJS, SLACK, EMAIL). Email is simulated.
- **FlowExecutor** (`internal/executor/flow_executor.go`) — DAG execution with topological sort, `${{secrets.NAME}}` resolution, `${{nodeID.outputKey}}` variable interpolation, per-node retry with exponential backoff, circuit breakers.
- **Connectors** (`internal/connector/`) — Pluggable integrations: S3, database, Slack, email, GitHub, MongoDB, Redis.
- **All DB queries are raw SQL** (no ORM on the Go side).

### Flow Editor

- `src/components/flow/FlowCanvas.tsx` — React Flow surface (uses `reactflow` v11).
- `src/components/flow/nodes/` — Node components built on shared `BaseNode` with `iconMap`/`colorMap`. Types registered in `nodes/index.ts`.
- `src/components/flow/properties/` — Per-node-type property editors.

### Key Domain Concepts

| Term | Description |
|------|-------------|
| **Task** | Workflow definition using React Flow (DAG of nodes). Defines WHAT to run. |
| **Scheduler** | Execution configuration (cron, trigger type). Defines WHEN/HOW to run. |
| **Execution** | A single run instance with status, logs, output. |

Enums: `JobType` (HTTP/DATABASE/SHELL/PYTHON/NODEJS/DOCKER), `TriggerType` (SCHEDULE/MANUAL/WEBHOOK/API), `ExecutionStatus` (PENDING/RUNNING/SUCCESS/FAILED/CANCELLED/TIMEOUT).

## Code Conventions

### TypeScript / Next.js

- Path aliases: `@/*` → `./src/*` (also `@/components/*`, `@/lib/*`, `@/types/*`, `@/hooks/*`)
- All routes use `basePath: '/runloop'` — every URL is prefixed
- Protected routes under `src/app/(protected)/`, public under `src/app/login/`
- State: `AuthContext` and `ProjectContext` in `src/context/`
- Styling: Tailwind CSS with dark theme (`darkMode: 'class'`), custom palette (`ocean-blue`, `warm-orange`, `dark.*` shades), fonts Inter + JetBrains Mono
- Secrets use AES-256-GCM encryption (`src/lib/encryption.ts`), referenced as `${{secrets.NAME}}`

### Go

- Domain-driven packages under `internal/` (api, config, connector, db, executor, middleware, models, scheduler, webhook, websocket, worker)
- Logging: zerolog (`log.Info()`, `log.Error().Err(err).Msg(...)`)
- Config via env vars, loaded in `internal/config/config.go`
- Base path: `/rl` (configurable via `BASE_PATH`)
- ID generation: timestamp + random string, not UUID

### Prisma Schema

- Located at `apps/runloop/prisma/schema.prisma`
- After schema changes: `npm run db:push` (dev) then `npm run db:generate`
- Update TypeScript types in `src/types/index.ts` to match

## Known Quirks

- **Naming transition**: Codebase is mid-rename from "Scheduler" to "RunLoop". DB/Prisma still uses `Scheduler`, TypeScript types alias `Scheduler` → `RunLoop`, some UI says "RunLoops".
- **WebSocket port**: `useWebSocket.ts` hardcodes port 8081; actual engine runs on 8092.
- **ENGINE_URL default**: `next.config.js` defaults to `http://localhost:8081`; `.env.development` overrides to 8092.
- **Go toolchain**: `go.mod` requires Go ≥ 1.25. `apps/runloop-engine/Dockerfile` must stay on `golang:1.25-alpine` or newer — older base images break `go mod download`.
- **Direct-mode schedulers bypass DLQ**: schedulers without an attached flow run via `jobExecutor`, not `FlowExecutor`, so failures do not produce `DeadLetterQueueEntry` rows. Only flow-attached (DAG/SIMPLE) executions populate the DLQ.
- **Production secrets**: `SECRET_ENCRYPTION_KEY` (64 hex chars) is required in production for both the web and engine deployments. The engine's `internal/secret/store.go` matches Next.js `src/lib/encryption.ts` byte-for-byte (AES-256-GCM, 16-byte IV, 16-byte tag, scrypt fallback in dev).

## Deployment

- **Jenkins**: parameterized pipeline at `apps/runloop/.jenkins/Jenkinsfile.deploy` (params: `NAMESPACE`, `DOMAIN`, `INGRESS_RESOLVE_IP`, `KUBECONFIG_CRED_ID`, `APPLY_MANIFESTS`). Root `Jenkinsfile` fans out to `DEPLOY_TARGETS` with `propagate: false`.
- **Image rollout**: uses `kubectl patch ... --type=strategic` to update both the `migrate` initContainer and the `web` container atomically — never `kubectl set image` (it can't address initContainers by name in this layout).
- **Smoke test**: deliberately soft (`sh(returnStatus: true) ... || true`) — some clusters don't expose Apache on :80 from the build agent, so a probe failure must not fail the deploy.
- See `docs/deployment/COMMERCIAL.md` for the COMMUNITY → COMMERCIAL replication runbook.

## Further Reading

- `README.md` — quick start, Docker deployment.
- `AGENTS.md` — overlapping agent guide; if it conflicts with this file, this file is authoritative (more recently maintained).
- `docs/architecture/OVERVIEW.md`, `docs/development/SETUP.md`, `docs/deployment/`.
