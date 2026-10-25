# Landing page at `/` for signed-out visitors

Date: 2026-10-23. Branch: `t3/landing-page`.

Environment: isolated T3 worktree deployment, http://armin-17f3bede38.localhost:18904,
`pnpm worktree:setup` then `pnpm dev`. Browser: agent-browser managed Chromium on
desktop Linux. The 1440 × 900 and 390 × 844 viewports are emulated CSS widths. No
real phones, Firefox, or Safari were used.

## What changed

- `apps/web/src/routes/_app.tsx`: a signed-out request for `/` now renders
  `LandingPage` from the `_app` frame instead of redirecting to `/sign-in`. That
  includes the landing title and description meta. Every other signed-in route
  still redirects to sign-in, and signed-in users still get the decks home at `/`.
- `apps/web/src/routes/_app/index.tsx`: skips the decks prefetch and the
  "Decks" title while the landing page is showing.
- `apps/web/src/components/landing/`: the page itself, the interactive
  prerequisite graph in the hero (`unlock-graph.tsx`), and a working miniature
  of the review screen (`review-demo.tsx`).
- `apps/web/src/styles/app.css`: graph sizing, the edge reveal, and the section
  spine with nodes that go from locked to learned. While the landing page is
  mounted, `html` and `body` are allowed to scroll (`html:has(.landing)`). The
  app frame keeps the root locked and scrolls inside its own panes.

## Walkthrough

1. **Server render.** `curl /` while signed out returns the landing HTML with
   the title "Armin · Flashcards that respect what comes first" and the
   headline in the markup.
2. **Hero graph.** The graph plays itself (see the 2026-10-25 polish pass
   below). The original interactive version is shown in the
   [fold](2026-10-23-landing-page/screenshots/desktop-1440-fold.png) and
   [after learning](2026-10-23-landing-page/screenshots/desktop-1440-after-space.png)
   captures.
3. **Review demo.** With focus in the demo, Space shows the answer and moves
   focus to Good. Pressing 3 grades the card, the live region announces
   "Good: back in 3d", and focus returns to Show answer.
4. **Spine.** Each section's node starts dashed with a lock and turns solid
   cyan with a check once the section scrolls into view. The closing sign-up
   node unlocks last. Partway down the page the reached states read
   `true,true,false,false,false`.
   [scrolled](2026-10-23-landing-page/screenshots/desktop-1440-spine-scrolled.png),
   [full page after scrolling to the end](2026-10-23-landing-page/screenshots/desktop-1440-full.png).
5. **Mobile, 390 wide.** Nothing scrolls sideways (`scrollWidth` 390). The
   graph starts inside the first viewport, and the code sample fits.
   [fold](2026-10-23-landing-page/screenshots/mobile-390-fold.png),
   [full page](2026-10-23-landing-page/screenshots/mobile-390-full.png).
6. **Signed in.** I signed in as `test@example.com`. `/` shows "Decks · Armin"
   and no landing page.
   [decks](2026-10-23-landing-page/screenshots/signed-in-decks.png).

The full-page captures were taken after scrolling through the page, so the
spine nodes show the state a reader would see.

Checks: `pnpm check` (0 errors) and `pnpm --filter @armin/web build` pass.

## Illustrative content to confirm

- The example deck (dynamic programming), its cards, and the review intervals
  (10m / 1d / 3d / 8d) are illustrative. The hero labels the deck "Example deck".
- "Create a free account" and "on the web and the mobile app" are product
  claims. Confirm both before deploying.

## Polish pass, 2026-10-25

Same environment and emulated viewports (1440 × 900, 390 × 844).

- The "Space" key badges are gone from "Mark as learned" and "Show answer".
  The hero no longer turns the first Space press into "learn a card"; Space on
  the body scrolled the page and the counts stayed at "0 learned".
- The hero graph is now an animation instead of a control. Once the graph is
  40% in view, a cursor glides to each due card, clicks it (the pointer presses
  and a cyan ring spreads), the card turns learned, and the cards resting on it
  unlock along cyan edges. It learns the foundations, then Recursion, Lookup
  tables, Memoization, and Dynamic programming. It holds the finished tree for
  about 3 seconds and starts over, and it stops while scrolled out of view. The
  caption bar, "Mark as learned" button, and counts row are gone; only an
  "Example deck" label remains. The cursor's tip lands in each card's right
  third so it doesn't cover the label.
- With `prefers-reduced-motion: reduce` emulated, the cursor is hidden
  (`display: none`) and the cards still change state step by step: 2 learned
  after 3.5 s. No console errors.
- The hero subhead names the category: "Spaced-repetition flashcards that unlock
  as their foundations are learned." The desktop paragraph glosses FSRS as "the
  spaced-repetition scheduler".
- The card-types list beside the sample card has a "Card types" heading, and
  Basic carries a check, so it reads as "this card is Basic" rather than tabs.
- At 390 wide `scrollWidth` is 390, and the animation plays inside the graph.

Checks: `pnpm check` (0 errors, no warnings in `components/landing`).

### Animation polish

- Each step now runs in this order: the cursor glides to the card (700 ms,
  `--ease-in-out`). The card shows a hover tint and ring only when the cursor
  arrives. The pointer and card press down (140 ms), and the card fills as
  learned. The lines out of it draw upwards (450 ms `clip-path` reveal), and
  only when they arrive do the cards above flip from locked to due, with a
  short 400 ms settle. Before this pass, the next cards unlocked while the
  lines were still fading in.
- The cursor moves with `transform` instead of `left`/`top`.
- A restart crossfades instead of snapping every card shut. Logged in the
  page: the stage fades to 0 in about 0.3 s, the cards reset while hidden, and
  it fades back in at "0 learned".
- Leaving the view rewinds the demo, so it restarts from the foundations.
- New motion tokens `--ease-out` and `--ease-in-out` sit beside
  `--ease-out-quart` in `app.css`.
- Reduced motion: cursor `display: none`, cards still step (2 learned after
  4.5 s), lines appear without the reveal. No console errors.

