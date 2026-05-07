#!/bin/sh
# Web container startup wrapper.
#
# Why this exists: a `docker compose up -d` against an empty Postgres
# would otherwise hit a fatal "relation \"schedulers\" does not exist"
# the first time the engine starts, because no init container ran the
# Prisma migration. The k8s deployment uses a real init container for
# this; for docker-compose / single-host deployments we run the same
# `prisma db push` here before handing off to Next.js.
#
# `prisma db push` is idempotent — repeated runs against an already-
# in-sync schema cost ~400 ms and make no changes. So leaving this in
# place permanently is fine.

set -e

# Skip migration only if explicitly opted out. Useful for ops setups
# that want to control migration timing externally (e.g. blue/green
# deploys where the new pod starts after a coordinated migration job).
if [ "${SKIP_DB_MIGRATE}" != "true" ]; then
  echo "[entrypoint] prisma db push (set SKIP_DB_MIGRATE=true to opt out)..."
  npx prisma db push --skip-generate --accept-data-loss
else
  echo "[entrypoint] SKIP_DB_MIGRATE=true — skipping prisma db push"
fi

# Hand off to Next.js. exec replaces this shell so signals (SIGTERM
# from `docker stop`) reach Node directly and graceful-shutdown works.
exec node server.js
