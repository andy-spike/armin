#!/usr/bin/env bash
# Contact sheet of the icon family at real sizes (16/32 also enlarged 4x) and the lockups.
# Usage: design/logo/scripts/preview.sh [out.png]   (default: /tmp/armin-logo-preview.png)
set -e
out="$(realpath -m "${1:-/tmp/armin-logo-preview.png}")"
cd "$(dirname "$0")/../svg"; B='#F2F0E5'; t=$(mktemp -d)
for n in armin-icon armin-icon-ink armin-icon-paper; do rsvg-convert -w 240 $n.svg -o $t/$n.png; done
rsvg-convert -w 64 armin-icon-64.svg -o $t/64.png; rsvg-convert -w 32 armin-icon-32.svg -o $t/32.png; rsvg-convert -w 16 armin-icon-16.svg -o $t/16.png
magick $t/32.png -filter point -resize 128x128 $t/32x.png; magick $t/16.png -filter point -resize 128x128 $t/16x.png
rsvg-convert -w 400 armin-lockup-light.svg -o $t/ll.png; rsvg-convert -w 400 armin-lockup-dark.svg -o $t/ld.png
magick -background $B $t/armin-icon.png \( -size 20x240 xc:$B \) $t/armin-icon-ink.png \( -size 20x240 xc:$B \) $t/armin-icon-paper.png +append $t/r1.png
magick -background $B \( $t/64.png -gravity center -extent 110x150 \) \( $t/32.png -gravity center -extent 70x150 \) \( $t/16.png -gravity center -extent 60x150 \) \( $t/32x.png -gravity center -extent 170x150 \) \( $t/16x.png -gravity center -extent 170x150 \) +append $t/r2.png
magick -background $B $t/ll.png \( -size 20x120 xc:$B \) $t/ld.png +append $t/r3.png
magick -background $B -gravity northwest $t/r1.png \( -size 10x20 xc:$B \) $t/r2.png \( -size 10x20 xc:$B \) $t/r3.png -append -bordercolor $B -border 20 "$out"
echo "$out"
