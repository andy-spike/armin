#!/usr/bin/env bash
# Renders the app icon files from the logo SVGs. Requires rsvg-convert and ImageMagick.
# Usage (from anywhere): design/logo/scripts/export.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/../../.." && pwd)"
svg="$root/design/logo/svg"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Web: one .ico holding the hand-tuned 16, 32 and 48 px drawings, plus the iOS home-screen icon.
rsvg-convert -w 16 -h 16 "$svg/armin-icon-16.svg" -o "$tmp/16.png"
rsvg-convert -w 32 -h 32 "$svg/armin-icon-32.svg" -o "$tmp/32.png"
rsvg-convert -w 48 -h 48 "$svg/armin-icon-64.svg" -o "$tmp/48.png"
magick "$tmp/16.png" "$tmp/32.png" "$tmp/48.png" "$root/apps/web/public/favicon.ico"
rsvg-convert -w 180 -h 180 "$svg/armin-icon.svg" -o "$root/apps/web/public/apple-touch-icon.png"

# Mobile: opaque 1024 px app icon (iOS rejects transparency) and Android's adaptive foreground.
rsvg-convert -w 1024 -h 1024 "$svg/armin-icon.svg" -o "$root/apps/mobile/assets/icon.png"
rsvg-convert -w 1024 -h 1024 "$svg/armin-adaptive-foreground.svg" -o "$root/apps/mobile/assets/adaptive-icon.png"

# Plugin directory listing icon.
rsvg-convert -w 512 -h 512 "$svg/armin-icon.svg" -o "$root/plugins/armin/assets/logo.png"

# Strip metadata so re-running produces identical files.
for f in apps/web/public/apple-touch-icon.png apps/mobile/assets/icon.png apps/mobile/assets/adaptive-icon.png plugins/armin/assets/logo.png; do
  magick "$root/$f" -strip "$root/$f"
done
echo "Exported app icons."
