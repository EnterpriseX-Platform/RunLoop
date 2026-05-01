# Contributing to RunLoop

Thanks for your interest in helping out. RunLoop is AGPL-3.0 — contributions
are welcome from individuals and companies alike, and your changes ship under
the same license.

## Quick start

```bash
git clone https://github.com/EnterpriseX-Platform/RunLoop.git
cd RunLoop
cp .env.example .env       # fill in secrets — see comments inside
npm install
npm run db:start           # starts Postgres in Docker
npm run db:push            # applies the Prisma schema
npm run db:seed            # creates an admin user; password is printed once
npm run dev                # starts Next.js + Go engine via Turborepo
```

Open http://localhost:3081/runloop and log in with the seeded credentials.

## Project layout

| Path | Stack | What lives here |
|------|-------|-----------------|
| `apps/runloop/` | Next.js 14 (App Router) | UI, public API, Prisma ORM |
| `apps/runloop-engine/` | Go 1.25 (Fiber + gocron) | Scheduler, worker pool, flow executor, queue backends |
| `apps/runloop-cli/` | Go | Command-line client |
| `prisma/` | Postgres 16 | Schema + migrations |
| `docs/` | Markdown | Architecture, deployment, API guides |

See [`CLAUDE.md`](./CLAUDE.md) for a deeper map of the architecture and the
recurring quirks to watch out for.

## Branching & commits

- Branch off `main`. Use a short, descriptive name (`fix/dryrun-input`,
  `feat/redis-queue`, `docs/contributing`).
- Keep commits focused; prefer "one logical change per commit" over
  "WIP" rollups. Squash before opening the PR if your history is messy.
- Commit message style: short imperative subject, optional body explaining
  *why*. We don't enforce Conventional Commits, but a leading `feat:` /
  `fix:` / `docs:` makes the changelog easier.

## Pull requests

1. Open the PR against `main`.
2. Fill in the template — what changed, why, how you verified.
3. CI must be green. We run lint + typecheck + build on every PR.
4. A maintainer will review within a few business days. Address comments
   in additional commits (we'll squash on merge).

For larger changes (new node types, queue backends, schema changes),
please open a discussion or draft PR first so we can align on the
interface before you write the code.

## Adding a new flow node type

A node type lives in three places:

1. **UI component** — `apps/runloop/src/components/flow/nodes/<MyNode>.tsx`,
   registered in `nodes/index.ts` with an entry in `iconMap` / `colorMap`.
2. **Properties editor** — `apps/runloop/src/components/flow/properties/<MyNodeProperties>.tsx`.
3. **Engine executor** — `apps/runloop-engine/internal/executor/flow_executor.go`,
   either as a `FlowShape` case (control nodes) or `Connector`/`JobType`
   case (external I/O). Add the constant to `internal/models/scheduler.go`
   and update `JobType` validation.

A working example PR is the `NOTIFY` node — search the repo for
`JobTypeNotify` to trace the full surface.

## Adding a new queue backend

Backends live in `apps/runloop-engine/internal/queue/backend_*.go` and
implement the `Backend` interface in `backend.go`. Register the new kind
in `manager.go` (`newBackend` switch). Tests live in `backend_<kind>_test.go`
and run with `go test ./internal/queue/...`.

## Style

- **Go:** standard `go fmt`. Logging is `zerolog`. Errors wrapped with
  `fmt.Errorf("foo: %w", err)`. No global state — pass dependencies
  explicitly. SQL queries are parameterized; never concatenate user input.
- **TypeScript:** Strict mode is on. Prefer functional React (no class
  components). State lives in context (`AuthContext`, `ProjectContext`).
- **Imports:** absolute paths via the `@/*` alias inside the web app.
- **Filenames:** kebab-case for routes, PascalCase for components,
  snake_case for Go files (matches Go convention).

## Reporting bugs / requesting features

Use the issue templates (Bug Report / Feature Request). For security
issues, please follow [`SECURITY.md`](./SECURITY.md) instead of opening
a public issue.

## License

By submitting a contribution you agree to license your work under the
same AGPL-3.0 terms as the rest of the project. We don't require a CLA
at this time.
