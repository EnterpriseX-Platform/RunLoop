# Hacker News — Show HN

Submit at https://news.ycombinator.com/submit
Best window: Tuesday/Wednesday 09:00–11:00 PT (US business morning)

## Title (≤ 80 chars, sentence case, no emoji)

```
Show HN: RunLoop – Open-source workflow engine in Go (AGPL)
```

## URL

```
https://github.com/EnterpriseX-Platform/RunLoop
```

(Leave Text field blank — HN prefers URL submissions.)

## First comment (post yourself within 30 seconds of submitting)

This is the make-or-break for HN. People skim the first comment more
than the README. Be specific, set expectations, address skepticism
upfront.

```
Hi HN — I built RunLoop because I needed something between cron and
Airflow.

The shape: a Go engine that runs DAGs, plus a Next.js web app with a
React Flow drag-and-drop editor. Single static binary, sub-second cold
start, ~50 MB image. You drop nodes (HTTP, Database, Shell, Python,
Node, Slack, Email, Webhook, Loop, Condition, Switch, Transform,
Notify, Enqueue, SubFlow…) onto a canvas, wire them, save, schedule
on cron or trigger from a webhook. Per-node retries with exponential
backoff, circuit breakers, dead-letter queue.

What I think is interesting:

- Four queue backends behind one Producer/Consumer interface —
  Postgres (default, no extra infra), RabbitMQ, Kafka, Redis Streams.
  Switch with one config field.
- Project-scoped multi-tenancy is first-class. Secrets, env vars,
  queues, channels all isolate per project. Membership-checked at every
  API. Useful for hosting flows for several internal teams.
- Pub/sub channels alongside queues — a NOTIFY node publishes to a
  project-scoped channel; mobile apps and dashboards subscribe over
  WebSocket and get live updates from inside flows.
- Variable substitution covers `${{nodeId.field}}`, `${{input.X}}`,
  `${{env.X}}`, `${{secrets.X}}`, plus `${{NOW}}` / `${{TODAY}}` and
  `${{loop.item}}` inside loop bodies.
- The HTTP node has body-level success checks via expr-lang, so when
  an upstream returns 200 with `body.responseStatus = "FAIL"` you can
  still mark the node failed: `successWhen: "body.status == 'OK'"`.
  That sounds small but it caught a real intermittent bug for us
  where Mendix microflows were silently rejecting inserts.

What it's NOT:

- Not a competitor to Airflow at the data-engineering scale. No Spark
  / Flink / Hadoop integration. Better for ops automation, webhook
  fan-out, internal tools, scheduled API calls, ETL between APIs.
- No HA scheduler yet. Single instance. On the roadmap.
- No backfill UI yet. On the roadmap.

License is AGPL-3.0 — same as Grafana, Mattermost, Plausible. Self-host
freely; if you offer it as a hosted service to others, publish your
modifications. The intent is anti-SaaS-clone, not anti-user.

Repo: https://github.com/EnterpriseX-Platform/RunLoop
Demo GIF: <link to GIF in README>
Live sandbox: <hosted-demo-url>

Happy to answer questions about the engine internals (Fiber + gocron
+ in-memory pub/sub), the queue backend abstraction, or why I picked
React Flow instead of building from scratch.
```

## Notes on engagement

- **Reply to every comment within the first 4 hours** — HN ranks by
  engagement velocity. Even a one-sentence "yes that's right, thanks"
  helps the post stay on the front page.
- **Don't get defensive on negative comments** — say "fair point",
  acknowledge the gap, link to the roadmap line if it's planned.
- **Don't beg for upvotes** anywhere. HN sniffs that out.
- **Don't post on weekends** — front page burn is faster, less reach.
- **If it doesn't fire on first attempt**: HN allows a re-submit
  ~2 weeks later. Don't repost the same exact title; pick a different
  angle (e.g., a comparison post or a feature deep-dive).

## Common HN questions you'll get — pre-canned answers

> "Why not just n8n?"

> "n8n is great for low-volume integration work; we hit performance
> issues running thousands of concurrent webhook fan-outs (n8n queues
> through Redis with their own scheduler). RunLoop's worker pool is
> goroutines + a buffered channel, so 1k QPS sits in ~100 MB RAM in
> our tests. Also AGPL vs n8n's Sustainable Use License — different
> philosophies."

> "Why not Temporal?"

> "Temporal is a workflow framework for code (Go/TS/Python SDKs) — you
> write your workflows as functions. RunLoop is visual + DSL — you
> drag node types. Different audiences. We use both internally."

> "Why AGPL?"

> "Same reasoning Grafana / Mattermost / Plausible used: protect
> against a hyperscaler relabelling our work as their managed service
> without contributing back. End users self-hosting are unaffected."

> "Single point of failure with a single scheduler instance?"

> "Yes today. Mitigations: jobs are idempotent via idempotency keys,
> queue consumers can run on multiple pods (Postgres backend supports
> SKIP LOCKED), only the cron scheduler is single-instance. HA via
> Postgres advisory lock leader-election is on the roadmap."

> "How does this compare to Cadence / Argo Workflows / Prefect?"

> "Cadence and Argo are workflow orchestrators that assume you write
> code/YAML; we provide a UI editor. Prefect is closest in spirit —
> visual UI + Python — but RunLoop is multi-runtime (Python/Node/Shell/
> Docker) and Go-native so the engine is much smaller."
