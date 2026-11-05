# Concept review QA (2026-11-05)

Local worktree deployment, `test@example.com`, complimentary Pro, and the fake
provider. Web checks used a dedicated agent-browser Chromium session; mobile
checks used Expo Go on the Android emulator. The QA deck and cards were created
for this run. No real model was called.

1. Created a concept card and observed **No exercises yet** during generation
   ([pending](2026-11-05-concept-qa-review/pending.png)). Once the first batch
   arrived, its deck showed one due and review presented an assigned exercise.
2. The first card showed practice variant 1. Reloading and opening a second tab
   both showed variant 1 ([review](2026-11-05-concept-qa-review/review.png)).
   Rating Good in one tab advanced the unit and removed it from the deck's due
   count. Rating the old answer in the other tab was refused as stale
   ([refusal](2026-11-05-concept-qa-review/stale.png)). Undo in the first tab
   restored variant 1 and its pre-review schedule; the variant's `lastShownAt` was
   again absent in the local table.
3. **Flag this exercise** swapped variant 1 for variant 9 without a rating;
   variant 1 was flagged in the table and the unit still had zero reps
   ([next exercise](2026-11-05-concept-qa-review/flagged.png)).
4. On the Android emulator the same assigned variant appeared. Before the fix,
   its KaTeX source was displayed literally
   ([before](2026-11-05-concept-qa-review/android-concept.png)). The mobile
   card renderer now uses KaTeX-generated MathML in a local WebView, escaping
   non-math text and retaining invalid expressions as source. After the fix,
   the exercise and revealed solution rendered the multiplication and rating
   Good succeeded ([exercise](2026-11-05-concept-qa-review/android-math-fixed.png),
   [answer](2026-11-05-concept-qa-review/android-answer-fixed.png)).
5. Undid that rating, opened the same exercise on web, then switched Pro off
   with the local complimentary grant command. Rating was refused with the Pro
   message and the concept card left due counts
   ([refusal](2026-11-05-concept-qa-review/lapsed.png)). Re-enabled Pro and
   successfully rated the restored exercise on Android.
6. Deleted the just-rated variant in the web editor while mobile still offered
   Undo. Undo refused with “The exercise from that review was removed, so it
   can't be undone.” This preserves the deletion but conflicts with the request
   for exact Undo after deletion; see the open design question below.
7. Created a second concept card, observed the pending state and then queue
   admission, buried it in review, and saw the due count fall. Undo of the bury
   brought it and its exercise back ([unburied](2026-11-05-concept-qa-review/unburied.png)).

## Finding and fix

**Medium — mathematical expressions were raw source on mobile.** Create or
review a concept exercise containing `$9 \\times 11$` in Expo Go: the front and
solution showed the delimiters and command literally, although web rendered the
same exercise. Fixed in this change with locally generated MathML. The emulator
walkthrough above verifies the particular inline expression and rating path.

## Open question and limits

The requested exact Undo after a variant is flagged or deleted conflicts with
spec #93's requirement that flagged exercises stop appearing and deleted ones
never appear again. Current Undo refuses when the old variant is unavailable;
it also refuses if the unit changed after the review. Should Undo restore the
schedule while keeping a different active exercise, or reverse the curation as
well? Neither alternative gives both exact exercise restoration and permanent
curation. The deleted case was reproduced; the flagged-after-rating case was
inspected in the same `restoreVariant` branch but not separately driven.

This run did not independently exercise exhaustion, rapid overlapping refill
jobs, the low-on-variants badge, prerequisite graphs involving a concept card,
Frontier caps, Stats, or iOS. Earlier concept walkthroughs cover some of these;
they are not claimed as results of this run. The Android check used an emulator,
not a physical device. Complex equations, accessibility with a screen reader,
and rotation on mobile were not exercised.

## Validation

`pnpm check`, `pnpm --filter @armin/web build`, and
`pnpm --filter @armin/mobile check:bundle` passed.
