# Armin logo

The mark is a prerequisite graph shaped like a tree: cards are nodes, edges are prerequisites. Foundations are the heaviest nodes; learned tips carry the accent. The wordmark is "armin" in Source Serif 4 Semibold, outlined into paths so it never depends on an installed font.

Every file here is generated. Change the scripts, not the SVGs.

## Files

| File                                | Use                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `svg/armin-icon.svg`                | Primary icon: ivory graph on teal. App icons, avatars, large uses.     |
| `svg/armin-icon-ink.svg`            | Icon on ink, for dark surfaces.                                        |
| `svg/armin-icon-paper.svg`          | Icon on paper: ink graph, teal tips. Light surfaces and print.         |
| `svg/armin-icon-64.svg`             | Tuned for 48–64 px.                                                    |
| `svg/armin-icon-32.svg`             | Tuned for 32 px.                                                       |
| `svg/armin-icon-16.svg`             | Tuned for 16 px.                                                       |
| `svg/armin-adaptive-foreground.svg` | Android adaptive icon foreground, inside the 66% safe zone.            |
| `svg/armin-mark.svg`                | Bare mark, no square, for 32 px and above.                             |
| `svg/armin-mark-small.svg`          | Bare mark for 16–24 px. The web UI renders this geometry.              |
| `svg/armin-wordmark.svg`            | Outlined wordmark. `fill="currentColor"`; the only source of the word. |
| `svg/armin-lockup-light.svg`        | Icon + wordmark on paper.                                              |
| `svg/armin-lockup-dark.svg`         | Icon + wordmark on ink.                                                |

## Rules

- Never set "armin" in a font as the logo. Use `armin-wordmark.svg`, a lockup, or the web app's `<ArminWordmark>`.
- Pick the icon drawing for its rendered size. Don't scale the primary icon down to a favicon.
- Don't rebuild lockups by hand; `generate.mjs` sets the proportions. Keep clear space of at least a quarter of the icon side around one.
- Colors come from the app's Flexoki palette: teal `#1C6C66`, paper `#FFFCF0`, ink `#100F0F`, tips `#A2DECE` on teal, `#3AA99F` on ink, `#24837B` on paper.

## Where it is used

| Destination                                            | Source                           |
| ------------------------------------------------------ | -------------------------------- |
| `apps/web/public/favicon.ico` (16, 32, 48 px)          | `armin-icon-16/32/64.svg`        |
| `apps/web/public/apple-touch-icon.png` (180 px)        | `armin-icon.svg`                 |
| `apps/web/src/components/brand-paths.ts` → `brand.tsx` | small mark and wordmark geometry |
| `apps/mobile/assets/icon.png` (1024 px)                | `armin-icon.svg`                 |
| `apps/mobile/assets/adaptive-icon.png` (1024 px)       | `armin-adaptive-foreground.svg`  |
| `plugins/armin/assets/logo.png` (512 px)               | `armin-icon.svg`                 |

## Regenerating

From the repository root, after `pnpm install`:

```bash
# 1. Only when the wordmark's font, weight, or tracking changes (needs uv):
uv run --with fonttools --with brotli --with uharfbuzz design/logo/scripts/wordmark.py \
  node_modules/@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2 \
  design/logo/svg/armin-wordmark.svg 600

# 2. All SVGs and the web app's brand-paths.ts:
node design/logo/scripts/generate.mjs

# 3. App icon PNG/ICO files (needs rsvg-convert and ImageMagick):
design/logo/scripts/export.sh

# Optional: contact sheet of the icon family and lockups at real sizes.
design/logo/scripts/preview.sh
```

Source Serif 4 is licensed under the SIL Open Font License 1.1, which permits outlining its glyphs for a logo.
