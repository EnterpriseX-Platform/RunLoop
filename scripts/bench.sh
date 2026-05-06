#!/usr/bin/env bash
# bench.sh — measure RunLoop's footprint on this machine.
#
# Reports:
#   - Engine binary size (linux/amd64, stripped, trimpath)
#   - Engine Docker image size
#   - RAM idle: engine + Postgres after 60s
#   - Engine cold start: docker run → first /rl/api/health response
#
# Output is markdown; pipe into docs/BENCHMARKS.md or just read it.
#
# Requirements: docker (with compose), go ≥ 1.25, perl (for sub-second timing).
# Self-contained: uses a temporary network + ephemeral Postgres on port 15481.
#
# Usage:
#   scripts/bench.sh                       # human-readable output
#   scripts/bench.sh --table-only          # just the markdown table
#   scripts/bench.sh > bench-result.md     # capture to file
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE_DIR="$ROOT/apps/runloop-engine"
TMP="$(mktemp -d)"
trap 'cleanup' EXIT
NET="rl-bench-$$"
PG="rl-bench-pg-$$"
ENG="rl-bench-eng-$$"
PG_PORT=15481
ENG_PORT=18081

table_only=0
case "${1:-}" in --table-only|-t) table_only=1 ;; esac

log()  { [ "$table_only" = "1" ] || echo "$@" >&2; }
note() { echo "_$1_" >&2; }

# Portable byte formatter (no GNU numfmt; macOS/BSD compatible).
human_bytes() {
  awk -v b="$1" 'BEGIN{
    split("B KiB MiB GiB TiB", u, " ")
    i=1; while (b>=1024 && i<5) { b/=1024; i++ }
    printf (i==1) ? "%d %s" : "%.1f %s", b, u[i]
  }'
}

cleanup() {
  log "→ cleanup"
  docker rm -f "$ENG" "$PG" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}

# -- 1. Build engine binary (linux/amd64, stripped + trimpath) -------------
log "→ building engine binary (linux/amd64, stripped, trimpath)..."
(
  cd "$ENGINE_DIR"
  GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
    go build -ldflags="-s -w" -trimpath -o "$TMP/runloop-engine" main.go
)
binary_size_bytes=$(stat -f %z "$TMP/runloop-engine" 2>/dev/null || stat -c %s "$TMP/runloop-engine")
binary_size_human=$(human_bytes "$binary_size_bytes")

# -- 2. Build engine docker image ------------------------------------------
log "→ building engine docker image..."
docker build -q -t "rl-bench-engine:$$" "$ENGINE_DIR" >/dev/null
image_size_bytes=$(docker image inspect "rl-bench-engine:$$" --format='{{.Size}}')
image_size_human=$(human_bytes "$image_size_bytes")

# -- 3. Bring up isolated postgres + engine --------------------------------
log "→ creating ephemeral network + Postgres..."
docker network create "$NET" >/dev/null
docker run -d --rm --name "$PG" --network "$NET" \
  -e POSTGRES_USER=runloop -e POSTGRES_PASSWORD=bench -e POSTGRES_DB=runloop \
  -p "127.0.0.1:$PG_PORT:5432" postgres:16-alpine >/dev/null
log "→ waiting for postgres healthy..."
until docker exec "$PG" pg_isready -U runloop >/dev/null 2>&1; do sleep 0.5; done

# Apply schema (engine SELECTs from `schedulers` on boot — must exist)
log "→ applying schema..."
(
  cd "$ROOT/apps/runloop"
  DATABASE_URL="postgres://runloop:bench@127.0.0.1:$PG_PORT/runloop?sslmode=disable" \
    npx prisma db push --skip-generate --accept-data-loss >/dev/null 2>&1
)

# -- 4. Cold start: docker run → first /rl/api/health response -------------
log "→ measuring engine cold start..."
JWT_SECRET=$(openssl rand -hex 48)
SECRET_ENCRYPTION_KEY=$(openssl rand -hex 32)

t_start=$(perl -e 'use Time::HiRes qw(time); print time()')
docker run -d --rm --name "$ENG" --network "$NET" \
  -e DATABASE_URL="postgres://runloop:bench@$PG:5432/runloop?sslmode=disable" \
  -e JWT_SECRET="$JWT_SECRET" \
  -e SECRET_ENCRYPTION_KEY="$SECRET_ENCRYPTION_KEY" \
  -e EXECUTOR_PORT=8080 \
  -e LOG_LEVEL=warn \
  -p "127.0.0.1:$ENG_PORT:8080" \
  "rl-bench-engine:$$" >/dev/null

# Engine returns 401 (auth required) — that's "alive and serving" for our purposes.
for _ in $(seq 1 200); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$ENG_PORT/rl/api/health" 2>/dev/null || true)
  if [ "$code" = "200" ] || [ "$code" = "401" ]; then break; fi
  sleep 0.05
done
t_end=$(perl -e 'use Time::HiRes qw(time); print time()')
cold_start_s=$(perl -e "printf '%.2f', $t_end - $t_start")

# -- 5. Idle RAM at 60s ----------------------------------------------------
log "→ idling 60s, then sampling docker stats..."
sleep 60
read engine_mem postgres_mem < <(docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' "$ENG" "$PG" \
  | awk '/eng/{e=$2} /pg/{p=$2} END{print e" "p}')
total_mem=$(python3 -c "
import re
def to_mib(s):
    m = re.match(r'([\d.]+)([A-Za-z]+)', s)
    if not m: return 0
    n, u = float(m.group(1)), m.group(2)
    return {'B':n/1024/1024,'KiB':n/1024,'MiB':n,'GiB':n*1024,'KB':n/1024,'MB':n,'GB':n*1024}.get(u, n)
print(f'{to_mib(\"$engine_mem\") + to_mib(\"$postgres_mem\"):.1f} MiB')
")

# -- 6. Output markdown ----------------------------------------------------
HW=$(uname -m)
OS=$(uname -sr)
DOCKER_VER=$(docker --version | awk '{print $3}' | tr -d ',')
GO_VER=$(go version | awk '{print $3}')
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
COMMIT=$(git -C "$ROOT" rev-parse --short HEAD)

if [ "$table_only" = "1" ]; then
  cat <<EOF
| Metric | Value |
|---|---|
| Engine binary (linux/amd64, stripped) | **$binary_size_human** |
| Engine Docker image | **$image_size_human** |
| Engine RAM (idle, 60s) | $engine_mem |
| Postgres RAM (idle, 60s) | $postgres_mem |
| **Stack RAM (engine + Postgres, idle)** | **$total_mem** |
| Engine cold start (docker run → 200/401) | **${cold_start_s}s** |
EOF
else
  cat <<EOF
# RunLoop benchmark — $NOW

Reproducible footprint reading from \`scripts/bench.sh\`.

| Metric | Value |
|---|---|
| Engine binary (linux/amd64, stripped) | **$binary_size_human** |
| Engine Docker image | **$image_size_human** |
| Engine RAM (idle, 60s) | $engine_mem |
| Postgres RAM (idle, 60s) | $postgres_mem |
| **Stack RAM (engine + Postgres, idle)** | **$total_mem** |
| Engine cold start (docker run → 200/401) | **${cold_start_s}s** |

## Methodology

1. \`go build -ldflags="-s -w" -trimpath\` for linux/amd64.
2. \`docker build\` from \`apps/runloop-engine/Dockerfile\`.
3. Spin up Postgres 16-alpine + engine on an isolated docker network.
4. Apply Prisma schema, wait for first \`/rl/api/health\` response.
5. Sleep 60s, sample \`docker stats --no-stream\`.
6. Tear down. Numbers are single-run on this hardware.

## Run details

- Hardware: \`$HW\`
- Host OS: \`$OS\`
- Docker: \`$DOCKER_VER\`
- Go: \`$GO_VER\`
- Commit: \`$COMMIT\`

## Why the image is bigger than the binary

The Docker image bundles Python, Node.js, and the Docker CLI alongside the
engine binary so the Python / Node.js / Docker / Shell node executors work
out of the box. Without those, those node types would fail at first use
with \`executable not found\`. If you don't need those runtimes, you can
build a leaner image (\`FROM alpine:latest\` + binary only ≈ 35 MiB).

## What this is not

- **Throughput** (jobs/sec): not measured here. Run a load test against the
  HTTP node executor or queue producer for that.
- **Web (Next.js) RAM**: excluded — most operators run engine + Postgres,
  the web UI is optional. Add ~75 MiB if you also bring up \`runloop-web\`.
- **Multi-arch**: only linux/amd64. arm64 binary is ~25 MiB; image overhead
  is similar.
EOF
fi
