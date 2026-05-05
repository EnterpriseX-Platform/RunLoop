# Launch Day — Master Checklist

The condensed version. Print this, work top-to-bottom, check items off.

## T-7 days (preparation)

- [ ] Repo is **public** with all current fixes merged to `main`
- [ ] `LICENSE`, `README`, `CONTRIBUTING`, `SECURITY`, `CODE_OF_CONDUCT`,
      `ROADMAP`, `CHANGELOG` all in place
- [ ] CI green on `main` (passing badge in README)
- [ ] `docker compose up` works on a fresh clone (test on a clean VM)
- [ ] Tagged release `v0.1.0` with notes from `CHANGELOG.md`
- [ ] Repo About section: description + topics + website filled
- [ ] Social preview image uploaded (1280×640)
- [ ] Branch protection on `main` enabled
- [ ] Secret scanning + push protection enabled (GitHub settings)
- [ ] Discussions tab enabled
- [ ] Demo GIF (15s) embedded in README
- [ ] Long demo video (60-90s) uploaded to YouTube unlisted
- [ ] Live demo sandbox running (e.g. demo.runloop.dev) — optional but high-impact

## T-1 day

- [ ] Re-test docker compose on a clean Mac and a clean Linux VM
- [ ] Re-read launch posts; tune wording
- [ ] Schedule social media tools (Buffer / Typefully) for Day 0
- [ ] Set up a Discord/Slack server, link added to README + Issue templates
- [ ] Brief teammates on the launch — who handles what

## T-0 (launch day)

Times in PT (US west coast). Adjust for your timezone — but the
**relative ordering** matters more than absolute time.

### 09:00 PT — Hacker News

- [ ] Submit to https://news.ycombinator.com/submit
- [ ] Title: `Show HN: RunLoop – Open-source workflow engine in Go (AGPL)`
- [ ] URL: https://github.com/EnterpriseX-Platform/RunLoop
- [ ] Post first comment within 30s (script in `01-hackernews.md`)
- [ ] Pin browser tab — refresh every 10 min for first 4 hours
- [ ] Reply to every comment (especially negative — politely, factually)

### 11:00 PT — Reddit r/selfhosted

- [ ] Submit (script in `02-reddit-selfhosted.md`)
- [ ] Reply to early comments

### 11:30 PT — Twitter / X thread

- [ ] Post the 8-tweet thread (script in `04-twitter-thread.md`)
- [ ] Include 60-sec demo video in tweet 1
- [ ] Pin the thread to the @runloop profile (or your own)

### 13:00 PT — Reddit r/golang

- [ ] Submit (script in `03-reddit-golang.md`)
- [ ] Lead with engine internals, not product pitch

### 15:00 PT — dev.to / Medium / Hashnode

- [ ] Cross-post the long-form blog (script in `05-blog-post.md`)
- [ ] All three platforms — same content, native formatting on each

### 16:00 PT — Lobste.rs (if you have an invite)

- [ ] Submit the GitHub URL with `programming` + `golang` tags
- [ ] Add an `[author]` comment with the same intro as HN's first
      comment

### Throughout the day

- [ ] Reply within 1 hour to every comment / issue / DM
- [ ] Track stars (you can `git ls-remote` or use a GitHub action)
- [ ] Take screenshots of HN front page / Reddit upvotes for the
      eventual milestone tweet

## T+1 (day after)

- [ ] Post a "Thanks HN — here's what I learned" follow-up tweet with
      the highest-upvoted feature request acknowledged
- [ ] File issues for everything raised in HN / Reddit comments
- [ ] PR awesome-go (script in `06-awesome-prs.md`)
- [ ] PR awesome-selfhosted (script in `06-awesome-prs.md`)

## T+3

- [ ] Submit Console.dev / Golang Weekly / TLDR
- [ ] If first-day stars > 500: tweet milestone
- [ ] If first-day stars < 50: don't panic — most projects need 2-3
      relaunches before traction. Take a week, fix the obvious
      sharp edges, try again with a different angle.

## T+7

- [ ] First community PR merged (or, if none yet — actively reach
      out to commenters who said "I might use this for X")
- [ ] Cut v0.1.1 with the first round of fixes
- [ ] Schedule the comparison blog post ("RunLoop vs n8n vs Temporal")
      for T+14
- [ ] Public sandbox URL added to README if not already

## T+30

- [ ] Cut v0.2 — bigger feature batch responding to community feedback
- [ ] First milestone post when crossing 1000 stars (if applicable)
- [ ] Roadmap public (already done, but pin a discussion announcing
      "what's next")

---

## Anti-patterns (don't do these)

- ❌ Posting on weekends — front page burn faster, less reach
- ❌ Posting on a US holiday — you're competing with travel content
- ❌ Buying stars / using star-farms — GitHub detects this, social
      cost when caught is enormous
- ❌ Sock-puppet upvoting — same risk
- ❌ Auto-DMing new followers thanks — looks bot
- ❌ Posting the same content to every subreddit on day 1 — looks spam
- ❌ Begging for upvotes / RTs — reads as desperation
- ❌ Getting defensive on negative HN comments — the audience is
      watching how you react more than what they say
- ❌ Promising a feature that's not started ("Coming Q2!" → doesn't come)
- ❌ Hiding bugs / deleting embarrassing issues — community sees and
      remembers
- ❌ Treating this as a marketing campaign — open-source launch is a
      community-building exercise, not a product launch

---

## Files in this folder

```
00-launch-day-checklist.md   ← this file
01-hackernews.md             ← Show HN post + first-comment script + Q&A prep
02-reddit-selfhosted.md      ← r/selfhosted post + comment patterns
03-reddit-golang.md          ← r/golang post + engine-internals focus
04-twitter-thread.md         ← 8-tweet launch thread
05-blog-post.md              ← long-form for dev.to / Medium / Hashnode
06-awesome-prs.md            ← awesome-go + awesome-selfhosted PR text
07-demo-video-script.md      ← 15s loop + 60s walkthrough scripts + asset list
```

Each file has paste-ready text. Customize names / dates / live demo
URL where the placeholder appears.

Good luck. Don't perfect — ship.
