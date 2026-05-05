# Example Flows

A growing cookbook of RunLoop patterns. Each example shows the node graph,
the variable wiring, and the rough JSON shape so you can recreate it in
the editor or build it through the API.

> **Importing**: For now, recreate examples by hand in the flow editor.
> A `runloop import flow.json` CLI command is on the roadmap — see
> [`ROADMAP.md`](../ROADMAP.md).

## Index

1. [Cron → API → Slack alert](#1-cron--api--slack-alert)
2. [Postgres ETL with retry](#2-postgres-etl-with-retry)
3. [Webhook fan-out with Loop](#3-webhook-fan-out-with-loop)
4. [Async job pipeline](#4-async-job-pipeline)

---

## 1. Cron → API → Slack alert

The "hello world" of workflow automation. Hits an external API every
hour, alerts Slack if the response says something's wrong.

```
[Start] → [HTTP: GET /status] → [Condition: status != "ok"] → [Slack: post]
                                       │
                                       └── (else) → [End]
```

| Node | Type | Config |
|---|---|---|
| HTTP | `HTTP` | `GET https://api.example.com/status` |
| Condition | `CONDITION` | `${{HTTP.body.status}} != "ok"` |
| Slack | `SLACK` | webhook URL from `${{secrets.SLACK_WEBHOOK}}` |

Schedule: cron `0 * * * *` (every hour).

---

## 2. Postgres ETL with retry

Daily ETL: pull yesterday's rows from a source DB, transform, write to
an analytics DB. With per-node retry + a dead-letter queue.

```
[Start] → [DB: SELECT] → [Transform: map rows] → [DB: INSERT]
```

| Node | Type | Config |
|---|---|---|
| DB select | `DATABASE` | `postgres`, `SELECT ... WHERE created_at > ${{TODAY}}-1d` |
| Transform | `TRANSFORM` | jsonata: `$map(rows, { "date": dt, "amount": amt })` |
| DB insert | `DATABASE` | `postgres`, `INSERT INTO daily ... VALUES ${{rows}}` |

Per-node retry: 3 attempts, exponential backoff. Failed runs land in
the project's DLQ — replayable from the UI.

Schedule: cron `0 2 * * *` (02:00 daily).

---

## 3. Webhook fan-out with Loop

Inbound webhook receives a batch payload. RunLoop iterates the batch
and fans out parallel HTTP calls.

```
[WaitWebhook] → [Loop: for each item] → [HTTP: POST /process] → [Merge] → [DB: INSERT summary]
```

| Node | Type | Config |
|---|---|---|
| WaitWebhook | `WAIT_WEBHOOK` | parks until `POST /rl/api/webhooks/wait/{correlationId}` |
| Loop | `LOOP` | iterate `${{WaitWebhook.body.items}}` in parallel, batch=10 |
| HTTP | `HTTP` | `POST https://partner.com/process` body `${{loop.item}}` |
| Merge | `MERGE` | strategy: `array` |
| DB insert | `DATABASE` | summary row with `${{Merge.output}}` |

Trigger: `MANUAL` or `WEBHOOK` (no cron).

---

## 4. Async job pipeline

Web app `POST`s to a queue. RunLoop consumers pick up the job, process,
and notify a channel that the dashboard subscribes to over WebSocket.

```
[your web app] ──POST─▶ /api/queues/jobs/jobs ──┐
                                                 ▼
                                        [Enqueue → process flow]
                                                 │
                                                 ▼
                                        [HTTP / DB / whatever]
                                                 │
                                                 ▼
                                        [Notify: channel "job-done"]
                                                 │
                                                 ▼
                                        [your dashboard subscribes via WS]
```

The queue backend is configurable per project — Postgres (default,
no extra infra), RabbitMQ, Kafka, or Redis Streams. Switch with one
config field; flow definition is unchanged.

Trigger: `QUEUE` (RunLoop's worker pool consumes from the queue).

---

## Contributing more examples

Got a pattern you find yourself reaching for? Open a PR adding it here.
A good example shows:

- The node graph (ASCII or screenshot)
- The wiring (which `${{...}}` variables go where)
- The trigger (cron schedule, webhook, queue, manual)
- One thing it teaches that the other examples don't
