# Daily review limit, bury, and card info walkthrough

Date: 2026-10-28
Area: review queue budgets, bury/undo, card info
Branch: `t3/review-limit-bury-card-info`
Environment: isolated T3 worktree, `http://armin-1daf76d280.localhost:21848`, local Convex deployment, sample account `test@example.com`.
Browser: agent-browser managed Chromium, session `armin-review-features-5cc9adeaab72`, desktop viewport. No mobile or real-device checks.

## Toolchain checks

| Check | Result |
| --- | --- |
| `pnpm check` | Formatting clean, 0 lint/type errors |
| `pnpm --filter @armin/web build` | Built |

## App checks

| Area | Steps | Result |
| --- | --- | --- |
| Card info from review | Review → Card info button | Sheet showed the deck, front/back, one New review unit with due time, stability 0.00, difficulty 0.00, retrievability `—`, reps 0, lapses 0, and "No reviews yet." |
| Card info history after a rating | Rated Good, opened Card info on the same card from Browse | Unit showed Review, v2, stability 2.31, difficulty 2.12, retrievability 100%, reps 1. History row showed the review time, Good, pre-review state New, and the 2-day interval. |
| Card info from a Browse tile | Tile actions → Card info | Same dialog opened from the tile menu; Escape closed it and focus returned. |
| Bury from the review menu | Review → Flashcard actions → Bury until tomorrow | Due count fell 3 → 2, the card left the session, Undo became enabled, and "Card buried until tomorrow." appeared. |
| Undo bury | Pressed Undo | Due count returned to 3 and the buried card came back through the live queue; Undo disabled again. |
| Bury shortcut | Focused the page header, pressed `b` | Same bury behavior; pressing `b` while the type-answer field had focus typed the letter instead (central input suppression). |
| Card info shortcut | Pressed `i` | Card info opened for the current card. |
| Daily review limit | Settings → Reviews per day = 2 with one review already answered today | Sidebar due count fell 3 → 1 (one review budget left), matching the queue/status/deck selection path. |
| Reset limit to unlimited | Clicked "Reset Reviews per day to preset default" | Field emptied and the due count returned to 3. |

## Not checked

- A flashcard that generates several review units (the sample library has none); the bury mutation patches every unit by `flashcardId`, sharing the same path as the reviewed one-unit case.
- The deck page's tile menu, which renders the same `FlashcardTile` action path as Browse.
- Mobile.
