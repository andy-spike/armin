# Web spaced repetition reliability

Verified on 2026-10-21 in the task worktree, against its isolated Convex development deployment and the root `pnpm dev` web launcher. Browser checks used headless Chromium 151 on Linux at 1280 × 577 through the task's named agent-browser session. No physical mobile-device walkthrough was performed.

## Changes

- Each occurrence of a review unit has its own session identity. Completed occurrences stay in session history; newly due occurrences append after them. Old queue responses cannot reintroduce a completed version, and repeated polls cannot duplicate a waiting occurrence.
- Undo restores the occurrence that produced the review log and removes a waiting repeat of the same unit. Previously answered occurrences cannot submit another rating through backward navigation. Navigation and Undo are disabled during a rating submission.
- Queue selection resolves each deck's effective sibling preference. Grouped and ungrouped decks consume the same account-wide new-unit budget. A grouped flashcard's remaining siblings can continue after its first unit consumes the final slot.
- Account and deck settings use the installed FSRS parameter validator before saving weights. Supported finite arrays of 17, 19, or 21 parameters remain compatible; malformed arrays and nonfinite values return `INVALID` without saving.

## Function-level verification

Temporary Node checks loaded the actual session merge function, actual queue functions with controlled database fixtures, and the actual settings weight validator. They were kept outside the repository rather than adding a test suite, in accordance with the project instruction.

The original source reproduced the defects. The corrected implementation passed these checks:

- A due unit appends as a separate occurrence after a completed occurrence; subsequent polls do not duplicate it or rewrite the completed prompt.
- A queue response with an older version cannot resurrect a completed occurrence or flag a freshly undone occurrence as stale.
- A newer version of the active prompt is still reported as stale without replacing the prompt on screen.
- Both directions of the global/deck sibling override work, as do inheritance, mixed-deck selection, and continuing siblings after the shared budget is consumed.
- Invalid JSON, non-array input, unsupported array lengths, nonnumeric entries, and numeric overflow are rejected as weights. Finite 17-, 19-, and 21-parameter arrays, null, and omitted values retain their intended behavior.

These checks isolate the changed logic. They do not substitute for the running-app verification below.

## Running app

Fixtures were created through the app's authenticated API in the browser, inside the synthetic worktree library. Reviews and Undo were exercised through the visible review UI.

1. Created a temporary deck with a basic flashcard and a supported one-minute learning step.
2. Revealed the answer and selected Again. The completion screen appeared while the learning step was pending.
3. Left the page open until the unit became due. Polling brought it back as turn 2 of 2, without reloading or navigating. The answer started hidden. See [repeat turn](2026-10-21-spaced-repetition/repeat-turn.png).
4. Selected Good on the repeated turn and used Undo from the completion screen. The same second occurrence reopened, with the answer hidden, rather than jumping back to the first occurrence.
5. Created a reversed flashcard in another temporary deck. With one new-unit slot left, global grouping off and deck grouping on returned both units. Global grouping on and deck grouping off returned one unit.
6. Submitted invalid weights to both account and deck settings. All six invalid writes returned `INVALID`; existing account weights were unchanged. Valid finite arrays of all three supported lengths saved successfully. Restored the deck to inherited weights and restored the original account settings.
7. Added a second unit and answered Again on the first. While the second prompt remained active, the first became due and appended as turn 3. Undo returned to the answered occurrence and removed the waiting repeat, leaving two turns rather than three.
8. Switched the all-decks review selector to the sibling fixture deck. Its session restarted at 1 of 2 with no cards retained from the prior selection.
9. Changed the active flashcard through the authenticated API to simulate another tab's edit. Polling preserved the old prompt and showed the stale-card notice. Selecting Show the updated card loaded the changed prompt.

Removed both temporary decks after the walkthrough and confirmed the original account scheduling settings were preserved. Closed only the task's browser session.

## Validation

- `pnpm typecheck`
- `pnpm lint`
- `pnpm --filter @armin/web build`
- `pnpm --filter @armin/mobile check:bundle`, Android and iOS export compatibility only; no mobile source changes
- `pnpm test`, successful runner exit with no configured test tasks
- `git diff --check`

## Additional finding

Learning-step validation has a pre-existing mismatch with the installed FSRS version. The backend accepts seconds such as `2s`, but FSRS rejects them with `Invalid step unit: 2s, expected m/h/d`. It also accepts fractional-minute strings such as `0.1m`, which FSRS parses as zero and which produced a one-day fallback in the new-unit example. The web settings editor exposes seconds. This is separate from weight validation and needs a follow-up decision about supported step precision. The walkthrough used `1m` after reproducing the mismatch.

## Policy boundaries

This change preserves the existing deck-selected use of the shared daily budget, the sibling soft cap, and the prerequisite securedness rule. It does not select a different learning policy. Policy alternatives are being presented to the user separately.
