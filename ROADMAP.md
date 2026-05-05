# Roadmap

A living document. Items get added when the community asks for them
loudly enough; items move when we ship them. Open an issue or
discussion to nudge priorities.

## v0.2 — Reaction round (next 4-6 weeks)

The first public release will surface things we missed. v0.2 is
"address the obvious feedback":

- [ ] Fix every bug filed in the first 30 days
- [ ] OIDC / OAuth login (most-requested per discussion thread on launch)
- [ ] AWS S3 connector — first-class node, not just a HTTP wrapper
- [ ] Stripe connector — webhook receiver + REST node
- [ ] Slack: thread replies + interactive blocks
- [ ] Better DLQ UI — bulk actions, filter by reason, root-cause grouping
- [ ] Audit log retention policy + UI
- [ ] Translate the UI: full English, Thai, Japanese (community PRs welcome)
- [ ] Public demo sandbox at `demo.runloop.dev` (resets every 24h)

## v0.3 — High availability (Q3)

The single-instance scheduler is the biggest production gap.

- [ ] **Scheduler HA via Postgres advisory locks** — leader election,
      hot-standby. Multiple engine pods, one fires the cron, all pull
      from the queue.
- [ ] **Backfill UI** — pick a date range, replay schedules retroactively.
      The `BackfillRunner` exists internally; this is wiring it to the UI.
- [ ] **Distributed worker model** — separate `runloop-worker` deployment.
      Engine queues, workers pull, scheduler-only-pod stays light.
- [ ] **OpenAPI 3.1 spec** — auto-generate Go / TypeScript / Python
      client SDKs.
- [ ] **Prometheus `/metrics` endpoint** — engine + queue stats.
- [ ] **Grafana dashboard JSON** in `/dashboards/grafana.json`.

## v0.4 — Sandboxing (Q4)

User-supplied code in Shell / Python / Node / Docker nodes runs
in-process today. That's fine for trusted-team deployments and
dangerous for multi-tenant SaaS use.

- [ ] **Kubernetes Job operator** — each Shell/Python/Node node
      runs in an ephemeral pod with no host filesystem access.
- [ ] **Resource quotas per project** — CPU / memory / concurrency caps.
- [ ] **Network policies** — outbound allowlist per project.
- [ ] **Audit trail for code-execution nodes** — full script + stdin
      captured, stored in a separate retention bucket.

## v0.5 — Distribution (Q1 next year)

- [ ] **Plugin marketplace UI** — registry + install/uninstall flow
      for community-contributed connectors.
- [ ] **gRPC node** — common request, deserves a dedicated node.
- [ ] **MongoDB / DynamoDB / BigQuery** first-class connectors.
- [ ] **Spark / Flink** integration via spark-submit / Flink REST.
- [ ] **Workflow versioning + rollback UI** — schema is there, UX
      isn't built.

## Forever-on-the-table (no commitment, but tracking)

- Anomaly detection on execution durations
- ML-driven retry strategy (predict transient vs permanent failure)
- Time-travel debugging — replay a flow with mocked external calls
- Workflow simulator — see what would run without actually running it
- Native iOS / Android app for mobile DLQ review
- LLM-assisted flow generation from natural language

## What we're NOT doing

- **Becoming Airflow.** No Spark/Hadoop integration. We're for ops
  + integration workflows, not big-data pipelines.
- **Becoming Temporal.** No SDK-first model. RunLoop is visual-first.
- **Hosted SaaS competing with our own users.** AGPL prevents this
  by design. If we ever offer hosted RunLoop, the engine stays at
  feature parity with self-hosted.
- **Multi-region active-active by ourselves.** When you need that
  level of HA, run RunLoop per region with separate Postgres clusters.

## How priorities are set

In rough order:

1. **Bugs that cause data loss or security risk.** Fixed regardless.
2. **Items with > 5 thumbs-up on the matching issue.** That's our signal.
3. **Items aligned with our use cases.** We use RunLoop ourselves.
4. **PRs that ship working code.** Beats every other priority.

Want to influence direction? Open a discussion at
https://github.com/EnterpriseX-Platform/RunLoop/discussions
with a use case. We read all of them.
