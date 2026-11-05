# Concept card Pro gating walkthrough (2026-11-05)

Local worktree deployment, desktop Chromium via agent-browser (1440×960
viewport), sample account `test@example.com`. Variants come from the generator's
fake provider; no model was called. The sample library starts on the free plan
and already holds one reviewed concept card from earlier walkthroughs
("Multiplying two whole numbers under 20", Review state, due in a day). Pro was
switched with complimentary Pro (`billing:setComplimentaryPro`, local
deployment) and switched off again at the end. The library record is back to
its starting state, with no `complimentaryPro` field.

Server refusals were checked with `convex run` against the local deployment,
using the signed-in browser session's identity, because the web client no
longer sends these requests. No code was changed for the walkthrough.

## Free library

1. The deck page labels the existing concept card **Requires Pro**
   ([screenshot](2026-11-05-concept-pro-gating/free-deck-requires-pro.png)).
2. **Add card**: the type picker shows **Concept** with a Pro marker. Choosing
   it replaces the template fields with "Concept cards are a Pro feature" and an
   **Upgrade in Billing** link, and **Add card** stays disabled
   ([screenshot](2026-11-05-concept-pro-gating/free-concept-upsell.png)).
   The link opens `/settings?tab=billing`, the Billing tab with the Upgrade
   action ([screenshot](2026-11-05-concept-pro-gating/free-billing-link.png)).
   Billing's Pro description now mentions concept cards.
3. Server checks, as the signed-in user:
   - `flashcards.create` with a concept card →
     `QUOTA: Concept cards are a Pro feature. Upgrade to Pro to create, edit, or review them.`
   - `flashcards.update` adding a tag to the existing concept card → the same
     `QUOTA` error. Its version stayed 1.
   - `concepts.retryGeneration` on it → the same `QUOTA` error.
   - `review.rate` on its unit at the current version →
     `ineligible: Concept cards are a Pro feature. This card returns to your reviews when Pro does.`

## Pro, then lapsed

4. With complimentary Pro on, **Add card** → **Concept** shows the template
   form ([screenshot](2026-11-05-concept-pro-gating/pro-concept-form.png)).
   A new card, "Adding two whole numbers under 50…", got variants 1–10. The
   sidebar showed **1 due**, the new concept card
   ([screenshot](2026-11-05-concept-pro-gating/pro-deck-one-due.png)), and
   Review showed it as "Practice variant 8"
   ([screenshot](2026-11-05-concept-pro-gating/pro-review-concept.png)).
   The deck's `deckUnitCounts` row read `frontierCandidates` 1 and
   `conceptFrontierCandidates` 1. Both concept units' schedule, version, and
   assigned variant were recorded.
5. With the review still open, complimentary Pro was switched off. The sidebar
   due count went to 0 and Review showed "all caught up", while the open session
   kept the card it had already shown
   ([screenshot](2026-11-05-concept-pro-gating/lapsed-review-caught-up.png)).
   Revealing it and rating **Good** ended the session with "Concept cards are a
   Pro feature. This card returns to your reviews when Pro does. Your answer to
   that card wasn't saved."
   ([screenshot](2026-11-05-concept-pro-gating/lapsed-rate-refused.png)).
   After a reload, Review was empty.
6. Browse labels both concept cards **Requires Pro**
   ([screenshot](2026-11-05-concept-pro-gating/lapsed-browse.png)). The tooltip
   reads "Concept cards are a Pro feature. This card keeps its data and returns
   to your reviews when you upgrade."
   ([screenshot](2026-11-05-concept-pro-gating/lapsed-browse-tooltip.png)).
7. Opening the new card shows "This concept card needs Pro", with the template
   read-only, the variants panel ("10 variants ready · No new variants are
   generated without Pro", no Retry), no tag editor, and **Save changes**
   disabled ([screenshot](2026-11-05-concept-pro-gating/lapsed-editor.png)).
8. Deck → **Cram** with every state selected matched **4 review units**, the
   four non-concept cards
   ([screenshot](2026-11-05-concept-pro-gating/lapsed-cram.png);
   deck page: [screenshot](2026-11-05-concept-pro-gating/lapsed-deck.png)).
9. Both concept units' state, due time, reps, stability, version, and assigned
   variant matched the values recorded in step 4 exactly.

## Pro returns

10. With complimentary Pro on again, the same cram setup matched **6 review
    units** ([screenshot](2026-11-05-concept-pro-gating/resumed-cram.png)), the
    sidebar showed **1 due**
    ([screenshot](2026-11-05-concept-pro-gating/resumed-deck.png)), and Review
    showed the same "Practice variant 8"
    ([screenshot](2026-11-05-concept-pro-gating/resumed-review.png)). Rating it
    **Good** was accepted. The unit moved to version 3 with a new variant, and
    the session finished "All caught up"
    ([screenshot](2026-11-05-concept-pro-gating/resumed-rated.png)).
11. Browse showed no **Requires Pro** badges
    ([screenshot](2026-11-05-concept-pro-gating/resumed-browse.png)). The editor
    had editable template fields and tags again. Adding the tag `qa` saved
    ([screenshot](2026-11-05-concept-pro-gating/resumed-editor.png)).
12. Cleanup: the QA concept card was deleted. The deck counter returned to
    `frontierCandidates` 0 and `conceptFrontierCandidates` 0, and complimentary
    Pro was switched off.

## Checks

`pnpm check`, `pnpm --filter @armin/web build`, and
`pnpm --filter @armin/mobile check:bundle` pass.

## Not covered

- Self-hosted instances were not run. They reach Pro through `libraryPlan`,
  which already returns Pro when `SELF_HOSTED=true`, the same path the
  complimentary grant used here.
- A Polar subscription lapse was not exercised. Gating reads only the
  effective plan, which Polar sync and complimentary Pro both set.
- Mobile was not exercised. This change adds no mobile UI. Mobile uses the same
  queue and `review.rate` as the web walkthrough above, so a withheld concept
  card is left out of its queue, or refused if one is already on screen.
- A deck counter row written before `conceptFrontierCandidates` existed counts
  that field from zero. Concept cards exist only on this unreleased branch, so
  only a local deployment that already held a New concept card is affected.
  After a lapse, its per-deck due count can include that card until the row is
  rebuilt. Reads clamp the value at 0.
