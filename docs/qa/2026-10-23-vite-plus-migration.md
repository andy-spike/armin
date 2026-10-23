# Vite+ migration walkthrough

Date: 2026-10-23
Area: toolchain (`vp check`, `vp build`, `vp run`), dev launcher, and the screens touched by lint fixes
Branch: `t3/migrate-to-vite-plus`
Environment: isolated T3 worktree, `http://armin-e47a5ac39d.localhost:24120`, local Convex deployment, sample account `test@example.com`.
Browser: agent-browser managed Chromium, session `vite-plus-b75fccfbc0f9`, desktop viewport. No mobile or real-device checks.

The branch replaces ESLint, Prettier, Turborepo, and per-package `tsc` with
Vite+ 1.4 (see ADR 0003), reformats with Oxfmt, and fixes the lint errors
Oxlint enforces. The walkthrough checks that the toolchain covers what the old
one did and that the code touched by lint fixes behaves the same.

## Toolchain checks

| Check | Result |
| --- | --- |
| `tsgo` (TypeScript 7) on each workspace before migrating | web, core, mobile, Convex: 0 errors |
| Planted `const probe: number = "…"` in each of the four workspaces | `vp check` reported all four; a web file importing `@/lib/utils` resolved the alias |
| `pnpm check` | Formatting clean (232 files), 0 lint/type errors, 59 tracked warnings, about 4 s |
| ESLint (before) vs Oxlint (after) lint time | 11 s vs 0.6 s |
| `pnpm --filter @armin/web build` and `build:cloudflare` | Both built. `dist/server/index.js` 669.6 kB vs 670.5 kB on `master`; the `vite:css-post` sourcemap warning also appears on `master` |
| `pnpm --filter ./apps/mobile check:bundle` | Android and iOS bundles exported |
| `pnpm --filter ./apps/mobile check:expo` | Fails on `expo` 57.0.28 → 57.0.31 and `expo-network` patch releases published upstream; versions are unchanged from `master` and CI doesn't run it |
| `pnpm worktree:setup` | Created the deployment and seeded the sample library (exercises the `setup-worktree.mjs` pid guard) |
| `pnpm dev` | Convex and Vite started in parallel; Vite listened on the worktree's port 24120, so `ARMIN_WEB_PORT` passed through `vp run` |
| Ctrl+C typed into a pseudo-terminal running `pnpm dev` | All tasks stopped, ports 24120–24123 free |
| SIGTERM to the launcher process only | On `master` (Turborepo) everything stopped. With `vp run`, Vite and Convex were left running until the launcher started `vp run` in its own process group; after that fix, all tasks stopped and the ports were free |

## App checks

| Area (lint fix) | Steps | Result |
| --- | --- | --- |
| Sign in, Decks (`index.tsx` memo on query data) | Signed in, opened Sort by | Deck list rendered; all ten sort options listed ([home](2026-10-23-vite-plus-migration/home.png)) |
| Sidebar theme button (a11y suppression) | Clicked "Dark mode" | Theme switched to dark; button renamed "Light mode" |
| Browse (`browse.tsx` load-more effect, tag memo) | Opened Browse, Filter by tag | Four cards; tag option `demo` listed ([browse](2026-10-23-vite-plus-migration/browse-dark.png)) |
| Deck page (tag memo) | Filter by tag → `demo` | Four cards remained ([deck](2026-10-23-vite-plus-migration/deck-tag-filter.png)) |
| Review (`review-session.tsx` Enter-to-reveal) | Blurred focus, pressed Enter, rated Good | Answer and rating buttons appeared ([review](2026-10-23-vite-plus-migration/review-revealed-by-enter.png)); Undo enabled and next card shown |
| Card editor (`markdown-editor.tsx` upload error) | Edit flashcard, uploaded an SVG | "Image not added — Use a PNG, JPG, GIF, WebP, BMP, or AVIF image." toast ([toast](2026-10-23-vite-plus-migration/editor-upload-error-toast.png)) |
| Graph (`use-background-layout.ts` suppression) | Opened the deck graph | Cards laid out with the prerequisite edge; minimap shows all four ([graph](2026-10-23-vite-plus-migration/graph.png)) |
| Keyboard settings (`keybindings-provider.tsx` deps) | Rebound "Go to Settings" to G then X, reloaded, Reset all | Binding persisted across reload ([settings](2026-10-23-vite-plus-migration/keyboard-rebind-persisted.png)); Reset all restored defaults and disabled itself |

Not checked in the browser: the image occlusion review `alt` text change and
the mobile undo button's request id (suppression only, no code change).
