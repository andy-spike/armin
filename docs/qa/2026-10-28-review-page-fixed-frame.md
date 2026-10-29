# Review page fixed frame walkthrough

Date: 2026-10-28
Checkout: `claude/design-system-tooltips` (main checkout)
Environment: local Convex deployment and web app from `pnpm dev`,
`http://localhost:3000`, desktop Chromium through agent-browser. Mobile sizes
are emulated viewports (390×844), not a real device.

## Steps

1. Review at 1280×720, dark theme: header, progress row, card, and answer bar
   fit the window; the route's scroll container had 0px of overflow
   (`before-desktop-answer.png` vs `after-desktop-answer.png`).
2. 1440×1000, light theme: the card caps at 32rem and centers between the
   progress row and the answer bar, which stays on the bottom edge
   (`after-tall-light.png`).
3. 390×844 emulated: header and deck picker share one row, the subtitle hides,
   and the card fills the space above the pinned bar (`after-mobile-light.png`).
4. 1280×560 with a long answer injected into the card: the card scrolls inside
   itself with faded edges, the page stays fixed, and ArrowDown scrolled the
   card body by 90px (`after-long-card-short-window.png`).
5. Keyboard: Space revealed, `3` rated Good (card 2 / 3, progress 33%), `Z`
   undid it (card 1 / 3, progress 0%).
6. Deck review and Cram (type-answer card, `after-cram-type-answer.png`) use the
   same frame with no page overflow.
7. Switched the theme back to dark afterwards.

## Not exercised

- The finished-session panel and Undo from it, the error panel, and the stale
  card and offline alerts were built and type-checked but not triggered.
- Image occlusion cards were not in the sample library.
