# Concept card monthly variant allowance walkthrough (2026-11-04)

Local worktree deployment, desktop Chromium via agent-browser (1440×960
viewport), sample account `test@example.com`. Variants come from the generator's
fake provider; no model was called. The sample library is free, so it got
complimentary Pro (`billing:setComplimentaryPro`, local deployment) for steps
1–8. To reach exhaustion, Pro's `conceptVariantsPerMonth` in
`packages/core/src/plans.ts` was temporarily lowered to 25 (35 in step 7) and
restored to 2,000 before committing; no override exists in code. Usage rows were
read with `pnpm exec convex data conceptVariantUsage`.

1. Settings → Account showed a new **Practice variants** section: "0 of 25
   used this month", "25 left. Resets on December 1."
2. Concept cards A and B each generated 10 variants. The row for `2026-11` read
   `used 20, reserved 0`, and the section showed "20 of 25 used this month" and
   "5 left" ([screenshot](2026-11-04-concept-variant-allowance/usage-20.png)).
3. Failed batch: with `CONCEPT_GENERATOR_FAKE` unset, card C saved and its pool
   showed "Generating variants failed. Variant generation isn't set up on this
   server yet." with **Retry**
   ([screenshot](2026-11-04-concept-variant-allowance/failed-uncharged.png)). The
   row still read `used 20, reserved 0`: the job's reservation was released and
   nothing was charged.
4. Overlapping jobs: with the fake set again, **Retry** on card C, then at once
   a new card D while C's job was still generating. During C's job the row read
   `used 20, reserved 5` (the 5 left, a partial batch). Card D found no
   allowance, so no job was scheduled for it. When C finished, the row read
   `used 25, reserved 0`, and C held 5 variants.
5. Card D's pool read "Variant allowance used. New variants resume on December
   1. The card has no exercise to review until it gets one." with no Retry
   ([screenshot](2026-11-04-concept-variant-allowance/allowance-used-new-card.png)).
   The account section showed "25 of 25 used this month" and "This month's
   allowance is used. New variants resume on December 1; until then, reviews
   reuse each card's variants."
   ([screenshot](2026-11-04-concept-variant-allowance/usage-exhausted.png)).
6. Review kept working with the allowance used: the session showed an existing
   concept card's variant, and after rating it, card C's exercise
   ([screenshot](2026-11-04-concept-variant-allowance/review-while-exhausted.png)).
   The usage row stayed at 25; review never generates.
7. Room again: raising the limit to 35 (standing in for a new UTC month or a
   larger plan; both only change the remaining allowance) changed card D's pool
   to "Variant allowance has room again. Retry to generate this card's
   variants." with **Retry**
   ([screenshot](2026-11-04-concept-variant-allowance/room-again.png)). Retry
   generated 10 variants
   ([screenshot](2026-11-04-concept-variant-allowance/retry-generated.png)); the
   row read `used 35, reserved 0`.
8. Free plan: with complimentary Pro removed, a new concept card E showed
   "Variant allowance used. Your plan doesn't include generated variants. The
   card has no exercise to review until it gets one." with no Retry
   ([screenshot](2026-11-04-concept-variant-allowance/free-plan-card.png)), and
   the account section read "Your plan doesn't include generated variants.
   Concept cards keep the variants they already have." with **See plans**
   ([screenshot](2026-11-04-concept-variant-allowance/usage-free.png)).

Not exercised in the app: a self-hosted instance (`SELF_HOSTED=true`), where
`variantAllowance` returns null, so jobs reserve nothing, no usage rows are
written, and the account section is hidden; and a real month change, which
starts a new `usageMonth` row at zero. The sample account was left on the free
plan, as before the walkthrough.
