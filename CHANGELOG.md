# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/),
versioning: [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.3] — Patch release

Two improvements that surfaced while validating v0.1.2 against a clean
checkout, plus a tooling addition for the README hero animation.

### Fixed

- **`docker compose up -d` now boots cleanly on an empty Postgres.**
  The previous release fatal-crashed the engine on first start with
  `relation "schedulers" does not exist` because nothing in the compose
  stack ran the Prisma migration. The web container now uses a thin
  shell wrapper that runs `npx prisma db push` before exec'ing into
  Next.js. K8s deployments are unaffected (they keep using their real
  init container). Opt-out via `SKIP_DB_MIGRATE=true` for ops setups
  that prefer to time migrations externally.
  ([#6](https://github.com/EnterpriseX-Platform/RunLoop/issues/6),
  [#16](https://github.com/EnterpriseX-Platform/RunLoop/pull/16))

### Added

- **`scripts/make-demo-gif.sh`** — turns a `.mov` screen recording
  (QuickTime / OBS) into a README-ready optimized GIF. Two-stage
  pipeline (ffmpeg trim+scale → gifski high-quality encode, with
  ffmpeg palettegen fallback). Defaults: 15 s, 900 px, 15 fps, 10 MiB
  soft cap. All overridable.
  ([#7](https://github.com/EnterpriseX-Platform/RunLoop/issues/7),
  [#17](https://github.com/EnterpriseX-Platform/RunLoop/pull/17))

## [0.1.2] — Patch release

Three small improvements driven by external feedback in the first 48
hours after launch.

### Added

- **`POST /api/queues/:name/purge`** — operator endpoint that deletes
  every `PENDING` row from a queue in one call, leaving in-flight
  `PROCESSING` rows alone. Use after fixing a flow's code to clear
  stuck messages instead of waiting for `max_attempts` retries to
  drain (~15 minutes for a `visibility=300s` queue). Returns the
  deleted count. PG backend only.
  ([#13](https://github.com/EnterpriseX-Platform/RunLoop/issues/13),
  [#15](https://github.com/EnterpriseX-Platform/RunLoop/pull/15))
- **`docs/BENCHMARKS.md` + `scripts/bench.sh`** — reproducible
  footprint numbers (binary size / image size / RAM idle / cold
  start) so the README's claims aren't a one-off measurement.
  Self-contained: random ports, ephemeral DB password, full teardown
  on exit.
  ([#5](https://github.com/EnterpriseX-Platform/RunLoop/issues/5),
  [#11](https://github.com/EnterpriseX-Platform/RunLoop/pull/11))

### Fixed

- **Engine image now ships `curl`.** Shell scheduler tasks commonly
  call HTTP endpoints (webhook fan-out, internal pipeline APIs,
  smoke tests); without `curl` every shell flow either bundles its
  own binary or falls back to `wget`. ~1.4 MiB additional image
  size, negligible against the existing Python + Node + Docker CLI
  bundle.
  ([#12](https://github.com/EnterpriseX-Platform/RunLoop/issues/12),
  [#14](https://github.com/EnterpriseX-Platform/RunLoop/pull/14))
- **CI secret scan no longer flags template URLs as leaks.** Switched
  TruffleHog from `--results=verified,unknown` to `--results=verified`
  — `postgres://user:${PG_PASS}@host` template literals in shell
  scripts are no longer reported as unverified secrets. We still fail
  the build on real verified credentials.

## [0.1.1] — Patch release

First patch on top of v0.1.0. Two bugs surfaced while preparing the
launch sandbox; both are fixed here.

### Fixed

- **Engine no longer persists `0001-01-01` as `next_run_at`.** After
  registering a cron job with gocron, the engine called `job.NextRun()`
  immediately and wrote the result to `schedulers.next_run_at`. For a
  freshly added job that hadn't fired yet, gocron returned a zero
  `time.Time` — Postgres stored it as `0001-01-01 00:00:00`, and the web
  UI rendered every freshly-seeded scheduler as "Overdue" until the
  first firing landed. Falls back to `robfig/cron` (an existing
  dependency) when gocron returns zero, applying the scheduler's
  `timezone`. Skips the DB write entirely when both sources fail.
  ([#1](https://github.com/EnterpriseX-Platform/RunLoop/issues/1),
  [#8](https://github.com/EnterpriseX-Platform/RunLoop/pull/8))
- **Bounded `int → int32` casts in pgxpool config and Kafka requeue.**
  CodeQL flagged three sites where attacker-controllable or env-derived
  integers were narrowed without an upper-bound check. Adds a
  `clampInt32` helper for the Postgres pool, and rewrites the Kafka
  `x-attempts` increment to do the `+1` in `int64` and clamp into
  `[1, MaxInt32]` before the cast. No behavior change in normal use,
  but malicious headers can no longer wrap into a negative attempt
  count and bypass the max-attempts guard.
  ([#9](https://github.com/EnterpriseX-Platform/RunLoop/pull/9))

## [0.1.0] — First public release

The first version published under AGPL-3.0 on GitHub. Pre-1.0, so
the API surface and DB schema may shift between minor releases —
but `npm run db:push` + the Prisma migration story will carry you.

### Highlights

- **23 flow node types** across control flow (Start/End/Condition/
  Switch/Loop/Merge/Delay/Transform/SetVariable), executors (HTTP/
  Database/Shell/Python/NodeJS/Docker), notifications (Slack/Email/
  WebhookOut), and utilities (Log/SubFlow/WaitWebhook/Enqueue/Notify).
- **4 queue backends** — Postgres (default, no extra infra), RabbitMQ,
  Kafka, Redis Streams — behind a single `Backend` interface.
- **Project-scoped multi-tenancy** — secrets, env vars, queues,
  channels, flows isolate per project. Membership-checked at every
  API surface.
- **AES-256-GCM secret vault** — `${{secrets.NAME}}` substitution
  in any node config. Encrypted at rest with `SECRET_ENCRYPTION_KEY`
  shared between web and engine processes.
- **Real-time execution stream** — WebSocket from engine to browser,
  every node tick / retry / failure surfaces live.
- **Pub/sub channels** — flows publish via `Notify` node, mobile
  apps and dashboards subscribe over WebSocket.
- **Variable substitution** — `${{nodeId.field}}`, `${{input.X}}`,
  `${{env.X}}`, `${{secrets.X}}`, `${{NOW}}`, `${{TODAY}}`,
  `${{loop.item}}` inside loop bodies.
- **Pre-flight unresolved-template guard** — catches leftover
  `${{...}}` in node config and fails fast with the offending key.
- **HTTP body-level success check** — `successWhen: "body.code == 200"`
  via expr-lang. Catches the Mendix / GraphQL / SOAP-over-JSON case
  where HTTP returns 200 but the business response is FAIL.
- **API keys** — `rl_*` prefix, sha256-hashed in storage, work
  against both the engine routes and the Next.js native routes.
- **24 popular n8n integrations** seeded as global node templates
  (Slack / Discord / Telegram / Notion / Airtable / GitHub / GitLab /
  Linear / Jira / OpenAI / Anthropic / Stripe / Shopify / SendGrid /
  Mailgun / Twilio / AWS S3 / Postgres / MySQL / Calendly / HubSpot /
  Mailchimp / MS Teams / Google Sheets).

### Security

- **Production secret guards** — `JWT_SECRET` rejected when missing,
  shorter than 32 chars, or matching a known insecure default.
  Enforced lazily at first sign/verify so `next build` doesn't trip.
- **`SKIP_AUTH=true` refuses to enable** when `NODE_ENV=production`.
  Switched from `NEXT_PUBLIC_SKIP_AUTH` (client-bundled) to a
  server-only flag.
- **CORS allowlist via `ALLOWED_ORIGINS`** — wildcard `*` rejected
  in production at startup.
- **Login rate limit** — 10/min per IP on engine (Fiber limiter)
  and Next.js (in-memory token bucket).
- **Constant-time bcrypt** on user-not-found to prevent enumeration.
- **Body limit** on engine (`BODY_LIMIT_BYTES`, default 4 MB).
- **WebSocket origin verification** via `WS_ALLOWED_ORIGINS`.
- **Security headers**: CSP, HSTS (production), X-Frame-Options,
  Referrer-Policy, Permissions-Policy. `poweredByHeader: false`.
- **Generic 5xx responses** — error details go to logs, not the
  client. 4xx messages stay surfaced.
- **AI proxy hardening** — system-prompt cap (4 KB), total-prompt
  cap (64 KB), message-count cap (64). User-supplied system text is
  wrapped in a guard preamble so prompt-injection is treated as
  untrusted context, not authoritative instructions.
- **Recursive PII / token redaction** for log payloads — recognises
  JWT, sk-*, ghp_*, rl_* token shapes regardless of key name.

### Known gaps (see ROADMAP.md)

- Single-instance scheduler — HA via Postgres advisory locks is on
  the v0.3 milestone.
- No backfill UI yet.
- No K8s pod operator yet — Shell/Python/Node nodes run in-process.
- 23 connectors is small compared to Airflow's 1500+ — community
  PRs and the plugin registry will grow this.

### Tests

62 automated tests in CI:

- Engine: 18 connector (camel/snake alias coverage), 8 config +
  flow_executor, 5 scheduler attached-flow routing, 3 dryrun
  helpers, 9 pre-flight + body-check helpers.
- Web: 9 rate-limiter, 9 redact, 18 encryption + secret-name +
  mask-secret tests.

### Compatibility

- Go 1.25+
- Node 20+
- PostgreSQL 16+
- Optional: RabbitMQ 3.11+ / Kafka 3.5+ / Redis 7.0+

### Breaking changes from internal pre-release

This is the first public release; internal pre-release versions
are not supported. Migration path is clean install.

---

[0.1.0]: https://github.com/EnterpriseX-Platform/RunLoop/releases/tag/v0.1.0
[0.1.1]: https://github.com/EnterpriseX-Platform/RunLoop/releases/tag/v0.1.1
[0.1.2]: https://github.com/EnterpriseX-Platform/RunLoop/releases/tag/v0.1.2
[0.1.3]: https://github.com/EnterpriseX-Platform/RunLoop/releases/tag/v0.1.3
[Unreleased]: https://github.com/EnterpriseX-Platform/RunLoop/compare/v0.1.3...HEAD
