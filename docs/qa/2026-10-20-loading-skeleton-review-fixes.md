# Loading skeleton review fixes

Checked this worktree's web app at
`http://armin-6c1c59ad7d.localhost:20290` in headless Chromium driven by
agent-browser. Used emulated viewports of 390 by 844, 800 by 850, and 1280 by
850 pixels. No physical devices or additional browser engines were tested.

## Review link while loading

Signed in through the normal form with the worktree's synthetic account. Saved
the browser session locally, then reopened Browse with an init script that held
the Convex WebSocket pending. The account query stayed unresolved, leaving the
real loading shell and its Review link on screen.

At 390 pixels wide:

- The Review link's visible text had computed `display: none`.
- The accessibility snapshot still identified it as a link named `Review`.
- Its `aria-label` was `Review`.
- Focusing the link made it the active element, with destination `/review` and
  accessible label `Review`.

## Browse filter layout

Compared Browse after its sample cards loaded with the same page held in the
account-loading state. The skeleton now gives State, Deck, and Tag their loaded
width classes: `w-36`, `w-52`, and `w-44`. Sort retains `w-44`.

Measured the filter bar and the top of the card grid with
`getBoundingClientRect()`. All measurements below are CSS pixels.

| Viewport width | Loading bar height | Loaded bar height | Loading grid top | Loaded grid top |
| --- | --- | --- | --- | --- |
| 390 | 298 | 298 | 538 | 538 |
| 800 | 154 | 154 | 382 | 382 |
| 1280 | 82 | 82 | 310 | 310 |

At 800 pixels, Sort occupies the second row in both states. The previous
82-to-154-pixel transition no longer occurs. Inspected screenshots of the loading
layout at 390 and 800 pixels and the loaded layout at 800 pixels.

## Validation

- `pnpm typecheck` passed. The web workspace ran; the other workspaces used
  Turbo's cache.
- `pnpm lint` passed.
- `pnpm --filter @armin/web build` passed. Vite retained its large-chunk advisory.
- `pnpm --filter @armin/mobile check:bundle` passed for Android and iOS.
- `pnpm test` completed with no test tasks configured.
- Impeccable's detector reported no deterministic issues in the two changed UI
  files.

No automated test suites were added, following the web migration validation
policy. Browser state, measurements, and screenshots remain local and are not
part of the commit.
