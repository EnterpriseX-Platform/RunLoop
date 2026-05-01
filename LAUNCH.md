# Launch Checklist

A reference for the maintainer pushing RunLoop public for the first time.
Tick items off in order; nothing depends on later items.

## Day 0 — repo polish (do before sharing the URL anywhere)

- [ ] **Topics**: open https://github.com/EnterpriseX-Platform/RunLoop and click
      the gear next to *About*. Add: `workflow`, `scheduler`, `automation`,
      `dag`, `cron`, `golang`, `nextjs`, `low-code`, `self-hosted`, `agpl`,
      `queue`, `worker-pool`, `react-flow`.
- [ ] **Description**: "Open-source workflow engine — drag-and-drop DAGs,
      real cron, real queues (Postgres / RabbitMQ / Kafka / Redis),
      self-hosted in minutes."
- [ ] **Website**: leave blank for now, or point at the docs site once it
      exists.
- [ ] **Social preview image**: 1280×640. Generate via Figma / Canva. Should
      show the flow editor screenshot + "RunLoop" wordmark.
- [ ] **Branch protection** on `main`: require PR, require CI green, require
      review. Settings → Branches → Add rule.
- [ ] **Discussions tab**: Settings → Features → Discussions → Enable.
- [ ] **Sponsors / FUNDING.yml**: optional, but a `github: [enterprisex]`
      stanza unlocks the heart icon next to the repo title.
- [ ] **Add a real demo GIF/video** in `README.md` under the architecture
      diagram. ~10 seconds: drag node, wire edge, run, see output stream.
      A static screenshot is fine for v0; replace before the launch posts.
- [ ] **Generate first release**: tag `v0.1.0`, write release notes from
      the README's feature list. GitHub Releases auto-shows on the repo
      front page.

## Day 1 — first announcements

Post in this order, ~2 hours apart so each can amplify the next:

1. **Show HN**: "Show HN: RunLoop — open-source workflow engine in Go"
   - Best window: Tue/Wed 09:00–11:00 PT
   - Title format: `Show HN: RunLoop – <one-line value prop> (Go, Next.js, AGPL)`
   - First comment: who you are, why you built it, what it does *not* do
     (managing expectations beats over-promising).
2. **Twitter/X thread** — 4–6 tweets. Lead with a 30-sec demo video, end
   with the repo URL.
3. **r/selfhosted**: long-form post with the comparison table from README.
4. **r/golang**: focus on engine internals — "23 node types, 4 queue
   backends, single binary, lessons from gocron + Fiber".
5. **r/SideProject**: builder narrative, "I made this in N months".
6. **Lobste.rs** if you have an invite (link to the repo, not a blog).
7. **Hacker News (regular submission)** — if Show HN didn't fire, retry
   on a different day with a different angle.

## Week 1 — distribution

- [ ] Submit to **awesome-go**: PR to `https://github.com/avelino/awesome-go`
      under "Workflow / Job Scheduler".
- [ ] Submit to **awesome-selfhosted**: PR adding RunLoop to the
      "Automation" section.
- [ ] **Console.dev** newsletter — submit at https://console.dev/submit-tool
- [ ] **TLDR Newsletter** — submit at https://tldr.tech/sponsor (free
      mention if the editor likes it).
- [ ] **Golang Weekly** — submit to https://golangweekly.com/issues/new
- [ ] **DB Weekly / Postgres Weekly** — only if the DB-as-queue angle is
      interesting to those audiences (it is).
- [ ] **Discord/Slack server**: create a community Discord. Add the link
      to `README.md` and `.github/ISSUE_TEMPLATE/config.yml`.
- [ ] **YouTube/Loom 5-min walkthrough** — embed in README. Search SEO is
      stronger when the README has a video thumbnail.
- [ ] **First "RunLoop in 5 minutes" blog post** on dev.to + Medium +
      Hashnode (cross-post). Target keyword: "open source workflow engine".

## Month 1 — sustain

- [ ] Cut **v0.2** — bundle the first wave of community feedback fixes.
- [ ] Write **comparison post** "RunLoop vs n8n vs Temporal" (~1500 words).
      Be honest about gaps; comparison posts build trust + pull SEO.
- [ ] Stand up a **public sandbox** at `demo.runloop.dev` (or similar) so
      people can try without installing. Reset state every 24h.
- [ ] **Roadmap** in `ROADMAP.md` — 3-month and 6-month goals. Closes the
      "is this maintained?" question every newcomer asks.
- [ ] First **community PR** merged + thanked publicly. Critical milestone.
- [ ] **Stargazer thank-you** — when crossing 100 / 500 / 1000 stars, post
      a short thank-you tweet/discussion.

## Anti-patterns to avoid

- Don't post on every subreddit / HN every week — looks spammy. Quality
  over frequency.
- Don't compare yourself favorably to incumbent tools without acknowledging
  what they do better. Communities sniff this out.
- Don't fake stars / hire star-farms. GitHub detects this and the social
  cost of getting caught is enormous.
- Don't promise a feature you haven't started. Better to under-promise.
- Don't delete a critical issue because it's embarrassing. Acknowledge,
  fix, learn out loud — that's how trust compounds.

## Repo settings to double-check before launch

| Setting | Where | Should be |
|---|---|---|
| Issues | Settings → Features | enabled |
| Discussions | Settings → Features | enabled |
| Wiki | Settings → Features | disabled (use docs/) |
| Projects | Settings → Features | enabled if you'll use them |
| Branch protection on `main` | Settings → Branches | enabled, require PR + CI |
| Default branch | Settings → Branches | `main` |
| Allow squash / merge / rebase | Settings → General → PRs | squash + rebase only |
| Auto-delete head branches | Settings → General → PRs | enabled |
| Vulnerability alerts | Settings → Code security | enabled |
| Dependency graph | Settings → Code security | enabled |
| Secret scanning | Settings → Code security | enabled |
| Push protection (secrets) | Settings → Code security | enabled |

## Press kit

- **One-liner (50 chars)**: Open-source workflow engine in Go.
- **Tagline (90 chars)**: Drag-and-drop DAGs, real cron, real queues — self-hosted in minutes.
- **Long description (250 chars)**: RunLoop is a self-hostable workflow
  platform. Design DAGs visually, run on cron, fan jobs across a worker
  pool, and stream executions in real time. 23 node types, 4 queue backends,
  AGPL-3.0.
- **Logo**: TBD — commission a simple wordmark + loop icon.
- **Screenshot pack**: 5 images at 1920×1080:
  1. Flow editor with a non-trivial DAG
  2. Execution detail with the realtime stream
  3. Dashboard
  4. Queues page with stats
  5. Channels page (the unique pub/sub feature)
