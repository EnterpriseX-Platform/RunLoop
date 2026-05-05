# Local Development

## 1. Database (Docker)

```bash
# Start PostgreSQL only
npm run db:start

# Stops + removes the volume:
npm run db:stop
```

The dev database listens on:

| | Value |
|---|---|
| Host | `localhost:5481` |
| Database | `runloop` |
| User | `runloop` |
| Password | `runloop_secret` |

The non-default port (5481, not 5432) is intentional — it avoids
conflicting with a system Postgres if you have one.

## 2. Schema + seed

```bash
npm install
npm run db:push      # apply Prisma schema
npm run db:seed      # creates an admin user; password is printed once
```

The seed prints the generated admin password to stdout. Capture it on
first boot — it isn't recoverable. To pick your own:

```bash
SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD='<your-pw>' npm run db:seed
```

## 3. Run the apps (dev mode)

The simplest path — start both apps via Turborepo:

```bash
npm run dev
```

Or run them in separate terminals if you want logs split:

```bash
# Terminal 1 — Go engine
cd apps/runloop-engine
go run main.go

# Terminal 2 — Next.js web
cd apps/runloop
npm run dev
```

| Service | URL |
|---|---|
| Web UI | http://localhost:3000/runloop |
| Engine (direct) | http://localhost:8080/rl/health |
| Engine (via Next.js proxy) | http://localhost:3000/runloop/proxy/engine/health |

## 4. Skip auth in dev

Setting `NEXT_PUBLIC_SKIP_AUTH=true` in `apps/runloop/.env.local`
bypasses the login flow. The auth layer hard-fails on startup if this
flag is set with `NODE_ENV=production`, so it can't accidentally ship.

---

## URL structure

```
http://localhost:3000/
├── /runloop/                    ← Next.js web (port 3000)
│   ├── /login
│   ├── /dashboard
│   └── /p/<projectId>/...       ← project-scoped pages (settings,
│                                   secrets, env, schedulers,
│                                   executions, queues, channels, dlq)
│
├── /runloop/api/*               ← Next.js internal API (auth, projects)
│   └── /auth/{login,logout,me}
│
└── /runloop/proxy/engine/*      ← server-side proxy → Go engine (8080)
    ├── /health
    └── /api/{schedulers,executions,queues,channels,dlq}/*
```

The browser also opens a direct WebSocket to the engine at
`ws://localhost:8080/rl/ws/executions/<id>` — Next.js doesn't proxy WS,
so the dev setup talks straight to the engine port for live streams.

---

## Common commands

```bash
# Database
npm run db:start            # start Postgres in Docker
npm run db:stop             # stop + remove
npm run db:logs             # tail Postgres logs
npm run db:push             # apply Prisma schema
npm run db:migrate          # create + apply a migration
npm run db:generate         # regenerate Prisma client
npm run db:studio           # open Prisma Studio

# Dev / build
npm run dev                 # start both apps (turbo)
npm run build               # build everything
npm run lint                # eslint + go vet
npm run typecheck           # tsc + go vet
```

---

## Environment variables

`.env.example` at the repo root has the full set with comments.
The minimum you need locally:

```env
# apps/runloop/.env.local
DATABASE_URL=postgres://runloop:runloop_secret@localhost:5481/runloop?sslmode=disable
JWT_SECRET=dev-secret-key-change-in-production
NEXT_PUBLIC_SKIP_AUTH=true
ENGINE_URL=http://localhost:8080
SECRET_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000001  # 64 hex chars; dev value
```

```env
# apps/runloop-engine/.env (or export)
EXECUTOR_PORT=8080
DATABASE_URL=postgres://runloop:runloop_secret@localhost:5481/runloop?sslmode=disable
JWT_SECRET=dev-secret-key-change-in-production
SECRET_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000001
NODE_ENV=development
LOG_LEVEL=debug
```

In production, both `JWT_SECRET` and `SECRET_ENCRYPTION_KEY` must be
real secrets (32+ random bytes). The runtime guards refuse weak values
when `NODE_ENV=production`.

---

## Troubleshooting

### Database connection failed
```bash
docker ps | grep runloop-postgres   # is the container up?
npm run db:logs                     # what does Postgres say?
npm run db:stop && npm run db:start # full reset
```

### Port already in use
```bash
lsof -ti:3000 | xargs kill -9       # web
lsof -ti:8080 | xargs kill -9       # engine
lsof -ti:5481 | xargs kill -9       # postgres
```

### Prisma client missing
```bash
npm run db:generate -w apps/runloop
```

### Engine fails on boot — `SECRET_ENCRYPTION_KEY is required`
You're missing the env var and `NODE_ENV` is not `development`. Either
set the key or set `NODE_ENV=development` to use the deterministic dev
key (only valid for dev — see `apps/runloop-engine/internal/secret/store.go`).

### Engine fails on boot — `ALLOWED_ORIGINS is required in production`
Same shape — `NODE_ENV` thinks it's prod but `ALLOWED_ORIGINS` isn't
set. For dev, leave `NODE_ENV=development` and the engine accepts `*`.
