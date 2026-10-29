# Design-system tooltips walkthrough

Date: 2026-10-28
Checkout: `claude/design-system-tooltips` (main checkout)
Environment: local Convex deployment and web app from `pnpm dev`,
`http://localhost:3000`, desktop Chromium through agent-browser.

## Steps

1. Signed in with the sample account (`test@example.com`).
2. Decks: hovered a deck card's **Deck actions** button. The Base UI tooltip
   showed "Deck actions" (`deck-actions.png`).
3. Deck page: hovered **Deck settings**; tooltip "Deck settings"
   (`deck-settings.png`).
4. Review: hovered **Card info**. The tooltip shows "Card info" with the
   current `review.info` binding (`I`) as a key chip, read from the keymap
   instead of a hard-coded "(I)" (`review-card-info.png`).
5. Settings: toggled Interval fuzz to reveal its reset button, hovered it
   ("Reset to preset default", `settings-reset.png`), then clicked it, which
   restored the setting.
6. Graph: hovered Zoom out, Zoom in, Reset zoom to 100%, and Fit view; each
   showed its tooltip (`graph-fit-view.png`). Searched and pressed Enter; the
   status line now reads "1 of 4 · Enter for next, Shift+Enter for previous"
   (`graph-search-status.png`). The old `title` hint could never appear,
   because the status line ignores the pointer.
7. Created a deck with a long name. In the sidebar its label truncates and
   hovering shows the full name; the short "Agent sample library" shows no
   tooltip (`sidebar-truncated-deck.png`). Deleted the QA deck afterwards.
8. On the review, graph, and settings pages, `document.querySelectorAll("[title]")`
   returned 0.

## Not exercised

- Card info **Due** and review-history interval tooltips need a reviewed
  card; the sample cards were all new, so those stats show "—" with no tooltip.
- AI connection timestamps need a connected assistant; none was connected.
- Markdown image captions and the deck link in the review header (tooltip
  only when clipped) were type-checked and built but not hovered.
