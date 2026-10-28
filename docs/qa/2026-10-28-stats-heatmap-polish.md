# Stats page and Decks heatmap polish walkthrough

Date: 2026-10-28
Checkout: `claude/stats-heatmap-polish-be86e1`
Environment: local Convex deployment and web app from `pnpm dev`,
`http://armin-b69218dd35.localhost:19808`, desktop Chromium through
agent-browser.

## Steps

1. Signed in with the worktree sample account (`test@example.com`), which had
   3 reviews today.
2. Opened Decks. The Study activity panel shows a header row with **View
   stats**, a Today / Streak / Total summary (3 reviews, 1 day, 3 reviews), and
   a 26-week calendar with month labels, weekday labels, and a legend. Today's
   cell is outlined and uses the full accent, since it is the busiest day.
3. Hovered today's cell. The tooltip read "Wed, Oct 28, 2026: 3 reviews"; the
   outline does not intercept the pointer.
4. Opened Stats. Every panel has the same header (title, hint, divider). The
   52-week calendar has month labels and the today outline. Reviews per day and
   Due forecast each show a headline total ("3 reviews · 0.1 a day on average ·
   best day 3", "3 review units · Nothing due today · busiest day 3") over bars
   with short date ticks. Retention shows the empty state, Streaks shows the
   current streak plus longest streak and days studied, and Cards by state shows
   a distribution bar (1 New, 3 Review) above six counts with shares.
5. Switched to dark mode and checked Stats. Calendar levels, bars, and the
   state bar stay legible.
6. Captured a 390px-wide emulated viewport for Decks and Stats. Summary figures
   sit in one row above the calendar, both calendars open scrolled to the
   current week, and the page has no horizontal scroll (`scrollWidth` 390).
   This is an emulated viewport, not a real device check.

## Notes

- The sample library has reviews on one day only, so the intermediate calendar
  shades were checked through the legend, not through real multi-day data.
- Validation: `pnpm check`, `pnpm --filter @armin/web build`, and
  `pnpm --filter @armin/mobile check:bundle` pass.

## Follow-up: outline edge and synthetic history

- Today's outline on the Decks calendar was clipped on its right side. It is
  now drawn inside its cell, and the calendar keeps 4px clear past the newest
  column, because the scroller clips at its edge and the outline otherwise sat
  on that last, sometimes fractional, pixel. Measured 4px of room at 1100,
  1280, 1366, 1440, 1536, and 1920px wide, and at 390px after a fresh load.
- Loaded synthetic history into the test account through the first-party import
  API (`imports.start`, `addCards`, `addReviewLogs`, `finish`), with schedules
  and ratings simulated by ts-fsrs: "Spanish vocabulary" and "Chemistry basics"
  across the last 330 days, plus "World capitals" studied daily for 36 days with
  one missed day. In total, 106 new cards and 622 past reviews (625 with the
  sample's own reviews).
- Rechecked Decks: Today 6, Streak 30 days, Total 463 over 26 weeks, with all
  shading levels visible. Rechecked Stats: 625 reviews in 52 weeks, 220
  reviews in 30 days (7.3 a day, best day 23), 41 review units due in the next
  30 days, 88% retention (119 of 136 recalled, 17 forgotten), 30-day streak,
  163 days studied, and 13 New / 97 Review units. No app console errors.
- "Nothing due today" in the forecast matches the review-unit rows: no
  scheduled unit is due today, and the Review badge's 7 are new units within
  the daily new-unit limit.

## Follow-up: bar chart baseline spacing

- Reviews per day and Due forecast no longer label the y-axis zero (the
  baseline marks it), keep 10px between each axis and its labels, and anchor
  the first and last date labels inward. Rechecked both charts with the
  synthetic history in light and dark mode and at a 390px emulated width, along
  with the calendar, retention bar, streaks, and state bar. No page overflow.
