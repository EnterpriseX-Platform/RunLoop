# Screenshots

The README references the following images. Capture them at **1920×1080**
(1× DPI; high-DPI screenshots inflate repo size needlessly), trim to the
panel content, and save as `.png` (or `.gif` for the hero).

| File | What to capture |
|---|---|
| `hero.gif`           | ~15 second loop: drag a node onto canvas → wire it → click Run → execution detail page streaming. Keep ≤ 5 MB. |
| `flow-editor.png`    | Flow editor with a non-trivial DAG (HTTP → Database → Slack, with a Loop). Show node palette open. |
| `execution-detail.png` | Execution detail page mid-run: per-node status, live log tail, output panel. |
| `schedulers.png`     | Schedulers list with 4-5 entries showing cron expressions, next-run times, last-run statuses. |
| `secrets-vault.png`  | Secrets list with a few entries (values masked). Bonus: capture the "Create API key" modal in the same shot. |
| `dlq.png`            | Dead-letter queue with at least one failed execution and the Replay button visible. |

## Tools

- **GIF**: [Kap](https://getkap.co/) (Mac), [LICEcap](https://www.cockos.com/licecap/) (cross-platform). Convert `.mov` → `.gif` with `ffmpeg -i in.mov -vf "fps=15,scale=800:-1:flags=lanczos" -loop 0 hero.gif`.
- **PNG**: built-in screenshot (`Cmd+Shift+4` on Mac), then `pngquant` to compress: `pngquant --quality=70-85 *.png --ext .png --force`.

## Privacy

Use the seed admin account or a fresh project. Don't capture real secret
values, real API keys, or real customer data — even masked.
