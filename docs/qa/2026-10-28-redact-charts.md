# TanStack Redact and TanStack Charts walkthrough, 2026-10-28

## Environment

Tested uncommitted changes on `claude/armin-integrations-9e908c`, based on
`ea5a7fe`, using the worktree's isolated local Convex deployment and sample
account. Started the app with `pnpm dev`; the web origin was
`http://armin-b69218dd35.localhost:19808`. Browser checks used a dedicated
`agent-browser` Chromium session. Viewport sizes were emulated (1280×1000,
1280×800, and 390×844); no real phone was used. No production deployment or
data was used.

## Changes under test

- `@tanstack/redact` 0.2.1 replaces React and React DOM in the web client and
  server render through its Vite plugin. The Cloudflare plugin now loads through
  `@tanstack/redact/cloudflare`, which requires `@cloudflare/vite-plugin`
  exactly 1.65.0 and Miniflare resolving Undici 7.30.1 (workspace override).
  0.2.3 was newer than the workspace's minimum release age, so 0.2.1 is pinned
  instead of adding an exception.
- `@tanstack/charts` 1.1.0 draws the Stats page's "Reviews per day" and "Due
  forecast" bars (`barY`) and the review-activity heatmap on the Stats and Decks
  pages (`cell`), replacing the hand-built CSS bars and grid.

## Passed checks

- Development: the landing page server-rendered, hydrated, and its review demo
  responded to "Show answer". Signed in with the sample account, answered three
  review units as Good, and opened Stats with no console or page errors.
- Stats: both bar charts and the 52-week heatmap rendered in the app's accent
  colors. Hovering a bar showed "Oct 28, 2026: 3 reviews"; hovering the heatmap
  cell showed "Wed, Oct 28, 2026: 3 reviews". The forecast's first tick reads
  "Today". Dark mode recolored all charts from the theme variables.
- At 390 px wide, the bar charts fit the panel and the heatmap kept its
  horizontal scroll with the weekday labels aligned to rows.
- Decks page: the compact 16-week heatmap rendered and marked today's reviews.
- Redact compatibility smoke test: the New deck dialog (Base UI) opened and
  closed, the Add card dialog mounted both Milkdown editors, and the prerequisite
  graph (xyflow) rendered all four nodes after client navigation.
- Production: `pnpm build:cloudflare` succeeded, and `vp preview --mode
  cloudflare` served server-rendered `/` and `/sign-in` from workerd. The
  production client hydrated and the landing demo responded to clicks.
- Client JavaScript across all chunks fell from 1,410 KB to 1,370 KB gzipped
  compared with the same build without the Redact plugin.
- `pnpm check`, `pnpm --filter @armin/web build`, and
  `pnpm --filter @armin/mobile check:bundle` passed.

The browser logs Vue's feature-flag warning when Milkdown Crepe loads. Crepe
already depended on Vue before this change.

## Not covered

No real Safari, Firefox, or phone browser was tested; Redact documents those as
less verified than Chromium. Image upload, export, Anki import, and the hosted
Cloudflare deployment were not exercised.

Screenshots are in [`2026-10-28-redact-charts/`](./2026-10-28-redact-charts/).
