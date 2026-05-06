#!/usr/bin/env bash
# bench-throughput.sh — measure how fast the worker pool drains a Postgres
# queue.
#
# Workload: a no-op flow (Start → End) bound to a Postgres-backed queue.
# We pre-load N PENDING items, start the engine, and time how long until
# all N items are COMPLETED. Reports jobs/sec.
#
# This isolates the queue + worker overhead from per-node execution cost.
# Real flows with HTTP / DB / Shell nodes will run slower in proportion to
# the work the nodes actually do.
#
# Usage:
#   scripts/bench-throughput.sh                         # 10k jobs, 20 workers
#   N=50000 WORKERS=40 scripts/bench-throughput.sh      # tune both
#   scripts/bench-throughput.sh --table-only            # just the markdown table
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE_DIR="$ROOT/apps/runloop-engine"
TMP="$(mktemp -d)"
trap 'cleanup' EXIT
NET="rl-tput-$$"
PG="rl-tput-pg-$$"
ENG="rl-tput-eng-$$"
PG_PORT=15482
ENG_PORT=18082

N="${N:-10000}"
WORKERS="${WORKERS:-20}"
QUEUE_CONCURRENCY="${QUEUE_CONCURRENCY:-$WORKERS}"
table_only=0
case "${1:-}" in --table-only|-t) table_only=1 ;; esac

log() { [ "$table_only" = "1" ] || echo "$@" >&2; }

cleanup() {
  log "→ cleanup"
  docker rm -f "$ENG" "$PG" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}

human_int() { awk -v n="$1" 'BEGIN{ for(i=length(n);i>0;i-=3){p=substr(n,1,i);s=substr(n,i+1)" "s;n=p} sub(/[ ]+$/,"",s); print substr(n,1,length(n)-(length(s)>0?length(s)/4:0)) (length(s)>0?","s:"") }' | tr ' ' ','; }

# -- 1. Build engine docker image -----------------------------------------
log "→ building engine docker image..."
docker build -q -t "rl-tput-engine:$$" "$ENGINE_DIR" >/dev/null

# -- 2. Postgres + schema -------------------------------------------------
# Ephemeral DB password — never persisted, exists only for the duration
# of this script's docker network. Generated to keep secret scanners from
# tripping on hardcoded postgres credentials in the script body.
PG_PASS=$(openssl rand -hex 12)

log "→ starting postgres on 127.0.0.1:$PG_PORT..."
docker network create "$NET" >/dev/null
docker run -d --rm --name "$PG" --network "$NET" \
  -e POSTGRES_USER=runloop -e POSTGRES_PASSWORD="$PG_PASS" -e POSTGRES_DB=runloop \
  -p "127.0.0.1:$PG_PORT:5432" postgres:16-alpine >/dev/null
until docker exec "$PG" pg_isready -U runloop >/dev/null 2>&1; do sleep 0.5; done

log "→ applying schema..."
(
  cd "$ROOT/apps/runloop"
  DATABASE_URL="postgres://runloop:${PG_PASS}@127.0.0.1:${PG_PORT}/runloop?sslmode=disable" \
    npx prisma db push --skip-generate --accept-data-loss >/dev/null 2>&1
)

# -- 3. Seed minimal project + flow + queue ------------------------------
log "→ seeding project + flow + queue..."
PROJECT_ID="proj-tput"
FLOW_ID="flow-tput"
QUEUE_NAME="tput-queue"
ADMIN_ID="admin-tput"

# Single transaction so a partial failure leaves no orphans + the script
# bails immediately. -i forwards stdin into the container.
docker exec -i "$PG" psql -U runloop -d runloop -v ON_ERROR_STOP=1 -1 <<SQL >/dev/null
INSERT INTO users (id, email, password, name, role, status, created_at, updated_at)
VALUES ('$ADMIN_ID', 'tput@bench.local', 'x', 'Bench', 'ADMIN', 'ACTIVE', NOW(), NOW());

INSERT INTO projects (id, name, color, created_by, created_at, updated_at)
VALUES ('$PROJECT_ID', 'Throughput Bench', 'cyan', '$ADMIN_ID', NOW(), NOW());

INSERT INTO project_members (id, project_id, user_id, role, joined_at)
VALUES ('pm-tput', '$PROJECT_ID', '$ADMIN_ID', 'OWNER', NOW());

-- The engine unmarshals flow_config into models.FlowConfig where Type is
-- a JobType (uppercase enum: "START", "END", ...). The web UI's React-Flow
-- types ("startNode"/"endNode") are display-side only; the engine expects
-- the canonical uppercase form here.
INSERT INTO flows (id, name, type, status, current_version, project_id, created_by, flow_config, created_at, updated_at)
VALUES ('$FLOW_ID', 'noop-flow', 'DAG', 'ACTIVE', 1, '$PROJECT_ID', '$ADMIN_ID',
       '{"nodes":[{"id":"start","type":"START","name":"Start"},{"id":"end","type":"END","name":"End"}],"edges":[{"id":"e1","source":"start","target":"end"}]}',
       NOW(), NOW());

INSERT INTO flow_versions (id, flow_id, version, name, flow_config, created_by, created_at)
VALUES ('fv-tput', '$FLOW_ID', 1, 'noop-flow',
       '{"nodes":[{"id":"start","type":"START"},{"id":"end","type":"END"}],"edges":[{"source":"start","target":"end"}]}',
       '$ADMIN_ID', NOW());

INSERT INTO job_queues (name, project_id, flow_id, backend, concurrency, max_attempts, enabled, created_at, updated_at)
VALUES ('$QUEUE_NAME', '$PROJECT_ID', '$FLOW_ID', 'postgres', $QUEUE_CONCURRENCY, 1, true, NOW(), NOW());
SQL

# Verify seed actually committed
seeded=$(docker exec "$PG" psql -U runloop -d runloop -tA -c "SELECT count(*) FROM job_queues WHERE name='$QUEUE_NAME';")
[ "${seeded// /}" = "1" ] || { log "✗ queue seed failed (got $seeded)"; exit 1; }
log "  ✓ queue $QUEUE_NAME registered"

# -- 4. Start engine (it discovers queue on boot) -------------------------
log "→ starting engine with WORKER_COUNT=$WORKERS, queue.concurrency=$QUEUE_CONCURRENCY..."
JWT_SECRET=$(openssl rand -hex 48)
SECRET_ENCRYPTION_KEY=$(openssl rand -hex 32)
docker run -d --rm --name "$ENG" --network "$NET" \
  -e DATABASE_URL="postgres://runloop:${PG_PASS}@${PG}:5432/runloop?sslmode=disable" \
  -e JWT_SECRET="$JWT_SECRET" \
  -e SECRET_ENCRYPTION_KEY="$SECRET_ENCRYPTION_KEY" \
  -e EXECUTOR_PORT=8080 \
  -e WORKER_COUNT="$WORKERS" \
  -e WORKER_QUEUE_SIZE="$((WORKERS * 4))" \
  -e LOG_LEVEL="${LOG_LEVEL:-warn}" \
  -p "127.0.0.1:$ENG_PORT:8080" \
  "rl-tput-engine:$$" >/dev/null

for _ in $(seq 1 200); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$ENG_PORT/rl/api/health" 2>/dev/null || true)
  if [ "$code" = "200" ] || [ "$code" = "401" ]; then break; fi
  sleep 0.1
done
sleep 1  # let queue manager finish discovery loop

# -- 5. Bulk-insert N PENDING items --------------------------------------
log "→ bulk-inserting $N items (single SQL statement)..."
docker exec -i "$PG" psql -U runloop -d runloop -v ON_ERROR_STOP=1 <<SQL >/dev/null
INSERT INTO job_queue_items (id, queue_name, project_id, payload, status, attempts, visible_after, created_at)
SELECT
  'item-' || i, '$QUEUE_NAME', '$PROJECT_ID',
  ('{"i":' || i || '}')::jsonb,
  'PENDING', 0, NOW(), NOW()
FROM generate_series(1, $N) i;
SQL

# Verify the items are visible to the queue manager
qcheck=$(docker exec "$PG" psql -U runloop -d runloop -tA -c \
  "SELECT count(*) FROM job_queue_items WHERE queue_name='$QUEUE_NAME' AND status='PENDING';")
log "  ✓ $qcheck PENDING items"

# -- 6. Poll until all COMPLETED -----------------------------------------
log "→ waiting for engine to drain queue..."
t_start=$(perl -e 'use Time::HiRes qw(time); print time()')
while true; do
  done_count=$(docker exec "$PG" psql -U runloop -d runloop -tA -c \
    "SELECT count(*) FROM job_queue_items WHERE queue_name='$QUEUE_NAME' AND status='COMPLETED';" 2>/dev/null || echo 0)
  done_count="${done_count// /}"
  if [ "$done_count" -ge "$N" ]; then
    break
  fi
  sleep 0.2
  # safety: bail after 5 minutes regardless
  now=$(perl -e 'use Time::HiRes qw(time); print time()')
  elapsed=$(perl -e "printf '%.0f', $now - $t_start")
  if [ "$elapsed" -gt 300 ]; then
    log "✗ timed out at $done_count / $N after ${elapsed}s"
    log ""
    log "── engine logs (last 40 lines) ──"
    docker logs "$ENG" --tail 40 2>&1 | sed 's/^/   /' | tee /dev/stderr >/dev/null
    log ""
    log "── item status breakdown ──"
    docker exec "$PG" psql -U runloop -d runloop -c \
      "SELECT status, count(*) FROM job_queue_items WHERE queue_name='$QUEUE_NAME' GROUP BY status;" >&2 || true
    break
  fi
done
t_end=$(perl -e 'use Time::HiRes qw(time); print time()')
elapsed_s=$(perl -e "printf '%.2f', $t_end - $t_start")
rate=$(perl -e "printf '%.0f', $N / ($t_end - $t_start)")

# Final tally (psql -tA emits one row in '|'-separated form by default).
tally=$(docker exec "$PG" psql -U runloop -d runloop -tA -c "
  SELECT
    count(*) FILTER (WHERE status='PENDING')    || '|' ||
    count(*) FILTER (WHERE status='PROCESSING') || '|' ||
    count(*) FILTER (WHERE status='COMPLETED') || '|' ||
    count(*) FILTER (WHERE status='FAILED')    || '|' ||
    count(*) FILTER (WHERE status='DLQ')
  FROM job_queue_items WHERE queue_name='$QUEUE_NAME';")
IFS='|' read -r pending processing completed failed dlq <<<"$tally"

# -- 7. Output ------------------------------------------------------------
HW=$(uname -m); OS=$(uname -sr); GO_VER=$(go version | awk '{print $3}')
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
COMMIT=$(git -C "$ROOT" rev-parse --short HEAD)

if [ "$table_only" = "1" ]; then
  cat <<EOF
| Workload | Jobs | Workers | Time | Throughput |
|---|---:|---:|---:|---:|
| Postgres queue → no-op flow | $N | $WORKERS | ${elapsed_s}s | **$rate jobs/sec** |
EOF
else
  cat <<EOF
# RunLoop throughput benchmark — $NOW

Single-instance engine, Postgres-backed queue, no-op flow (Start → End).

| Metric | Value |
|---|---|
| Jobs enqueued | $N |
| Worker pool size | $WORKERS goroutines |
| Queue concurrency cap | $QUEUE_CONCURRENCY |
| Wall-clock to drain | **${elapsed_s} s** |
| Sustained throughput | **$rate jobs/sec** |
| Final status: COMPLETED | $completed |
| Final status: FAILED / DLQ | $failed / $dlq |

## What this measures

The cost of pulling a row from \`job_queue_items\` (Postgres SELECT FOR
UPDATE SKIP LOCKED), dispatching it to a worker goroutine, executing the
flow's two trivial nodes, and updating the row to COMPLETED. Real flows
with HTTP / DB / Shell / Python / Node / Docker nodes scale down from
this ceiling in proportion to the per-node work.

## Methodology

1. Build engine image, spin up Postgres + engine on isolated network.
2. Apply Prisma schema; insert minimal project + no-op flow + queue.
3. Start the engine (queue manager discovers the queue at boot).
4. Bulk \`INSERT ... SELECT FROM generate_series(1, $N)\` — single SQL
   statement, no API round-trip, no per-row latency.
5. Time \`t_start\` immediately after the bulk insert returns.
6. Poll \`SELECT count(*) WHERE status='COMPLETED'\` every 200ms.
7. Time \`t_end\` when count reaches $N.

The first item gets a small head-start while the engine's queue poll
loop notices the new rows; that's bundled into the wall-clock and pulls
the rate slightly down vs. a "steady-state" measurement. For larger
\`N\` the head-start becomes negligible.

## Run details

- Hardware: \`$HW\`
- Host OS: \`$OS\`
- Go: \`$GO_VER\`
- Commit: \`$COMMIT\`
- Postgres: \`postgres:16-alpine\`

## What this is not

- **Multi-instance**: single engine, single Postgres. HA / leader-election
  isn't measured.
- **Real workload**: no-op flow. HTTP nodes will be network-bound; DB
  nodes will be storage-bound. Use this as the queue+worker ceiling.
- **Cross-backend**: Postgres queue only. RabbitMQ / Kafka / Redis Streams
  will have different characteristics; track separately.
- **Sustained-over-hours**: this drains a fixed batch. A loaded production
  queue with new items arriving as old ones complete will have different
  numbers (typically slightly lower due to commit / vacuum overhead).
EOF
fi
