# ISSUE-002 follow-up: graph toolbar at narrow widths

Date: 2026-10-21. Fix for ISSUE-002 in the [production-readiness report](../2026-10-21-production-readiness/report.md).
Before: [issue-002-narrow-toolbar.png](../2026-10-21-production-readiness/screenshots/issue-002-narrow-toolbar.png).

Environment: isolated worktree deployment started with `pnpm worktree:setup` and `pnpm dev`, signed in with the sample account from `docs/dev-worktrees.md`. Browser: headless Chromium through agent-browser with set CSS viewports. This is not a real phone or mobile-browser test.

## Cause

`prerequisite-graph.tsx` drew the toolbar as two independent React Flow panels. The back button and search sat in a `top-left` panel, and Tidy layout sat in a `top-right` panel. Each panel is positioned absolutely, so neither knew about the other. The left group had fixed widths: the deck label could be up to 176px (`max-w-44`) and the search input was always 160px (`w-40`), about 420px including padding. On a canvas narrower than about 560px, the right panel was drawn on top of the search field.

## Fix

The toolbar is now one panel that spans the canvas width (`left: 0; right: 0`), with the three controls in one flex row:

- The back button can shrink. Its deck name truncates with an ellipsis. The full name is still in the button's accessible name and in the tooltip `TruncatedLabel` shows when the name is cut off.
- Search has a 112px minimum and grows to fill the free space. Its input fills the box.
- Tidy is pushed to the right edge and never shrinks. Its visible label is "Tidy" until the canvas is at least 36rem wide, then "Tidy layout". The accessible name is always "Tidy layout".
- The canvas width is checked with a container query (`@container` / `@xl:`), not a viewport media query. The deck sidebar can make the canvas much narrower than the window.
- At `@xl` and wider, search returns to its fixed 160px width, so desktop looks the same as before.
- The full-width panel ignores pointer events, and only its controls receive them. Dragging in the gaps between controls still pans the graph.

DOM order and tab order are unchanged: Back, Search, Clear search (when shown), Tidy. Graph logic and the Tidy handler were not changed.

## Verification

| Check | Result |
| --- | --- |
| 390 × 844, deck "QA • Biology foundations 🧬" | Passed. Back 15–180px, search 188–300px, Tidy 308–375px. No overlap. Deck name truncated. [after-390.png](screenshots/after-390.png) |
| 320 × 700, search text "prerequisite" entered | Passed. Back 15–110, search 118–230 with Clear visible at 207–221, Tidy 238–305. Non-matching cards dimmed. [after-320-search.png](screenshots/after-320-search.png) |
| 768 × 844, 70-character deck name, sidebar open (canvas 512px) | Passed. Back 271–485, search 493–678, Tidy 686–753 with the short label. [after-long-name-768.png](screenshots/after-long-name-768.png) |
| 390 × 844, 70-character deck name | Passed. Same positions as the shorter name. [after-long-name-390.png](screenshots/after-long-name-390.png) |
| 1440 × 900 desktop | Passed. Back and 160px search on the left, "Tidy layout" at the right edge, matching the earlier design. [after-desktop-1440.png](screenshots/after-desktop-1440.png) |
| Keyboard | Passed. Tab moved Back → Search → Tidy. Tidy has a visible focus ring and can be activated with Enter. |
| Gaps between controls | Passed. Hit testing in the gaps returns `react-flow__pane`, so panning still works there. |
| Tidy layout effect | Not demonstrated. The sample graph was already in tidy positions, and a synthetic drag did not move a card. Pressing Tidy raised no error, and node positions stayed unchanged. The handler was not modified. |

`pnpm typecheck`, `pnpm lint`, and `pnpm --filter @armin/web build` passed. No automated tests were added.

To create the long-name cases, I renamed the isolated sample deck during the walkthrough. Its original name, "Agent sample library", was restored afterward.

## Out of scope

At 768px, the sidebar's deck list cuts off the long name right next to its due count ("me..3"). That is a separate sidebar layout issue and was not changed here.
