# Concept card variant refill walkthrough (2026-11-05)

Local worktree deployment, desktop Chromium via agent-browser (1440×960
viewport), sample account `test@example.com`. Variants come from the generator's
fake provider; no model was called. The fake numbers each batch after the
exercises it was told to avoid, so a batch's numbering shows the avoid list it
received. The sample library is free, so it got complimentary Pro
(`billing:setComplimentaryPro`, local deployment) for the walkthrough, removed
afterwards.

Two temporary aids, removed before committing and never in code:

- An internal mutation marked chosen variants seen (an hour ago, in order),
  made the concept unit due now, and read the pool, unit, and Browse summary.
  Without it, reaching the low-water mark would take eight ratings spread over
  real learning steps.
- The fake generator's delay was raised from 3 to 30 seconds for steps 3–6, so
  a second rating could land while a refill job was still running.

1. Deck → **Add card** → **Concept** with the brief "Multiplying two whole
   numbers under 20. Vary both factors; avoid squares." While the library was
   still free its pool read "allowance used" with no variants, and Browse showed
   no low-on-variants badge: an empty pool is not low, it is not in the queue.
   After complimentary Pro, **Retry** generated variants 1–10 (job 2).
2. Browse → the new **All types** filter lists **Concept cards**
   ([screenshot](2026-11-05-concept-variant-refill/type-filter-menu.png)).
   Choosing it showed "1 flashcard of 5 flashcards", the concept card only, with
   no low-on-variants badge
   ([screenshot](2026-11-05-concept-variant-refill/concept-filter.png)).
3. Rating 1, above the mark: reviewing the deck and rating the concept card
   **Good** left 9 unseen variants. The pool stayed `ready` on job 2; no refill
   was scheduled.
4. Rating 2, crossing the mark: the helper marked six more variants seen,
   leaving 3 unseen including the assigned variant 1
   ([screenshot](2026-11-05-concept-variant-refill/before-refill-rating.png)).
   Rating it **Again** left 2 unseen. In the same transaction the pool became
   `generating` on job 3 and the unit moved to variant 2.
5. Rating 3, during the refill: four seconds later, with job 3 still running,
   the unit was made due again and rated **Again** from a reloaded review. It
   moved to variant 3 with 1 unseen variant left, and the pool stayed on job 3.
   `_scheduled_functions` held exactly two `conceptGeneration:generate` jobs for
   the card, job 2 (the Retry) and job 3 (the refill): the second low rating
   scheduled nothing.
6. Job 3 stored variants 11–20, numbered after the 10 existing exercises it
   received to avoid. The pool returned to `ready` with 20 variants, 11 unseen.
7. Exhaustion: the helper marked every remaining variant seen. Browse showed a
   **Low on variants** badge on the concept card
   ([screenshot](2026-11-05-concept-variant-refill/low-on-variants.png)), with
   the tooltip "No unseen variants left. Reviews reuse the ones seen longest ago
   until more are generated."
   ([screenshot](2026-11-05-concept-variant-refill/low-on-variants-tooltip.png)).
   In the three-column grid the extra badge wraps to a second row, as an
   Archived badge does, and the fixed-height tile cuts the preview text shorter.
8. The review showed variant 3 again without blocking
   ([screenshot](2026-11-05-concept-variant-refill/reused-variant.png)).
   Rating it **Good** assigned variant 4, the one seen longest ago, and started
   job 4. The card editor's Variants panel read "Generating variants…", and the
   card's Browse summary still marked it low ([screenshot](2026-11-05-concept-variant-refill/refill-generating.png)).
9. Job 4 stored variants 21–30 (20 exercises to avoid). The pool read "30
   variants ready" with 10 unseen, and the concept-card Browse filter showed the
   card without the badge
   ([screenshot](2026-11-05-concept-variant-refill/after-refill.png)).

## Checks

`pnpm check`, `pnpm --filter @armin/web build`, and
`pnpm --filter @armin/mobile check:bundle` pass.

## Not covered

- A refill from an `allowanceUsed` pool whose allowance has room again was not
  exercised; it goes through the same `requestGeneration` call as Retry, which
  the 2026-11-04 allowance walkthrough covered.
- Mobile was not exercised; this change adds no mobile UI, and the rating path
  mobile calls is the one walked through above.
