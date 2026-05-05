# awesome-* list PRs (paste-ready)

These lists are how a lot of self-hosters discover tools. Land a PR
within the first week of launch — your repo's day-1 traffic gives
the PR review pressure to merge.

---

## awesome-go

Repo: https://github.com/avelino/awesome-go
File: `README.md`
Section: **Job Scheduler**

Click the file → Edit → add a single line, alphabetically. Keep the
line ≤ 250 chars.

### Diff

```diff
 ## Job Scheduler

 *Libraries for scheduling jobs.*

   * ...existing entries...
+  * [RunLoop](https://github.com/EnterpriseX-Platform/RunLoop) - Self-hostable workflow engine with a drag-and-drop DAG editor, 4 pluggable queue backends (Postgres / RabbitMQ / Kafka / Redis), and 23 built-in node types. Single Go binary, AGPL-3.0.
   * ...
```

### PR description

```markdown
## What

Adds RunLoop to the **Job Scheduler** section.

## About the project

RunLoop is an open-source workflow engine — drag-and-drop DAG editor
+ Go execution engine + 4 pluggable queue backends. Single static
binary, sub-second cold start, AGPL-3.0.

* Repo: https://github.com/EnterpriseX-Platform/RunLoop
* License: AGPL-3.0
* Public for: ~30 days (released YYYY-MM-DD)
* Stars: <current count>
* CI: passing
* Tests: 62 automated (Go + Vitest)

## Checklist

- [x] Description ≤ 250 chars
- [x] Alphabetical order in section
- [x] Link is GitHub repo, not docs / homepage
- [x] Project has a CI pipeline
- [x] Project is self-contained (no missing licenses, etc.)
- [x] At least one full release tagged
```

---

## awesome-selfhosted

Repo: https://github.com/awesome-selfhosted/awesome-selfhosted
File: `markdown/automation.md` (or `README.md` Automation section)

### Diff

```diff
 ## Automation

   * ...existing entries...
+  * [RunLoop](https://github.com/EnterpriseX-Platform/RunLoop) - Workflow engine with a drag-and-drop DAG editor, scheduled and webhook-triggered runs, 4 queue backends (Postgres / RabbitMQ / Kafka / Redis), and a built-in secret vault. Single Go binary; runs on a Pi. `docker compose up`. ([Demo](DEMO_URL), [Source Code](https://github.com/EnterpriseX-Platform/RunLoop)) `AGPL-3.0` `Go`
   * ...
```

### PR description

awesome-selfhosted has a strict checklist — read CONTRIBUTING.md
in the repo. Highlights:

- License must be FOSS (AGPL counts ✓)
- Must be self-hostable (✓)
- Must have a working install path (`docker compose up` ✓)
- Must have a real release / version tag (need to tag v0.1.0 first)
- Must have a public demo link OR working screenshot/video
- One-line description ≤ ~250 chars

```markdown
## What

Adds RunLoop to the **Automation** section.

* Repo: https://github.com/EnterpriseX-Platform/RunLoop
* License: AGPL-3.0
* Stack: Go (engine), Next.js 14 (web), PostgreSQL 16
* Released: YYYY-MM-DD, current version v0.1.0
* Self-hosting: `git clone && docker compose up -d`
* Demo: https://demo.runloop.dev (resets every 24h)
* Public discussion / support: GitHub Discussions
* Documentation: in-repo `/docs` + README

Tested install path on a fresh Ubuntu 22.04 VPS — comes up in 90s.
```

---

## Other awesome-* lists worth submitting to

- **awesome-postgres** — has a "Workflow / Job Scheduler" subsection,
  RunLoop fits since Postgres is the default queue backend.
- **awesome-docker-compose** — if you have a notable docker-compose
  example. We do.
- **awesome-low-code** — some lists exist; visual flow editor counts.
- **awesome-workflow-engines** — exists but small; quick win.

---

## Newsletters

### Console.dev

Submit at https://console.dev/submit-tool.

```
Tool name:        RunLoop
URL:              https://github.com/EnterpriseX-Platform/RunLoop
What it does:     Open-source workflow engine. Drag-and-drop DAGs,
                  4 pluggable queue backends, AGPL. Single Go binary,
                  runs in 50 MB. Self-hosted in 3 minutes.
Why now:          v0.1.0 released YYYY-MM-DD. Fills the gap between
                  cron and Airflow.
Audience fit:     Backend engineers, ops teams, indie hackers building
                  internal tools and integration pipelines.
```

### Golang Weekly

Submit at https://golangweekly.com/issues/new.

```
Subject: New project: RunLoop — open-source workflow engine in Go

Body (1-2 paragraphs):

RunLoop is a drag-and-drop workflow engine I just open-sourced
under AGPL-3.0. The engine is a single Go binary using Fiber for
HTTP, gocron for scheduling, and a worker pool over a buffered
channel — runs at sub-second cold start in ~50 MB.

The interesting bits for /r/golang readers: a Backend interface
that abstracts 4 queue implementations (Postgres SKIP LOCKED,
RabbitMQ, Kafka via segmentio, Redis Streams), expr-lang for
inline expression evaluation in nodes, parallel DAG dispatch with
per-node retries and circuit breakers, and the `_ "time/tzdata"`
trick to make non-UTC schedulers work on alpine.

Repo + technical writeup:
https://github.com/EnterpriseX-Platform/RunLoop
```

### TLDR Newsletter

https://tldr.tech/sponsor — there's a free section for genuinely
interesting submissions. Use the same Console.dev copy.

### DB Weekly / Postgres Weekly

Pitch the Postgres-as-queue-backend angle. SKIP LOCKED + advisory
locks for HA is interesting to that audience.

```
Subject: Postgres as a queue + scheduler — 1.5k QPS without Redis

RunLoop uses Postgres SELECT FOR UPDATE SKIP LOCKED as one of its
four queue backends. We hit ~1.5k jobs/sec on a t3.medium with 5
worker goroutines. Scheduler HA via pg_advisory_lock is on our
roadmap.

Repo: https://github.com/EnterpriseX-Platform/RunLoop
Internals writeup: <blog post URL>
```
