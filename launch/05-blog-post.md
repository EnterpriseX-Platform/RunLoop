# Cross-post to dev.to, Medium, Hashnode

Post on day 1, after the launch wave. SEO traffic compounds — this
post will be what new users find via "open source workflow engine"
six months from now.

Suggested title (A/B test these):

* "Why we built RunLoop: open-source workflow engine in Go"
* "Building RunLoop — the gap between cron and Airflow"
* "RunLoop: 23 node types, 4 queue backends, single Go binary"

---

# Why we built RunLoop: an open-source workflow engine in Go

There's a gap in the workflow tool market.

On one end you have **cron** — perfect for "run this script every
6 hours" and useless for anything more. On the other end you have
**Airflow / Temporal / Cadence** — opinionated, code-first frameworks
that need a team to operate. In the middle there's **n8n** — visual,
self-hostable, but Node-based and licensed under "Sustainable Use"
which makes commercial usage murky.

We needed something visual + self-hostable + actually open. We built
RunLoop.

## What RunLoop is

A drag-and-drop workflow engine. You open a React Flow canvas, drop
nodes onto it (HTTP, Database, Shell, Python, Node, Docker, Slack,
Email, Webhook, Loop, Condition, Switch, Transform, Notify, Enqueue,
SubFlow — 23 in total), wire them together, save, schedule on cron
or trigger from a webhook.

The execution engine is Go: a single static binary, ~50 MB image,
sub-second cold start. The web app is Next.js 14. Everything persists
in Postgres 16.

```
┌──────────────┐   drag-drop    ┌──────────────┐   gocron + queue        ┌─────────────┐
│  Flow Editor │ ─────────────▶ │  Scheduler   │ ──────────────────────▶ │ Worker Pool │
│  (React Flow)│                │  + Queues    │                         │ (Goroutines)│
└──────────────┘                └──────────────┘                         └─────┬───────┘
                                                                               │
                                  HTTP · DB · Shell · Python · Node · Docker · Slack · Email · …
```

## Why not n8n / Temporal / Airflow

| | RunLoop | n8n | Temporal | Airflow |
|---|---|---|---|---|
| Drag-and-drop UI | ✅ | ✅ | ❌ | ⚠️ |
| Single binary | ✅ Go | ❌ Node | ❌ Java | ❌ Python |
| Cold start | < 1s | 30s+ | 20s+ | 30-60s |
| Memory baseline | ~80 MB | ~400 MB | ~1 GB | ~2 GB |
| Queue backends | 4 (PG/Rabbit/Kafka/Redis) | Redis only | proprietary | Celery |
| AGPL — actually open | ✅ | ❌ Sustainable Use | MIT | Apache-2 |

We're not trying to replace Airflow at the data-engineering scale —
no Spark/Flink/Hadoop integration, that's not the target audience.
We're trying to be the right tool for: ops automation, webhook
fan-out, internal tools, scheduled API calls, ETL between APIs.

## Five things I'd build differently next time

### 1. Field naming consistency from day one

The flow editor saved node config as camelCase (`webhookUrl`,
`smtpHost`, `dbType`) while the engine connectors read snake_case
(`webhook_url`, `host`, `type`). Every Slack / Email / Database
node created from the UI was silently broken on production —
users would test the flow, get a vague "URL is required" error,
and assume their config was wrong.

The fix was a tiny `pickStr(cfg, "webhook_url", "webhookUrl")`
helper across all connectors. But we should have caught this in
testing — and would have, if we'd had integration tests that
ran the UI's actual JSON output through the engine end-to-end.

Lesson: test your **boundary**, not your unit. Field-name conventions
are an interface and need contract tests.

### 2. Pre-flight validation matters

A real production case: a user's flow called a Mendix microflow that
returned **HTTP 200** with `body.responseStatus = "FAIL"` because
of an unresolved internal template. RunLoop's HTTP node only checked
status code — it reported the run as SUCCESS. The user noticed when
DB rows were missing for some scheduled times.

We added two layers:

```yaml
# 1. Pre-flight: catch unresolved ${{...}} before the HTTP call
node config: { url: "https://api/${{env.MISSING}}/users" }
→ FAIL: "unresolved variable(s): env.MISSING"

# 2. Body-level success check (expression-based)
node config: { successWhen: "body.responseStatus == 'SUCCESS'" }
→ FAIL with descriptive message if upstream's business reply says no
```

Lesson: **HTTP 200 ≠ business success**. Your tool should make it
trivial for users to express the difference.

### 3. Worker pool is just a buffered channel + N goroutines

We started with a more elaborate work-stealing scheduler. It was
faster on paper. In practice, contention on the work-stealing dequeue
was higher than just having a buffered channel and N consumer
goroutines. The simple version is 50 lines and covers 99% of cases.

```go
type Pool struct {
    tasks chan *Task
    wg    sync.WaitGroup
}

func (p *Pool) Start(n int) {
    for i := 0; i < n; i++ {
        p.wg.Add(1)
        go func() {
            defer p.wg.Done()
            for t := range p.tasks {
                p.execute(t)
            }
        }()
    }
}
```

If you're reaching for something fancier, measure first.

### 4. The queue backend abstraction was worth it

Most users will never need anything other than Postgres
(`SELECT … FOR UPDATE SKIP LOCKED` is shockingly good for sub-1k QPS).
But the abstraction wasn't expensive — `Backend` is 5 methods —
and it unlocked customers with existing Kafka or RabbitMQ
infrastructure who didn't want to operate a separate message bus.

```go
type Backend interface {
    Enqueue(ctx, q, req) (jobID string, err error)
    Dequeue(ctx, q, ...) (*Message, error)
    Ack(ctx, q, jobID) error
    Nack(ctx, q, jobID, retryAfter) error
    SendToDLQ(ctx, q, jobID, reason) error
}
```

Lesson: a small interface compounds. We added Kafka 3 weeks after
shipping Postgres + Rabbit — copy-paste-modify, two days.

### 5. Embedded tzdata is worth ~450 KB

If you build on alpine, `time.LoadLocation("Asia/Bangkok")` will
fail because alpine doesn't ship the IANA timezone DB. The validator
on a `timezone` struct tag uses `LoadLocation` under the hood, so
your users get a confusing "Validation failed" trying to save any
non-UTC scheduler.

```go
import (
    _ "time/tzdata"  // ← embed the IANA DB
)
```

We learned this on day 1 from a user reporting a bug. Now it's in
our deployment checklist.

## What we're missing

Honestly:

- **No HA scheduler yet.** Single instance. On the roadmap via
  Postgres advisory locks for leader election.
- **No backfill UI.** Airflow has spoiled us all here.
- **No K8s operator.** Planned for v0.4.
- **The connector library is small.** 23 node types is enough for
  general ops automation but Airflow has 1500. We're prioritizing
  AWS / GCP / Stripe / Twilio next.

If any of those are dealbreakers for you, RunLoop isn't ready yet.
If you mostly need "schedule something, see when it ran, retry
when it fails, view the output," it is.

## Where to start

```bash
git clone https://github.com/EnterpriseX-Platform/RunLoop.git
cd RunLoop
cp .env.example .env
echo "JWT_SECRET=$(openssl rand -hex 48)" >> .env
echo "SECRET_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" >> .env
docker compose up -d
```

UI lands at http://localhost:3081/runloop. Seed script prints an
admin password on first boot — capture it from the logs.

PRs welcome. Star the repo if it saves you a cron job.

**Repo:** https://github.com/EnterpriseX-Platform/RunLoop
**Docs:** /docs in the repo
**License:** AGPL-3.0

---

*Cross-posted to dev.to and Medium. Original on
github.com/EnterpriseX-Platform/RunLoop/discussions.*
