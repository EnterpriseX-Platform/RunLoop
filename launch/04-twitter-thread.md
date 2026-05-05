# Twitter / X launch thread

Post the day of HN launch, around 11:00 PT (after HN, before Reddit
r/selfhosted). Lead with the demo video — Twitter conversion correlates
strongly with first-tweet media.

Each tweet should fit in ~250 chars (leaves room for retweets).

---

## Tweet 1 (with 60-sec demo video)

```
We just open-sourced RunLoop — a workflow engine I built because
cron got brittle and Airflow was too heavy.

Drag-and-drop DAGs · Go engine · 4 queue backends · AGPL-3.0 ·
self-host in 3 minutes.

[60-sec demo video — drag node → wire → run → see output stream]

🔗 https://github.com/EnterpriseX-Platform/RunLoop
```

## Tweet 2 (architecture screenshot)

```
The pitch in one diagram: React Flow editor → Go engine (Fiber +
gocron + worker pool) → Postgres.

Single static binary. ~50 MB image. Sub-second cold start.

[architecture diagram screenshot]
```

## Tweet 3 (comparison table)

```
Why another one?

[comparison table image: RunLoop vs n8n vs Temporal vs Airflow]

RunLoop sits in the gap: lighter than Airflow, more robust than
n8n, more visual than Temporal. AGPL keeps it actually open.
```

## Tweet 4 (queue backends)

```
Four queue backends behind one interface — Postgres (default, no
extra infra), RabbitMQ, Kafka, Redis Streams.

Switch with one config field. We've used all four in anger.

[diagram: same flow, 4 different backend pills]
```

## Tweet 5 (live execution stream)

```
Every flow run streams over WebSocket. Watch retries happen, see
DLQ entries appear, debug live.

[GIF: execution detail page with live updates]
```

## Tweet 6 (secrets + multi-tenancy)

```
AES-256-GCM secret vault baked in — `${{secrets.NAME}}` in any
node config. No Vault required.

Project-scoped multi-tenancy first-class. Secrets, queues, flows
all isolate per project.
```

## Tweet 7 (real bug story — relatable)

```
A real bug I hit while building this: HTTP node returned 200, body
said `responseStatus: "FAIL"`, no DB row got inserted. Engine
reported SUCCESS.

Now node config supports `successWhen: "body.status == 'OK'"` —
expression engine catches business-level failures upfront. 1
config line, 4 days of confusion saved.
```

## Tweet 8 (call to action)

```
Roadmap: scheduler HA · backfill UI · K8s pod operator · gRPC
node · Stripe / Twilio / Notion connectors.

PRs welcome. Star us if it saves you a cron job ⭐

🔗 https://github.com/EnterpriseX-Platform/RunLoop
```

---

## Hashtags / mentions

Use sparingly — Twitter throttles posts that look like spam.

* In tweet 1 only: `#golang #opensource #selfhosted`
* No @mentions of dev influencers — rude and ineffective.
* OK to tag the framework you build on once: `@reactflow`

## Re-engagement

Pin the thread to the @runloop account profile if you have one.
Quote-retweet your own tweet 1 day later with the highest-engagement
reply ("Someone asked: …").

## Anti-patterns

* Don't post the thread again in 48 hours. Looks desperate.
* Don't auto-DM new followers thanking them. Looks bot.
* Don't ask "any feedback?" — ask a specific question:
  "What's your current cron / workflow tool?"
