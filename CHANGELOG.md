# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/),
versioning: [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
[Unreleased]: https://github.com/EnterpriseX-Platform/RunLoop/compare/v0.1.0...HEAD
