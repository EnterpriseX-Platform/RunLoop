# Reddit r/selfhosted post

Submit at https://reddit.com/r/selfhosted

Post 2-3 hours after the HN submission. r/selfhosted users are very
receptive to docker-compose snippets, comparison tables, and
"runs on a Pi" claims if true.

## Title

```
[Release] RunLoop — self-hosted workflow engine. Drag-and-drop DAGs, 4 queue backends, AGPL
```

## Body (Markdown)

```markdown
Hi r/selfhosted — open-sourced today after using it internally for
a few months.

## What it does

Visual workflow editor (think n8n but with first-class queues). You
drag nodes — HTTP, Postgres/MySQL, Shell, Python, Node, Docker,
Slack, Email, Webhook (HMAC-signed), Loop, Condition, Switch — wire
them, run on a cron or trigger from a webhook.

23 built-in node types. Variable substitution everywhere
(`${{secrets.X}}`, `${{nodeId.field}}`, `${{input.X}}`). AES-256-GCM
secret vault baked in.

## Stack

* Go engine (Fiber + gocron) — single static binary, ~50MB image
* Next.js 14 web (React Flow editor)
* PostgreSQL 16 — single source of truth
* Optional: RabbitMQ / Kafka / Redis Streams as queue backends

## Why it might be interesting for r/selfhosted

* `docker compose up` and you're done. Runs fine on a Pi 4.
* No Vault, no Redis required by default — just Postgres.
* Project-scoped multi-tenancy if you host for friends/family/team.
* Drag/drop UI without paying n8n cloud or self-hosting their setup.
* AGPL — actually open, no "Sustainable Use" or "Business Source"
  license games.
* Memory footprint: ~80 MB resident with the default 10-worker pool.

## Quick start

    git clone https://github.com/EnterpriseX-Platform/RunLoop.git
    cd RunLoop
    cp .env.example .env
    echo "JWT_SECRET=$(openssl rand -hex 48)" >> .env
    echo "SECRET_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" >> .env
    docker compose up -d

UI: http://localhost:3081/runloop

The seed script prints an admin password on first boot — capture
it from `docker compose logs runloop-web | grep Password`.

## Comparison

|                   | RunLoop     | n8n               | Temporal     | Airflow   |
|-------------------|-------------|-------------------|--------------|-----------|
| Drag-and-drop UI  | ✅          | ✅               | ❌ (code)    | ⚠️         |
| Single binary     | ✅ (Go)     | ❌ Node           | ❌ Java      | ❌ Python |
| Cold start        | < 1s        | 30s+              | 20s+         | 30-60s    |
| Memory baseline   | ~80MB       | ~400MB            | ~1GB         | ~2GB      |
| Queue backends    | 4 pluggable | Redis (built-in)  | proprietary  | Celery    |
| Secret vault      | ✅ AES-GCM  | ⚠️                | ⚠️            | ⚠️         |
| License           | AGPL-3.0    | Sustainable Use   | MIT          | Apache-2  |

## What's not there yet

* No HA scheduler (single instance for now)
* No backfill UI
* No K8s operator (planned for v0.3)
* No big-data integrations (Spark/Flink) — not the target audience

## Roadmap

* v0.2 — community feedback round
* v0.3 — HA scheduler via Postgres advisory locks
* v0.4 — Backfill UI, K8s Job operator

Roadmap: https://github.com/EnterpriseX-Platform/RunLoop/blob/main/ROADMAP.md
Repo: https://github.com/EnterpriseX-Platform/RunLoop
Demo: <link>

Happy to answer questions or take feature requests.
```

## Common r/selfhosted comment patterns + replies

> "How does this compare to Huginn / Activepieces / Windmill?"

> "Huginn is older, Ruby-based, more agent-style than DAG. Activepieces
> is closer (n8n-style UI, MIT) but TypeScript stack and no built-in
> queue backends. Windmill is the most overlapping — they target
> data/ops automation too — Python-first vs our Go-first. RunLoop
> picks Go for the single-binary footprint and adds the queue-backend
> abstraction."

> "Where do flows persist? Backups?"

> "Everything (flows, schedulers, executions, secrets, env vars, DLQ)
> in Postgres. `pg_dump` covers everything. Secrets are AES-256-GCM
> at rest using SECRET_ENCRYPTION_KEY (must match across web + engine
> deployments)."

> "Resource usage?"

> "Idle: ~80 MB resident, ~0.1% CPU. Under load (1k jobs/min HTTP
> calls): ~150 MB resident, scales linearly with WORKER_COUNT env var."

> "Auth integration? LDAP/OIDC?"

> "Today: local user/password + JWT cookies, plus rl_* API keys for
> machine-to-machine. OIDC is on the roadmap; happy to take a PR."
```
