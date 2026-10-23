# V1 fix walkthrough: review sessions and scheduling

Date: 2026-10-22
Branch: `t3/fix-review-scheduling-qa`
Base commit: `550ab86` (QA reports `2026-10-22-v1-qa-review-scheduling` and
`2026-10-22-v1-qa-cross-cutting`)
Environment: isolated T3 worktree deployment, `http://armin-0e1d240dd4.localhost:19856`
(local Convex at `http://127.0.0.1:19858`).
Browser: agent-browser managed Chromium 151 on Linux. Viewport widths are
emulated CSS widths, not real devices or real mobile browsers.
Account: `test@example.com` / `armin1234`.

Evidence screenshots are in `screenshots/`; axe result files are in this
directory.

## Design decision: the Frontier cap is an admission budget

The two QA reports document a new card that can be shown, then rejected by
`review.rate` after the account-wide new-unit budget is spent. The fix follows
the option the QA report allows: **the cap is checked when the queue admits a new
unit, and an already-presented card stays ratable.**

`selectSession` remains the only admission gate. It selects at most the remaining
new-unit capacity (plus a grouped sibling batch), and the selection is stable
for the study day. `checkEligible` no longer recomputes that selection at rating
time. This matches `packages/core/CONTEXT.md` (the Frontier is the day's
introduction budget) and ADR 0021 (new material keeps a flexible account-wide
daily budget; the chosen deck consumes the remaining capacity). The cap was
already deliberately soft for grouped siblings, so rating a card that was
admitted under the budget is consistent with that rule rather than a new
exemption.

The review screen's due count is now derived from the session's unreviewed
cards, so it cannot say "0 due" while a card is on screen. The sidebar count is
outside this task's file scope (see "Out of scope" below).

## ISSUE-1 (major): an admitted new card can be rejected as over the limit

Status: **fixed**.

Root cause: `checkEligible` in `packages/backend/convex/model/queue.ts`
recomputed `selectSession` for the unit's deck on every rating. Once other
ratings, an unlock, or a settings change consumed the budget, the recomputed
frontier no longer contained the card that was already on screen.

Change:
- `packages/backend/convex/model/queue.ts`: `checkEligible` now validates only
  archive, lock, pending schedule, and due time. The Frontier cap stays in
  `selectSession` (admission). The function no longer needs the query context or
  library.
- `packages/backend/convex/review.ts`: call the two-argument `checkEligible`.
- `apps/web/src/components/review-session.tsx`: `subtitle` may be a function of
  the session's remaining unreviewed count; the progress bar counts reviewed
  cards.
- `apps/web/src/routes/_app/review.tsx`: the header count uses the session's
  remaining cards instead of the raw queue length.

Verification:
- Reproduced the deterministic case before the fix: opened `/review` with a new
  typed-answer card, set **New review units per day** to 0 in a second tab,
  revealed the card, and chose **Good**. The rating was rejected with "Today's
  new review unit limit is reached", the card was removed, and the sidebar
  showed "all caught up" (`screenshots/01-limit-zero-rejected-before.png`).
- After the fix: opened `/review` with two new cards, set the limit to 0 in a
  second tab, and confirmed the header still said "2 review units due today"
  with the card on screen
  (`screenshots/13-limit-zero-session-count-after.png`). Chose **Good** twice;
  both answers saved, the header counted down 2 → 1 → done, and the done screen
  was accurate (`screenshots/08-limit-zero-rating-honoured-after.png`,
  `screenshots/14-limit-zero-all-answered-after.png`).
- With the limit left at 0 before opening the page, the queue still offers no
  new units (`screenshots/12-limit-zero-before-admission.png`), so the cap still
  gates admission.
- The natural unlock trigger uses the same removed code path. The QA report's
  exact 11-unit sequence was not rebuilt in this walkthrough; the deterministic
  limit-change case exercises the same `checkEligible` branch.

## ISSUE-2 (minor): deleted queued card stays on screen

Status: **fixed**.

Root cause: `reconcileSessionCards` deliberately kept pending cards that were
missing from a queue response, because a card can also be missing for a benign
reason (changed elsewhere, or the new-unit budget). Nothing checked whether the
unit still existed.

Change (`apps/web/src/components/review-session.tsx`): the merge reports missing
pending cards; the session asks `review.preview` for each one once. A `null`
result means the unit (or its library) is gone, so the card is removed from the
session and a notice is shown. Transient query failures are retried on the next
poll, and a card that reappears is checked again if it goes missing later.

Verification:
- Reproduced before: opened `/review` on a new card, deleted that flashcard from
  the deck page in a second tab, waited through a poll, and rated the stale card.
  The rating was rejected with "This review unit no longer exists."
- After: repeated the same steps. The first poll after deletion removed the card
  and announced "This card was deleted in another tab. It was removed from the
  session." before any answer
  (`screenshots/11-deleted-card-removed-after.png`).

## ISSUE-3 (minor): "All caught up" while a skipped card is still due

Status: **fixed**.

Root cause: a successful rating always advanced the index by one. If the last
card was rated while an earlier card had been skipped with **Next**, the index
reached the end and the completion panel rendered even though a session card was
still unreviewed.

Change (`apps/web/src/components/review-session.tsx`): after a rating, the
session moves to the next unreviewed card after the cursor, wrapping to earlier
skipped cards, and only then reaches the done state. Removing the last card from
the session also lands on the first remaining skipped card. Progress counts
reviewed cards, so revisiting a skipped card no longer resets the bar.

Verification:
- Before the fix, the skipped card stayed in the session and could only be
  reached with the previous-arrow control; the QA report captured the premature
  completion screen. In this run the seed kept unlocking new cards, which masked
  the done panel, so the exact before screenshot was not recaptured; the code
  path was `setIndex(i => i + 1)`.
- After: opened `/review` with exactly two due cards, pressed **Next** to skip
  the first, revealed and rated the second. The session wrapped back to
  "1 / 2" with the skipped card and the header still said "1 review unit due"
  (`screenshots/09-skipped-card-revisited-after.png`). Rating it produced the
  accurate done screen (`screenshots/10-accurate-done-after.png`).
- Undo was re-checked after the fix: rating a card, using Undo from the done
  screen, and re-rating the restored card all worked.

## ISSUE-4 (cosmetic/ops): malformed deck id sends a validation error

Status: **fixed**.

Root cause: `review.queue` declared `deckId` as `v.id("decks")`, so the route
loader sent the raw URL segment and Convex rejected it before the handler could
return "not found". `decks.get` already accepts a string and calls
`ctx.db.normalizeId`.

Change (`packages/backend/convex/review.ts`): `queue` takes
`deckId: v.optional(v.string())`, normalizes it, and returns `null` for a
malformed or foreign id before selecting a session.

Verification:
- Before: opening `/deck/not-a-real-id-xxx/review` showed "Deck not found" but
  the backend log contained `[CONVEX Q(review:queue)] ArgumentValidationError:
  Value does not match validator. Path: .deckId`.
- After: the same URL still shows "Deck not found", and the backend log has no
  new `ArgumentValidationError` entry. The page's queue stays empty.

## ISSUE-5 (major): review header collapses at ≤768px

Status: **fixed**.

Root cause: the header was a single non-wrapping row: the deck selector was
`shrink-0` with a long label, the heading was `flex-1`, and the uppercase deck
name in the metadata row was a non-shrinking flex item. At narrow widths the
selector/h1 fought for the row (the h1 collapsed to "R") and the deck name
pushed the summary and the position counter out of view.

Change:
- `apps/web/src/components/review-session.tsx`: the header stacks the title and
  selector below `sm` and keeps them on one row above it. The subtitle/meta row
  also stacks below `sm`; the deck link truncates with an ellipsis and a title
  tooltip; the position counter is `shrink-0`; the meta block is capped at 50%
  on wider screens.
- `apps/web/src/routes/_app/review.tsx`: the deck selector fills the row below
  `sm`, is auto-width with a 20rem cap above it, and its selected value
  truncates.

Verification (emulated viewport widths):
- Before: `/review` at 768 with the long deck selected showed the h1 as "R" and
  the selector spanning the row (`screenshots/04-review-768-before.png`); at 390
  the select overflowed the viewport (`screenshots/05-review-390-before.png`);
  deck review at 768/390 pushed the position counter off-screen
  (`screenshots/06-deck-review-768-before.png`,
  `screenshots/07-deck-review-390-before.png`).
- After: 1440/1024/768/390/320 screenshots for `/review` (long deck) and
  `/deck/<id>/review`: `screenshots/15-review-1440-after.png` through
  `screenshots/19-review-320-after.png`, the short-name 320 case
  `screenshots/20-review-320-short-after.png`, and
  `screenshots/21-deck-review-1440-after.png` through
  `screenshots/25-deck-review-320-after.png`. At every width the h1 is readable,
  the summary wraps on its own line at the two narrowest widths, the deck name
  ellipsizes, and the counter stays visible. The route scroll container's
  `scrollWidth` equals its `clientWidth` at 390 and 320 for both pages.

## ISSUE-6 (minor a11y): unnamed progress bars and missing deck-review h1

Status: **fixed in scope**.

Change:
- `apps/web/src/components/ui/progress.tsx`: `Progress` takes an optional
  `label` and passes it as `aria-label`.
- `apps/web/src/components/review-session.tsx`: the session progress bar is
  labelled "Review progress".
- `apps/web/src/routes/_app/deck.$deckId.review.tsx`: added the page `h1`
  ("Review") above the back link.

Verification:
- With a card on screen, the deck-review progress bar exposes
  `aria-label="Review progress"` and the page has exactly one `h1` ("Review").
- axe on `/deck/<id>/review` before: `aria-progressbar-name` and
  `page-has-heading-one` violations. After: neither rule is reported
  (`axe-deck-review-with-card.json`).
- axe on `/review` after: no `aria-progressbar-name` violation
  (`axe-review-all-after.json`).

Out of scope: the home page's deck progress bars are in
`apps/web/src/routes/_app/index.tsx`, which another agent owns. They still need
`label={`${deck.name} learned`}` (or similar) passed to `Progress`; without it
the home page keeps its `aria-progressbar-name` violation.

## ISSUE-7 (minor): rating button contrast below WCAG AA

Status: **fixed**.

Measured: light **Good** was paper `#fffcf0` on green `#66800b` = 4.39:1;
dark **Again** was near-black `#100f0f` on red `#d14d41` = 4.42:1.

Change (`apps/web/src/components/review-session.tsx`): local per-theme shades for
those two buttons only (global tokens owned elsewhere):
- light Good `#637b0a` = **4.68:1** (hover `#5f770a` = 4.95:1)
- dark Again `#d35347` = **4.65:1** (hover `#d86055` = 5.22:1)

The rating interval hint changed from `text-on-accent/85` to full
`text-on-accent`, which also clears the previously failing small hint contrast
on the coloured buttons.

Verification:
- axe with the answer revealed in light mode: the Good button and its interval
  are no longer in the `color-contrast` violations
  (`axe-review-revealed-light-after.json`); computed style is
  `rgb(99, 123, 10)` on `rgb(255, 252, 240)`.
- axe in dark mode: no `color-contrast` violations at all
  (`axe-review-revealed-dark-after.json`); computed Again background is
  `rgb(211, 83, 71)` with `rgb(16, 15, 15)` text.
- The remaining light-mode contrast nodes are sidebar muted text and the global
  primary accent button, both owned by the theme/global-token task.

## Out of scope (not changed here)

- **Sidebar due badge during an over-budget session.** The sidebar
  (`apps/web/src/components/app-sidebar.tsx`) subscribes to `review.queue`
  without session knowledge. When the daily limit is lowered to 0 while a card
  is already on screen, the review header now counts that card but the sidebar
  badge still shows "all caught up" until it is answered
  (`screenshots/13-limit-zero-session-count-after.png`). Persisting session
  admission server-side would need a schema/index change in `schema.ts`, which
  is outside this task's file scope and conflicts with the other agents'
  worktree. The rating itself is honored, and the review screen's own count is
  correct.
- **Home page progress label** (see ISSUE-6).
- **Backend README wording.** `packages/backend/README.md` says a rating
  validates "the account-wide Frontier cap"; after this change the cap is
  validated at queue admission. The README is outside the assigned files and
  should be updated by whoever owns docs.

## Validation

- `pnpm typecheck` — passed (4/4 packages)
- `pnpm lint` — passed
- `pnpm --filter @armin/web build` — passed
- `pnpm --filter @armin/mobile check:bundle` — passed (iOS + Android)
- Running-app walkthrough above, with screenshots and axe JSON in this folder.
- No unit/integration/E2E suites were added (project decision).

## Data and environment left behind

The isolated worktree library keeps the sample deck plus the QA deck
`Advanced Molecular Biology and Cellular Genetics Foundations` and its cards
used for the layout checks. The temporary cards used for the deletion and undo
checks were deleted or rated. `pnpm dev` and the agent-browser session were
stopped after the walkthrough.
