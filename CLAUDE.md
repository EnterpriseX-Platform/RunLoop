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
npm run db:seed         # Seeds an admin user; password is auto-generated and printed once
                        #   override via SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD env vars

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
- `/api/queues/*`, `/api/channels/*`, `/api/dlq/*` → engine
- `/proxy/engine/*` → `ENGINE_URL/rl/*`

Native Next.js routes (no proxy): `/api/secrets`, `/api/env-vars`, `/api/api-keys`, `/api/ai/chat`, `/api/auth/*`, `/api/projects/*`.

### Shared Auth — JWT + API keys

Both services accept two token types in `Authorization: Bearer`:
- **JWT** signed with `JWT_SECRET` (issued by Next.js login). Stored as httpOnly cookie `token`.
- **API key** prefixed `rl_` — looked up by `sha256(token)` in the `ApiKey` table. The Next.js path lives in `src/lib/auth.ts` (uses static `import crypto from 'crypto'` — dynamic `await import()` doesn't survive webpack); the engine path is in `internal/middleware/auth.go`. Both resolve to a `userId` + `projectId`.

### WebSocket

Real-time execution updates: browser connects directly to Go engine at `ws://host/rl/ws/executions/{id}`. The worker pool broadcasts status changes via `internal/websocket/hub.go`.

### Go Engine Internals

- **Scheduler Manager** (`internal/scheduler/manager.go`) — Uses gocron. On startup loads all ACTIVE schedulers from DB. `AddJob` creates cron tasks, `TriggerJob` handles manual runs.
- **Worker Pool** (`internal/worker/pool.go`) — Configurable goroutine count + buffered task channel. Results processed by dedicated goroutine that updates DB and broadcasts WebSocket.
- **Executors** — `internal/executor/executor.go` dispatches by JobType (HTTP, DATABASE, SHELL, PYTHON, NODEJS, DOCKER, SLACK, EMAIL). All are real: HTTP via `net/http`, DB via `lib/pq`/`go-sql-driver`, runtimes from the Docker image, SLACK via webhook HTTP, EMAIL via `net/smtp` (`SMTP_HOST` env or per-node `smtpHost`).
- **FlowExecutor** (`internal/executor/flow_executor.go`) — DAG execution with topological sort, per-node retry, circuit breakers. Seeds `flowCtx.Variables["input"]` from `task.Config["input"]` (or `payload`, or whole config). Pre-loads project env vars into `flowCtx.Variables["env"]`. Built-in dynamic vars: `NOW`, `TODAY`, `TIMESTAMP`. Variable syntax: `${{input.X}}`, `${{env.X}}`, `${{secrets.X}}`, `${{nodeId.field}}`, `${{loop.item}}`.
- **Connectors** (`internal/connector/`) — Pluggable integrations: S3, database, Slack, email, GitHub, MongoDB, Redis. DB connector normalizes type aliases (`postgres`/`postgresql`/`pg`, `mysql`/`mariadb`).
- **Notify hub** (`internal/notify/`) — In-memory project-scoped pub/sub for Channels. WS at `/rl/ws/channel/:name?projectId=`, REST publish at `/rl/api/channels/:name/publish`. Ephemeral; per-subscriber 64-msg buffer; non-blocking publish.
- **All DB queries are raw SQL** (no ORM on the Go side).

### Flow Editor

- `src/components/flow/FlowCanvas.tsx` — React Flow surface (uses `reactflow` v11).
- `src/components/flow/nodes/` — 23 node types built on shared `BaseNode` with `iconMap`/`colorMap`. Adding a node = component in `nodes/`, register in `nodes/index.ts`, properties editor in `properties/`, and (if the engine should execute it) a case in `internal/executor/flow_executor.go`.
- `src/components/flow/properties/` — Per-node-type property editors.
- `src/components/Combobox.tsx` — In-house searchable dropdown (no third-party lib). Used everywhere instead of native `<select>`.

### URL pattern

All project-scoped pages live under `/p/[projectId]/*` (settings, secrets, env, integrations, plugins, docs, dlq, queues, channels, etc.). The legacy paths `/settings`, `/secrets`, `/docs/api`, `/dead-letter-queue` are client-side redirect stubs that route to the equivalent `/p/<currentProjectId>/*` page.

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
- Secrets use AES-256-GCM encryption (`src/lib/encryption.ts`), referenced as `${{secrets.NAME}}`. Env Vars (`env_vars` table) are plaintext, separate from secrets, referenced as `${{env.NAME}}`. Both name regex: `^[A-Z][A-Z0-9_]*$` — uppercase, no hyphens.
- AI assistant proxy at `src/app/api/ai/chat/route.ts` dispatches to Claude/OpenAI/Kimi based on `CLAUDE_DEFAULT_PROVIDER` (a project secret). Active provider is chosen at Settings → Integrations, never per-chat.

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
- **ENGINE_URL**: defaults to `http://localhost:8092` everywhere; override via env in non-local deployments. The WebSocket hook (`useWebSocket.ts`) defaults to the page's own host; for split dev (web + engine on different hosts) set `NEXT_PUBLIC_ENGINE_WS_HOST`.
- **Go toolchain**: `go.mod` requires Go ≥ 1.25. `apps/runloop-engine/Dockerfile` must stay on `golang:1.25-alpine` or newer — older base images break `go mod download`.
- **Direct-mode schedulers bypass DLQ**: schedulers without an attached flow run via `jobExecutor`, not `FlowExecutor`, so failures do not produce `DeadLetterQueueEntry` rows. Only flow-attached (DAG/SIMPLE) executions populate the DLQ.
- **Production secrets**: `SECRET_ENCRYPTION_KEY` (64 hex chars) is required in production for both the web and engine deployments. The engine's `internal/secret/store.go` matches Next.js `src/lib/encryption.ts` byte-for-byte (AES-256-GCM, 16-byte IV, 16-byte tag, scrypt fallback in dev).
- **Timezone DB**: engine `main.go` blank-imports `_ "time/tzdata"` (~450KB) so IANA names like `Asia/Bangkok` validate without OS tzdata — the alpine base image has none. Don't remove it.
- **Cron validator quirk**: the `cron` validator tag rejects `*/N` syntax. Use `0/N` (e.g. `0 0/6 * * *` not `0 */6 * * *`).
- **Queue execution lookup**: GET `/api/executions/<id>` returns 404 for queue-triggered executions (`<jobId>-<attempt>` format). They show up in the list endpoint but the by-id route only indexes scheduler runs. Filter the list by `schedulerId=queue:<name>` instead.
- **Apache WebSocket**: production cluster's k8s Apache `community-http-config` ConfigMap must enable `mod_proxy_wstunnel` and a `RewriteCond %{HTTP:Upgrade} websocket [NC]` + `RewriteRule ... [P,L]` block, otherwise WS upgrades 1006 at the edge. ConfigMap subPath mounts don't auto-reload — rolling-restart the deployment after changes. See `docs/deployment/DEPLOYMENT.md`.

## Deployment

- **Jenkins**: parameterized pipeline at `apps/runloop/.jenkins/Jenkinsfile.deploy` (params: `NAMESPACE`, `DOMAIN`, `INGRESS_RESOLVE_IP`, `KUBECONFIG_CRED_ID`, `APPLY_MANIFESTS`). Root `Jenkinsfile` has `triggers { pollSCM('H/5 * * * *') }` and fans out to `DEPLOY_TARGETS` with `propagate: false`. Manual trigger via API: `curl -u <jenkins-user>:<token> -X POST https://<your-jenkins-host>/job/runloop/build`.
- **Image rollout**: uses `kubectl patch ... --type=strategic` to update both the `migrate` initContainer and the `web` container atomically — never `kubectl set image` (it can't address initContainers by name in this layout).
- **Smoke test**: deliberately soft (`sh(returnStatus: true) ... || true`) — some clusters don't expose Apache on :80 from the build agent, so a probe failure must not fail the deploy.
- See `docs/deployment/COMMERCIAL.md` for the COMMUNITY → COMMERCIAL replication runbook.

## Further Reading

- `README.md` — quick start, Docker deployment.
- `AGENTS.md` — overlapping agent guide; if it conflicts with this file, this file is authoritative (more recently maintained).
- `docs/architecture/OVERVIEW.md`, `docs/development/SETUP.md`, `docs/deployment/`.
