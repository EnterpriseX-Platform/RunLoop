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
