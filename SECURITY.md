# Security Policy

## Reporting a Vulnerability

We take security seriously. If you believe you've found a vulnerability in
RunLoop, please **do not** open a public issue. Instead, report it privately:

- Open a [GitHub security advisory](https://github.com/EnterpriseX-Platform/RunLoop/security/advisories/new), or
- Email **security@enterpriseX.dev**

Please include:

- A description of the issue and where it lives in the code
- Steps to reproduce (proof-of-concept welcome)
- Affected versions / commit hashes
- Any mitigation you're aware of

We aim to acknowledge reports within **2 business days** and ship a fix or
mitigation within **30 days** for high-severity issues. We'll credit you in
the release notes unless you'd prefer to stay anonymous.

## Supported Versions

Only the latest minor release on `main` receives security fixes during the
pre-1.0 phase. We'll publish a longer support matrix once we tag 1.0.

## Hardening Checklist for Self-Hosters

When you deploy RunLoop, please:

- **Set strong secrets.** `JWT_SECRET` must be ≥ 32 random characters and
  not match a known default (`dev-secret-key`, `change-me`, etc.). The
  process refuses to start if it detects an insecure value while
  `NODE_ENV=production`. Generate one with `openssl rand -hex 48`.
- **Set `SECRET_ENCRYPTION_KEY`.** 64 hex characters (256 bits). Both web
  and engine processes must share the same value or stored secrets become
  unreadable. Generate with `openssl rand -hex 32`.
- **Never enable `SKIP_AUTH=true` in production.** It bypasses authentication
  entirely. The auth module hard-fails on startup if both flags are set.
- **Use TLS for `DATABASE_URL`** — append `?sslmode=require` (or
  `verify-full` with a CA certificate) when reaching Postgres over a
  network you don't fully control.
- **Bind Postgres to `127.0.0.1`** in Docker / firewall it off the public
  internet — never expose port 5432 directly. The bundled `docker-compose.yml`
  binds to localhost only.
- **Rotate API keys (`rl_*`) on a schedule** — they grant project-scoped
  access without a JWT. Keep them out of source control and CI logs.
- **Run executors in a sandbox.** SHELL/PYTHON/NODEJS/DOCKER nodes execute
  user-supplied code. They are protected by authentication, but assume
  any authenticated user can run arbitrary code on the engine host.
  For multi-tenant deployments, run the engine in a dedicated, ephemeral
  VM or container with no privileged mounts.

## What's In Scope

- Authentication / authorization bypasses
- Token forgery, replay, or theft
- SQL injection, SSRF, RCE, path traversal
- Insecure cryptography, key handling, or storage
- Cross-tenant data leaks (one project reading another's secrets/flows)

## What's Out of Scope

- Issues caused exclusively by misconfiguration (e.g. running with
  `SKIP_AUTH=true` in a public deployment, or weak `DATABASE_URL`
  credentials)
- Denial-of-service via legitimate API usage (queue flooding, large
  payloads) — these are tracked as performance issues, not vulnerabilities
- Third-party vulnerabilities in dependencies that we have not yet pulled
  in (please report to the upstream project)
