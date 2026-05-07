#!/usr/bin/env bash
# make-demo-gif.sh — turn a screen recording into a README-ready GIF.
#
# Usage:
#   scripts/make-demo-gif.sh <input.mov> [output.gif]
#
# Defaults:
#   output         docs/screenshots/flow-editor.gif
#   trim           first 15 s of the recording
#   width          900 px (preserves aspect ratio)
#   fps            15 (good motion-to-size tradeoff for UI demos)
#   palette        gifski's perceptual quantizer (preferred), or
#                  ffmpeg's two-pass palettegen+paletteuse (fallback)
#
# Why this script: we want the README hero GIF to look sharp without
# blowing past the 10 MiB GitHub asset soft-limit. Gifski is markedly
# better than ffmpeg's GIF encoder for UI screen captures, but isn't
# always installed; ffmpeg almost always is. Both branches go through
# the same trim+scale ffmpeg first stage so the input format/codec
# doesn't matter.

set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "usage: $0 <input.mov> [output.gif]" >&2
    echo "  default output: docs/screenshots/flow-editor.gif" >&2
    exit 1
fi

INPUT="$1"
OUTPUT="${2:-docs/screenshots/flow-editor.gif}"
DURATION="${DURATION:-15}"
WIDTH="${WIDTH:-900}"
FPS="${FPS:-15}"
TARGET_MAX_MB="${TARGET_MAX_MB:-10}"

if [[ ! -f "$INPUT" ]]; then
    echo "❌ input not found: $INPUT" >&2
    exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "❌ ffmpeg not found. Install it:" >&2
    echo "   macOS:  brew install ffmpeg" >&2
    echo "   debian: apt install ffmpeg" >&2
    exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"

WORK_DIR="$(mktemp -d -t make-demo-gif.XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT

INTERMEDIATE_MP4="$WORK_DIR/trimmed.mp4"

say() { printf "\n\033[1;36m==> %s\033[0m\n" "$*"; }

# ── 1. Trim + scale + drop audio ─────────────────────────────────────
say "Trim to ${DURATION}s, scale width to ${WIDTH}, fps=${FPS}"
ffmpeg -hide_banner -loglevel warning -y \
    -i "$INPUT" \
    -t "$DURATION" \
    -vf "scale=${WIDTH}:-2:flags=lanczos,fps=${FPS}" \
    -an \
    -c:v libx264 -preset slow -crf 18 \
    "$INTERMEDIATE_MP4"

# ── 2. Encode GIF — gifski (preferred) or ffmpeg palettegen ──────────
if command -v gifski >/dev/null 2>&1; then
    say "Encoding GIF with gifski (high quality)"
    # gifski needs frames; pull them out first.
    FRAMES_DIR="$WORK_DIR/frames"
    mkdir -p "$FRAMES_DIR"
    ffmpeg -hide_banner -loglevel warning -y \
        -i "$INTERMEDIATE_MP4" \
        "$FRAMES_DIR/frame-%05d.png"
    gifski --fps "$FPS" --width "$WIDTH" --quality 90 \
           -o "$OUTPUT" "$FRAMES_DIR"/frame-*.png
else
    say "Encoding GIF with ffmpeg palettegen+paletteuse (gifski not installed; brew install gifski for better quality)"
    PALETTE="$WORK_DIR/palette.png"
    ffmpeg -hide_banner -loglevel warning -y \
        -i "$INTERMEDIATE_MP4" \
        -vf "palettegen=stats_mode=diff" \
        "$PALETTE"
    ffmpeg -hide_banner -loglevel warning -y \
        -i "$INTERMEDIATE_MP4" -i "$PALETTE" \
        -filter_complex "paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
        "$OUTPUT"
fi

# ── 3. Report size + warn if over target ─────────────────────────────
SIZE_BYTES=$(stat -f%z "$OUTPUT" 2>/dev/null || stat -c%s "$OUTPUT")
SIZE_MB=$(awk "BEGIN {printf \"%.2f\", $SIZE_BYTES / 1024 / 1024}")
say "Wrote $OUTPUT (${SIZE_MB} MiB)"

if (( $(awk "BEGIN {print ($SIZE_MB > $TARGET_MAX_MB)}") )); then
    cat >&2 <<EOF

⚠ GIF is ${SIZE_MB} MiB — above the ${TARGET_MAX_MB} MiB soft limit.
  Try one of:
    DURATION=10 $0 "$INPUT" "$OUTPUT"     # shorter clip
    WIDTH=720   $0 "$INPUT" "$OUTPUT"     # narrower
    FPS=12      $0 "$INPUT" "$OUTPUT"     # fewer frames
EOF
fi
