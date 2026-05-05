# Demo video / GIF script

The single highest-leverage asset. Embed in README, attach to every
launch post. Two versions — make both:

1. **Short loop (15-20s)** — autoplay GIF in README. No audio.
2. **Full walkthrough (60-90s)** — Twitter / dev.to / YouTube. Audio.

Quality bar: better to skip having a demo than ship a low-quality one.
A blurry / hesitant demo signals "not ready."

---

## SHORT LOOP — 15 seconds

**Goal**: convey "this is a workflow engine you control with drag-and-drop"
in one continuous take.

```
[ 0-2s ]  Empty flow editor canvas. "+ New Flow" button visible.
          Cursor moves from sidebar.

[ 2-5s ]  Drag HTTP node from sidebar onto canvas.
          Drag Slack node from sidebar onto canvas.
          Drag Database node onto canvas.

[ 5-7s ]  Wire Start → HTTP → Slack → End.
          Wire HTTP → Database in parallel.

[ 7-9s ]  Click HTTP node. Properties panel slides in.
          Type a URL. (Don't show keystroke detail — fast cut.)

[ 9-11s ] Click "Save Changes". Flow saves.
          Click "Run Now".

[ 11-15s ] Execution detail page. Nodes light up green one by one.
           Output JSON visible in a tab.

           Final frame: SUCCESS · 247ms · 4 nodes ran.
```

**Loop seamlessly.** The first frame should match the last frame so
the GIF doesn't visibly "jump."

**Capture tools** (macOS):
- [Kap](https://getkap.co/) — free, exports GIF + MP4
- QuickTime + Gifski — professional polish

**File size budget**: < 5 MB GIF for README inline. If bigger, link
to MP4 instead.

---

## FULL WALKTHROUGH — 60-90 seconds

For Twitter (60s max), YouTube (longer OK), dev.to embed.

### Voiceover script

```
[0-5s]
Hi, I'm <name>. Today I'm going to set up a flow in RunLoop that
hits a JSON API every 5 minutes and sends a Slack alert if the
response says something's wrong.

[5-12s]
First, the editor. Drag-and-drop. I'll start by dragging an HTTP
node. Connect it from Start. Click it, set the URL — let's hit
status.example.com. POST, JSON body. That's it.

[12-22s]
Now I want to check the response. RunLoop's HTTP node has a
"successWhen" expression — `body.status == "OK"`. If the body
disagrees with HTTP 200, the node fails.

[22-30s]
Drag a Condition node next. Wire it. Now drag a Slack node off
the failure branch. Set the webhook from Secrets — `${{secrets.
SLACK_WEBHOOK}}`. Message: "Status check failed." Wire to End.

[30-42s]
Save. Now I want it to run on a schedule, so I create a Scheduler.
Cron: every 5 minutes. Attach this flow.

[42-50s]
Let me trigger it manually first to test. Run Now. Watch the nodes
light up — Start, HTTP, Condition, End. SUCCESS.

[50-60s]
That's the basics. RunLoop has 23 node types, four queue backends,
single Go binary, AGPL-licensed. Self-host with one docker-compose
command. Link in description.
```

### Visual cuts (sync to script)

| Time | Frame |
|---|---|
| 0-5s | Talking head OR title card "RunLoop · open-source workflow engine" |
| 5-12s | Screen: drag HTTP node, click, fill URL field, JSON body |
| 12-22s | Screen: scroll properties → Success Check section, type expression |
| 22-30s | Screen: drag Condition + Slack, wire, set webhookUrl from secret picker |
| 30-42s | Screen: Save → New Scheduler → cron field → attach flow |
| 42-50s | Screen: Run Now → execution detail page → nodes turn green |
| 50-60s | Title card: github.com/EnterpriseX-Platform/RunLoop · star icon · End |

### Audio

- Use a quiet-room mic. Hum-free. Don't post laptop-mic audio.
- Add subtle background music (Audiio / Epidemic Sound / royalty-free).
- Volume mix: voice -6 dB, music -24 dB.

### Captions

Always include open captions. Many viewers watch on mute.

---

## Asset list to produce

Before launch, produce:

| Asset | Where used | Size |
|---|---|---|
| `demo-15s.gif` | README inline | < 5 MB |
| `demo-15s.mp4` | README fallback link | < 10 MB |
| `demo-60s.mp4` | Twitter, dev.to embed | < 50 MB |
| `demo-90s-youtube.mp4` | YouTube unlisted, link in launch posts | any |
| `social-preview.png` | GitHub repo Social Preview | 1280×640 |
| `screenshot-flow-editor.png` | README, blog post | 1920×1080 |
| `screenshot-execution-detail.png` | README, blog post | 1920×1080 |
| `screenshot-dashboard.png` | README, blog post | 1920×1080 |
| `screenshot-queues.png` | Blog post, comparison table | 1920×1080 |
| `architecture-diagram.svg` | README, Twitter | vector |
| `comparison-table.png` | README, Twitter | 1600×900 |

Store under `docs/assets/` in the repo. Reference relatively from
README so they survive forks.

---

## Social-preview image (1280×640)

Used by GitHub when the repo URL is shared on Twitter / Slack /
Discord. Default is the README first-image, but override at:

`Settings → General → Social preview → Upload an image`

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   🔁  RunLoop                                                │
│                                                              │
│   Open-source workflow engine                                │
│   Drag-and-drop DAGs · 4 queue backends · single Go binary   │
│                                                              │
│   ┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐               │
│   │Start │ ─▶ │HTTP  │ ─▶ │Slack │ ─▶ │ End  │               │
│   └──────┘    └──────┘    └──────┘    └──────┘               │
│                                                              │
│   AGPL-3.0 · github.com/EnterpriseX-Platform/RunLoop         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Tools

- **Figma** — fastest for this. Template: 1280×640 frame.
- **Canva** — has GitHub Social Preview templates already sized.

### Color palette (match the app's dark theme)

- Background: `#0a0a0b` (very dark grey)
- Accent: `#0EA5E9` (ocean blue)
- Secondary: `#F97316` (warm orange)
- Text: `#fafafa` (off-white) / `#a1a1aa` (muted)
- Mono font: JetBrains Mono / IBM Plex Mono
- Sans font: Inter

---

## Recording tips

- **Resolution**: record at 2× the target output (so a 1920×1080 demo
  is recorded at 3840×2160 and downsized for sharpness).
- **Hide your taskbar / dock** — they're distracting.
- **Hide cursor** in screen-recording settings unless cursor is part
  of the demo.
- **No chrome** — use Chrome / Safari fullscreen, no tabs visible.
- **Use a clean profile** — no bookmarks bar, no extension icons.
- **Mock data** — never demo with real customer data, even if anonymized.
- **Consistent typing speed** — pre-record the URL / text and paste,
  don't fumble live.
- **Re-record the moment something jitters** — first impressions are
  unforgiving. 5 takes for a 60s demo is normal.
