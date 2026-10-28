# Browse list virtualization walkthrough

Date: 2026-10-28
Checkout: `claude/stats-heatmap-polish-be86e1`
Environment: local Convex deployment and web app from `pnpm dev`,
`http://armin-b69218dd35.localhost:19808`, desktop Chromium through
agent-browser. Test account with 110 flashcards (4 Browse pages of 30).

## Change

Browse now renders its tiles through `VirtualFlashcardGrid`, the same
virtualized grid as the deck page, instead of mounting every loaded card. The
grid's loader row replaces Browse's own `IntersectionObserver` sentinel for
loading the next page. `VirtualFlashcardGrid` is generic over the card type so
Browse tiles keep their deck name.

Other lists were left as they are: card info history, the prerequisite link
picker, and agent activity are capped; deck lists hold at most 200 small rows;
the prerequisite graph already renders only visible nodes.

## Steps

1. Opened Browse at 1440px and scrolled to the end. Pages loaded in turn
   ("Showing 60 of 110", "Showing 90 of 110", then "110 flashcards"). With
   all 110 loaded, 23 tiles were mounted; at the top, 27.
2. Scrolled back to the top. The first card ("Capital of Oman") and the
   three-column layout render as before.
3. From the bottom of the list, searched "Capital of". The list reset to the
   top with "Showing 30 of 46 matching cards" and loaded the rest on scroll.
4. Opened the World capitals deck page and scrolled to the end: 46 cards
   loaded, 19 tiles mounted.
5. Reloaded Browse at a 390px emulated width: one column, 7 tiles mounted
   after loading every page, and no horizontal page overflow. This is an
   emulated viewport, not a real device check.

No app console errors.
