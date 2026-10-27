# Performance: live subscriptions, indexed Browse, and graph panning

Validated locally on 26 October 2026 at the isolated worktree origin
`http://armin-5533c3c902.localhost` (dev server on port 25244, production build
served by `vp preview` on port 25300), against this worktree's local Convex
deployment. Test data: the seeded sample deck plus a generated 717-card deck
with 400 prerequisite links. Local backend timings are inflated by a machine
short on memory; on Convex cloud, network delay replaces part of that cost.

## Earlier fixes in this branch (headless Chromium, production build)

- First card open: the editor dialog no longer waits on React's Suspense
  reveal throttle. First open 80–115 ms, down from about 400 ms.
- Rating in review advances immediately and saves in the background, in order,
  with idempotent request IDs. Next card in 11–18 ms, down from 1.0–1.5 s. Five
  ratings reached the server in order; Undo during in-flight saves waited for
  them, then reverted the right review.
- Card dialog paints a read-only copy first and swaps in the editor without a
  height change (checked for basic, cloze, typed-answer, and empty cards).
  Dialog visible in about 13 ms, editor ready at 48–69 ms, down from one 90 ms
  task. The dialog still focuses the first field without scrolling.
- Bundle: in-app Markdown uses `@tanstack/markdown`; react-markdown loads only
  on the legal pages. Graph page 81 → 68 KB gzip, layout worker 26 → 14 KB.
  Tidy layout runs in the worker and lays out the 717-card graph.

## Live subscriptions

- Signed in with the sample account in agent-browser. With a deck page open in
  one tab and review in another, three ratings in the review tab changed the
  deck tab's due count from 10 to 7 and the sidebar badge, without a reload or
  any refetch code.
- Undo restored the badge (7 → 8). Renaming the deck updated the deck tile and
  the sidebar. Adding a card raised the deck header to 718 and listed it first
  in Browse ("Newest first"); archiving it moved it to the archived count, and
  deleting it removed it.
- Study clock: rated a learning card Again (due 10 minutes later). With no
  further interaction, the badge rose from 7 to 8 two seconds after the card's
  due time.
- Review pages and their hover prefetch now share one query key, and the
  sidebar badge reads `review.status` (a count) instead of the full queue.

## Browse summaries and counters

- `maintenance:backfillSummaries` built 721 summaries and two deck counters.
  Counters matched a direct count from review units for both decks (717 cards,
  920 new units, 7 learned), and again after the ratings, Undo, create,
  archive, delete, and rename above (918 new units; zero summary mismatches).
  The rename updated every summary's deck sort key.
- Paging through every one of the 14 sorts, 30 cards at a time, returned each
  card exactly once: 717 for the deck (24 pages) and 721 for the library.
  "Due soon" order had no violations. Search ("tcp", 72 cards) and the Review
  state filter (8 cards) matched direct scans. A page pinned to its end cursor
  returned the same cards.

## Graph panning (headed Chromium, real GPU)

Chromium 155 on Wayland with hardware rendering (ANGLE, Intel UHD Graphics,
Tiger Lake GT1), 1502 × 691 viewport at 1.25× scale, 60 Hz display. A script
drove React Flow's pan handler with one mouse move per frame for 4 seconds, in
a bounded figure-eight over the card rows, and recorded frame times and long
tasks. Production build.

| Zoom | Cards on screen | Before    | After     |
| ---- | --------------- | --------- | --------- |
| 100% | 6–9             | 56–59 fps | 59–60 fps |
| 50%  | 13–25           | 51–56 fps | 60 fps    |
| 25%  | 43–49           | 26–38 fps | 59–60 fps |
| 10%  | 104–111         | 14–19 fps | 26–46 fps |

- Cause: Chrome's invalidation tracking showed "Affected by :has()" on the
  `html` element, the route wrappers, and the sidebar wrapper for every card
  mounted or unmounted while panning, restyling about 3,900 elements per
  frame. Removing those rules in the page, with the layout held identical,
  reproduced the gain before the fix was made.
- Fix: the full-bleed layout and document scrolling are attributes set while
  rendering from route `staticData`; the unused inset-sidebar `:has()` class is
  gone. Style recalculation during a 10% pan fell from 2.2 s to 0.19 s per 4 s
  (largest recalculation 226 elements).
- Layout checks: the graph is still full-bleed; the Decks page keeps its
  1024px page box. Signed out, `/`, `/terms`, and `/docs/mcp` scroll the
  document, and their server-rendered `<html>` already carries
  `data-scroll="document"`; `/sign-in` keeps the locked root.
- At 10% zoom the remaining cost is mounting about 110 full card nodes as they
  enter and leave the view (JavaScript 2.5 s and paint 1.9 s per 4 s).

## Project checks

- `pnpm check`: passes, zero errors and 60 existing warnings.
- `pnpm --filter @armin/web build`: passes.
- `pnpm --filter @armin/mobile check:bundle`: passes.
- Not verified: production deployment, the production backfill, and Safari or
  Firefox behavior.
