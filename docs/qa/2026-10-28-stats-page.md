# Stats page and review heatmap walkthrough

Date: 2026-10-28
Checkout: `t3/stats-page-review-heatmap`
Environment: local Convex deployment and web app from `pnpm dev`,
`http://armin-b3f000ae75.localhost:19536`, desktop Chromium through
agent-browser.

## Steps

1. Signed in with the worktree sample account (`test@example.com`).
2. Opened Decks. Confirmed the compact "Study activity" panel shows the
   empty-state heatmap, "No reviews yet.", and a working **View stats** link.
3. Opened Stats. Confirmed the deck picker defaults to All decks and the page
   renders the 52-week heatmap, 30-day review bars, 30-day due forecast,
   retention, streaks, and card-state totals.
4. Completed the sample review queue, then returned to Stats. The heatmap
   filled today's cell, Reviews per day showed 4, the streak moved to 1 day,
   and Cards by state moved all 4 units to Review.
5. Selected the sample deck in the picker. Card headings and hints changed to
   the deck name and kept the same totals.
6. Toggled dark mode and checked the Stats page and the Decks activity panel.
7. Captured a 390px-wide emulated viewport. Sections stack, the heatmap stays
   inside its card, and the deck picker spans the content width. This is an
   emulated viewport, not a real device check.

## Notes

- The sample library had no Review-state answers, so True retention correctly
  showed "No Review-state answers in the last 30 days." A rating that leaves a
  unit in Review state before the answer was not exercised.
- Due forecast bars appeared on the units' Oct 30 and Nov 6 due dates, with
  nothing folded into today, matching the review-unit rows.
- No console errors from the app; the only console noise was Vite reconnecting
  while the dev server restarted during backend edits.
