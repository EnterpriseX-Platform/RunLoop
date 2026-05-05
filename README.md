<div align="center">

# 🔁 RunLoop

**Drag-drop workflow engine — in a 50 MB Go binary.**

Cron schedules · 4 queue backends · multi-runtime code · real-time WebSocket streams. Self-hosted, AGPL, sub-second cold start.

[![CI](https://github.com/EnterpriseX-Platform/RunLoop/actions/workflows/ci.yml/badge.svg)](https://github.com/EnterpriseX-Platform/RunLoop/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/EnterpriseX-Platform/RunLoop?logo=github)](https://github.com/EnterpriseX-Platform/RunLoop/releases)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Go 1.25+](https://img.shields.io/badge/Go-1.25+-00ADD8?logo=go)](https://go.dev/)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-000?logo=next.js)](https://nextjs.org/)
[![Discussions](https://img.shields.io/github/discussions/EnterpriseX-Platform/RunLoop)](https://github.com/EnterpriseX-Platform/RunLoop/discussions)

</div>

---

> **🎬 Demo GIF + screenshots are landing this week** — see [`docs/screenshots/`](./docs/screenshots/) for what's coming.

RunLoop sits between cron and Airflow: visual enough to wire a flow in a
minute, fast enough to run where Node-based workflows can't, opinionated
enough that secrets, queues, and multi-tenancy work out of the box.
**Think n8n's editor with Go's runtime and queues that actually scale.**

```
┌──────────────┐   drag-drop    ┌──────────────┐   gocron + pg/redis/kafka  ┌─────────────┐
│  Flow Editor │ ─────────────▶ │  Scheduler   │ ─────────────────────────▶ │ Worker Pool │
│  (React Flow)│                │  + Queues    │                            │ (Goroutines)│
└──────────────┘                └──────────────┘                            └─────┬───────┘
                                                                                  │
                                                                                  ▼
                                  HTTP · DB · Shell · Python · Node · Docker · Slack · Email · …
```

## Why RunLoop?

The footprint matters more than the feature list. Most workflow engines
either run heavy (Java/Python — minutes to start, gigabytes of RAM under
load) or run light but lack queues and code execution (raw cron, simple
schedulers). RunLoop is the rare middle: drag-drop UI, real queues, real
code, in a binary you can scp to a VPS.

### Footprint

| | RunLoop | n8n | Airflow | Temporal |
|---|:-:|:-:|:-:|:-:|
| Image size | **~50 MB** | ~600 MB | ~1.5 GB | ~400 MB |
| Cold start | **<1 s** | ~5 s | ~30 s | ~10 s |
| RAM @ 1k QPS | **~100 MB** | ~600 MB | n/a | ~400 MB |
| Single static binary | **✅ Go** | ❌ Node | ❌ Python | ❌ Java |

### Capabilities

| | RunLoop | n8n | Temporal | Airflow |
|---|---|---|---|---|
| Drag-and-drop DAG editor | ✅ | ✅ | ❌ (code-first) | ⚠️ (DAG view, code-defined) |
| Visual cron scheduling with timezones | ✅ | ✅ | ⚠️ | ✅ |
| Pluggable queue backends | ✅ Postgres / RabbitMQ / Kafka / Redis | ❌ | proprietary | ⚠️ |
| Real code execution (Python / Node / Shell / Docker) | ✅ | partial | ⚠️ | ✅ |
| AES-256-GCM secret vault baked in | ✅ | ⚠️ | ⚠️ | ⚠️ |
| AGPL-3.0 (anti-SaaS-cloning) | ✅ | Sustainable Use | MIT | Apache-2.0 |

## Features

- **23 built-in node types** — Start/End, Condition, Switch, Loop (for-each / batch / parallel),
  Transform, Merge, Delay, Set Variable, Sub-flow, Log, HTTP, Database (Postgres/MySQL),
  Shell, Python, Node.js, Docker, Slack, Email (SMTP), Webhook (signed outbound),
  Wait Webhook (inbound park), Enqueue (push to a queue), Notify (publish to a channel).
- **Variable substitution everywhere** — `${{nodeId.field}}`, `${{input.X}}`,
  `${{env.X}}`, `${{secrets.X}}`, plus `${{NOW}}` / `${{TODAY}}` and
  `${{loop.item}}` inside loop bodies.
- **Four queue backends** — Postgres (default, requires no extra infra),
  RabbitMQ, Kafka, Redis Streams. Switch with one config field.
- **Real-time execution stream** — WebSocket from the engine straight to the
  browser. See every node tick, retry, and failure as it happens.
- **Project-scoped multi-tenant** — secrets, env vars, queues, channels, and
  flows isolate per project. Membership-checked at every API surface.
- **API-first** — every action available in the UI is also a REST endpoint
  with `rl_*` API keys. CLI included (`apps/runloop-cli`).
- **Dead-letter queue** — failed flow executions persist with replay support.
- **Pub/sub channels** — flows publish via the `Notify` node, mobile apps and
  dashboards subscribe over WebSocket. Project-scoped, ephemeral, non-blocking.

## Quick start

### One-line Docker (recommended)

```bash
git clone https://github.com/EnterpriseX-Platform/RunLoop.git
cd RunLoop
cp .env.example .env

# Generate strong secrets
echo "JWT_SECRET=$(openssl rand -hex 48)"            >> .env
echo "SECRET_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)"     >> .env

docker compose up -d
```

The web UI lands at **<http://localhost:3081/runloop>**. The seed script
prints a generated admin password on first boot — capture it from the logs:

```bash
docker compose logs runloop-web | grep Password
```

### Local development

```bash
git clone https://github.com/EnterpriseX-Platform/RunLoop.git
cd RunLoop
cp .env.example .env       # fill in DB password, secrets
npm install
npm run db:start           # starts Postgres in Docker
npm run db:push            # applies the Prisma schema
npm run db:seed            # creates admin user; prints password once
npm run dev                # starts Next.js (3081) + Go engine (8092)
```

## Architecture at a glance

```
Browser  ──▶  Next.js (web · 3081)  ──▶  Go engine (Fiber + gocron · 8092)
              │                            │
              ▼                            ▼
              Prisma (auth, projects)      Worker pool (goroutines)
              │                            │
              └─────────▶  PostgreSQL  ◀───┘
                          (shared)
```

- **Next.js** owns auth, project CRUD, secrets/env vault, and the React Flow
  editor. It proxies scheduler/execution/queue/channel APIs through to the
  engine — there are no Next.js handlers for those, just rewrites.
- **Go engine** owns scheduling (gocron), the worker pool, every flow node
  executor, queue producers/consumers (Postgres / Rabbit / Kafka / Redis),
  and the WebSocket hub. Single static binary, sub-second cold start.
- **Postgres 16** — single source of truth for projects, flows, schedulers,
  executions, queues, secrets (encrypted), env vars, and DLQ entries.

For deeper dives see [`CLAUDE.md`](./CLAUDE.md) and [`docs/development/SETUP.md`](./docs/development/SETUP.md).

## Use cases we've seen

- **Cron → external API → Slack alert** — three nodes, two minutes.
- **Postgres ETL** — DB query → Transform → DB upsert, on a schedule, with
  a retry policy and a dead-letter queue.
- **Webhook fan-out** — Inbound webhook (`WAIT_WEBHOOK`) parks until your
  partner POSTs. Then a Loop iterates the payload, fans HTTP calls
  out in parallel, merges responses, and writes a row.
- **Async job pipelines** — Web app POSTs to `/api/queues/<name>/jobs`,
  workers process from any of four queue backends, results stream back
  over a Notify channel.

## Security

RunLoop runs user-supplied code (Shell / Python / Node / Docker nodes) and
holds API credentials in its secret vault, so deployment hygiene matters.
See [`SECURITY.md`](./SECURITY.md) for the hardening checklist and how to
report a vulnerability privately.

Highlights:

- **No insecure defaults reach production.** The auth layer hard-fails on
  startup if `JWT_SECRET` is missing/weak/known-default while
  `NODE_ENV=production`. Same for `SKIP_AUTH=true`.
- **Secrets are AES-256-GCM at rest.** `SECRET_ENCRYPTION_KEY` is required
  and shared between web + engine processes byte-for-byte.
- **API keys are SHA-256 hashed** in storage; the plaintext `rl_*` token is
  only ever shown to the user once, at creation.
- **Parameterized SQL everywhere.** No string-concat queries on the engine.

## Documentation

- [`docs/development/SETUP.md`](./docs/development/SETUP.md) — local dev environment
- [`docs/deployment/DEPLOYMENT.md`](./docs/deployment/DEPLOYMENT.md) — Docker / Kubernetes / reverse-proxy patterns
- [`CLAUDE.md`](./CLAUDE.md) — architecture, request flow, conventions, quirks
- API docs are served by the running app at `/runloop/p/<projectId>/docs`

## Contributing

We'd love your help — especially on:

- New node types (gRPC, S3, MongoDB beyond what's there, Stripe, …)
- New queue backends (NATS, SQS)
- Translations of the UI
- More worked examples in `examples/`

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the workflow. Code of Conduct
in [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## License

[AGPL-3.0-or-later](./LICENSE) — same terms as Grafana, Mattermost, Plausible.
You're free to self-host, modify, and redistribute. If you offer RunLoop as
a hosted service to others, you must publish your modifications under the
same license.

## Acknowledgements

Stands on the shoulders of [React Flow](https://reactflow.dev/),
[Fiber](https://gofiber.io/), [gocron](https://github.com/go-co-op/gocron),
[Prisma](https://www.prisma.io/), [zerolog](https://github.com/rs/zerolog),
[robfig/cron](https://github.com/robfig/cron),
[segmentio/kafka-go](https://github.com/segmentio/kafka-go),
[rabbitmq/amqp091-go](https://github.com/rabbitmq/amqp091-go),
[redis/go-redis](https://github.com/redis/go-redis),
and many others.

---

<sub>Built by [EnterpriseX Platform](https://github.com/EnterpriseX-Platform).
Star us if RunLoop saves you a Cron job ⭐</sub>
