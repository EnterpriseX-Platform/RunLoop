# Reddit r/golang post

Submit at https://reddit.com/r/golang

r/golang is highly skeptical of "ecosystem" / wrapper posts and very
receptive to engine internals, performance numbers, library choices.
Lead with the technical content, not the product.

## Title

```
RunLoop: parallel DAG executor in Go with 4 pluggable queue backends, 23 node types
```

## Body

```markdown
Open-sourced today. Sharing some engine internals that might be
interesting if you've thought about building a DAG/workflow runner.

## The shape

A workflow is a DAG of nodes (HTTP, Database, Shell, Python, Node,
Docker, Slack, Email, Webhook, Loop, Condition, Switch, Transform,
Notify, Enqueue, SubFlow, …). The engine takes a `FlowConfig` (nodes
+ edges) and runs it.

Stack:
* Fiber v2 for HTTP
* gocron v2 for scheduling
* lib/pq + jackc/pgx for Postgres
* zerolog for logging
* expr-lang/expr for inline expressions
* segmentio/kafka-go, rabbitmq/amqp091-go, redis/go-redis for
  alternative queue backends

## Parallel DAG dispatch

The flow executor does topological enqueueing — each node knows its
incoming edge count, gets pushed to a `ready` channel when all edges
have fired, and a goroutine pool picks up work. Edges have conditions
(`ON_SUCCESS`, `ON_FAILURE`, `ON_COMPLETE`, or for SWITCH nodes a
case label). Skipped nodes propagate down the graph as "no edge fired."

```
finalize := func(nid string, succeeded, skipped bool) {
    isSwitch := graph.Nodes[nid].Type == JobTypeSwitch
    selectedCase := ...
    for _, edge := range graph.Edges[nid] {
        fires := false
        if isSwitch {
            fires = (selectedCase != "" && edge.Condition == selectedCase)
                 || (selectedCase == "" && edge.Condition == "default")
        } else {
            fires = edgePasses(edge, succeeded, skipped)
        }
        ...
    }
}
```

Per-node retries with exponential backoff are wrapped around the
dispatch — circuit breaker per node type per project.

## Queue backend abstraction

```go
type Backend interface {
    Enqueue(ctx context.Context, q *QueueDef, req EnqueueRequest) (jobID string, err error)
    Dequeue(ctx context.Context, q *QueueDef, ...) (*Message, error)
    Ack(ctx context.Context, q *QueueDef, jobID string) error
    Nack(ctx context.Context, q *QueueDef, jobID string, retryAfter time.Duration) error
    SendToDLQ(ctx context.Context, q *QueueDef, jobID string, reason string) error
}
```

Four implementations:
* PostgresBackend — `SELECT … FOR UPDATE SKIP LOCKED`
* RabbitBackend — main queue + DLX for retries
* KafkaBackend — topic + consumer group
* RedisBackend — Streams + consumer groups

Same Producer/Consumer surface in front. Switching backends is a
config field on the queue row, not a code change.

## Idempotency

Postgres backend uses a UNIQUE(queue_name, idempotency_key) constraint
inside the same INSERT — atomic. Other backends use a shared `dedupe`
table. Lost-race detection returns the existing job ID.

## Variable substitution

`${{...}}` placeholders resolved before each node executes. The
substitution walks the entire `JSONMap` so URLs, headers, body
strings, and nested config values all get expanded. Secrets are
resolved last (after node-output references) so a secret can't
accidentally leak through to a downstream `${{nodeId.output}}`.

A pre-flight check after substitution catches leftover `${{...}}`
that didn't resolve and fails the node up front instead of shipping
literal template text downstream.

## tzdata gotcha

`time/tzdata` blank import to embed the IANA TZ DB into the binary.
Without it, `time.LoadLocation("Asia/Bangkok")` fails on alpine-based
images. ~450 KB binary cost; worth it.

```go
import (
    _ "time/tzdata"  // ← needed for non-UTC schedulers on alpine
)
```

## Numbers

* Idle: ~80 MB RSS, < 1s cold start
* 20 jobs concurrency=5: 3.5s wall (vs 6s serial budget) — confirms
  the worker pool actually parallelizes
* 5 sibling DELAY(1000ms) in a flow: 1.27s wall (vs 5s serial)

Tested on a 2-core VM with PG backend. Linearly scales with
WORKER_COUNT until disk IOPS becomes the bottleneck.

## Tests

* 18 connector tests covering camelCase / snake_case alias handling
  for HTTP/Database/Slack/Email — caught a real production bug where
  the UI editor saved `webhookUrl` while the engine looked for
  `webhook_url`. Lesson: always test your config-key surface.
* 8 executor tests for evalCondition, edgePasses, isFlowShapeNode.
* 5 scheduler tests for the attached-flow → FlowExecutor routing.

Repo: github.com/EnterpriseX-Platform/RunLoop
License: AGPL-3.0

Happy to answer engine-internals questions or take PRs.
```

## Common r/golang comment patterns

> "Why Fiber over net/http?"

> "Inherited from earlier prototypes. Net/http would be fine. Fiber's
> middleware ecosystem (limiter, recover, cors) saved a few hundred
> lines of plumbing. No strong opinion either way."

> "Why expr-lang and not Otto / Goja?"

> "expr-lang is sandboxed by design (no I/O, no fs), CompileEnv typing,
> faster than running JavaScript engines. It's just for boolean
> expressions and JSON shaping in TRANSFORM nodes — full JS would be
> overkill and a security pain."

> "How are goroutine leaks handled?"

> "Worker pool has a buffered task channel + N goroutines. Pool.Stop()
> closes the channel, workers drain. Per-node execution uses
> ctx.WithTimeout, so a hung HTTP node stops the goroutine deterministically."

> "Why 4 queue backends if Postgres SKIP LOCKED is enough for most?"

> "Honestly, for most users it is. The other backends exist because
> we have customers with existing Kafka clusters who want flows to
> consume from there directly, and customers using RabbitMQ for
> non-RunLoop work who want one operational target."
```
