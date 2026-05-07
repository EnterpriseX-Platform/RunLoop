# RunLoop benchmark — 2026-05-06T06:42:01Z

Reproducible footprint reading from `scripts/bench.sh`.

| Metric | Value |
|---|---|
| Engine binary (linux/amd64, stripped) | **27.2 MiB** |
| Engine Docker image | **204.4 MiB** |
| Engine RAM (idle, 60s) | 8.52MiB |
| Postgres RAM (idle, 60s) | 38.06MiB |
| **Stack RAM (engine + Postgres, idle)** | **46.6 MiB** |
| Engine cold start (docker run → 200/401) | **0.71s** |

## Methodology

1. `go build -ldflags="-s -w" -trimpath` for linux/amd64.
2. `docker build` from `apps/runloop-engine/Dockerfile`.
3. Spin up Postgres 16-alpine + engine on an isolated docker network.
4. Apply Prisma schema, wait for first `/rl/api/health` response.
5. Sleep 60s, sample `docker stats --no-stream`.
6. Tear down. Numbers are single-run on this hardware.

## Run details

- Hardware: `arm64`
- Host OS: `Darwin 25.2.0`
- Docker: `27.3.1`
- Go: `go1.26.0`
- Commit: `cfbcf14`

## Why the image is bigger than the binary

The Docker image bundles Python, Node.js, and the Docker CLI alongside the
engine binary so the Python / Node.js / Docker / Shell node executors work
out of the box. Without those, those node types would fail at first use
with `executable not found`. If you don't need those runtimes, you can
build a leaner image (`FROM alpine:latest` + binary only ≈ 35 MiB).

## What this is not

- **Throughput** (jobs/sec): not measured here. Run a load test against the
  HTTP node executor or queue producer for that.
- **Web (Next.js) RAM**: excluded — most operators run engine + Postgres,
  the web UI is optional. Add ~75 MiB if you also bring up `runloop-web`.
- **Multi-arch**: only linux/amd64. arm64 binary is ~25 MiB; image overhead
  is similar.

---

# Throughput benchmark — Postgres queue, no-op flow

Reproducible from `scripts/bench-throughput.sh`. Measures how fast the
worker pool drains a Postgres-backed queue when the bound flow does no
real work (Start → End). This is the queue+worker ceiling — real flows
scale down from here in proportion to per-node cost.

## Latest reading on this hardware

| Workers | Jobs | Wall-clock | Throughput |
|---:|---:|---:|---:|
| 20 | 10,000 | 10.19s | **981 jobs/sec** |
| 40 | 10,000 | 6.16s  | **1,622 jobs/sec** |
| 40 | 20,000 | 11.76s | **1,700 jobs/sec** |

The Apple-Silicon laptop saturates around 1.7k jobs/sec at 40 workers
with the default Postgres-backend tunings. Further scaling needs more
workers + Postgres connection pool headroom (`DATABASE_MAX_CONNS`),
or a different backend (Redis Streams, Kafka).

## What this measures

The cost of pulling a row from `job_queue_items` (Postgres
`SELECT … FOR UPDATE SKIP LOCKED`), dispatching it onto a worker
goroutine, walking the flow DAG (two flow-shape nodes that return
instantly), and updating the row to `COMPLETED`. Real flows with HTTP /
DB / Shell / Python / Node / Docker nodes will run slower in proportion
to the work the nodes actually do.

## Methodology

1. Spin up the same isolated stack as the footprint bench.
2. Insert one project, one flow (Start → End), one queue with the
   given concurrency cap.
3. Start the engine — queue manager registers the consumer at boot.
4. Bulk `INSERT … SELECT FROM generate_series(1, N)` — single
   statement, no API path, no per-row latency.
5. Time from the bulk-insert return until
   `count(*) WHERE status = 'COMPLETED'` reaches `N`.
