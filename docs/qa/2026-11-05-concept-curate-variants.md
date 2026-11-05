# Concept card variant curation walkthrough (2026-11-05)

Local worktree deployment, desktop Chromium via agent-browser (1440×960
viewport), sample account `test@example.com`. Variants come from the generator's
fake provider; no model was called. The fake numbers its exercises ("Practice
variant 9 … Compute 9 × 11"), which the steps below use to name variants. The
panel numbers variants by their place in the pool, so after a deletion its
"Variant N" labels no longer match the fake's numbers. The sample library is
free, so it got complimentary Pro (`billing:setComplimentaryPro`, local
deployment) for the walkthrough, removed at step 12.

One temporary aid, removed before committing and never in code: an internal
mutation that marked chosen variants seen (an hour ago), flagged every variant
but the assigned one, made the concept unit due now, and read the pool, unit,
and variants. Without it, reaching the low-water mark or an all-seen pool would
take many ratings spread over real learning steps.

1. Deck → **Add card** → **Concept** with the brief "Adding two fractions with
   unlike denominators under 12. Vary both fractions; avoid equal
   denominators." Job 1 stored variants 1–10 and assigned variant 9 (unit
   version 2).
2. Flag during review: **Review** showed variant 9
   ([screenshot](2026-11-05-concept-curate-variants/review-before-flag.png)).
   The card's actions menu lists **Flag this exercise** for a concept card
   ([screenshot](2026-11-05-concept-curate-variants/review-flag-menu.png)).
   Choosing it showed variant 2 in place, with the toast "Exercise flagged. It
   won't be shown again. Here is another one."
   ([screenshot](2026-11-05-concept-curate-variants/review-after-flag.png)).
   The session stayed at 1 / 1 with Undo disabled: nothing was rated. The aid
   read variant 9 `flagged` (still unseen), the unit on variant 2 at version 3,
   and no review log for the card.
3. Flagged variants on the card: Browse → the card's editor. The Variants panel
   read "9 variants ready · 1 flagged", marked variant 2 **Next in review**
   ([screenshot](2026-11-05-concept-curate-variants/panel-flagged.png)), and
   listed variant 9 under "Flagged (1) · not shown in review" with an
   **Unflag variant** button
   ([screenshot](2026-11-05-concept-curate-variants/panel-flagged-section.png)).
   Every icon button has a tooltip naming its action.
4. Validation: editing variant 2 with an empty exercise showed "A variant's
   exercise is required."
   ([screenshot](2026-11-05-concept-curate-variants/edit-required.png)); an
   exercise with `![diagram](https://example.com/pie.png)` showed "A variant's
   exercise can't contain images or audio. Use text and equations."
   ([screenshot](2026-11-05-concept-curate-variants/edit-image-rejected.png)).
   Both come from the core variant schema; nothing was saved.
5. Editing the assigned variant: variant 2 was rewritten as "Add
   $\frac{2}{3} + \frac{1}{4}$." with a worked solution
   ([screenshot](2026-11-05-concept-curate-variants/edit-variant.png)). It saved
   as **Edited** and stayed **Next in review**
   ([screenshot](2026-11-05-concept-curate-variants/edited-variant.png)). The
   review tab, still open on variant 2, reported "This card was changed in
   another tab or device."
   ([screenshot](2026-11-05-concept-curate-variants/review-stale-after-edit.png));
   **Show the updated card** rendered the edited fractions
   ([screenshot](2026-11-05-concept-curate-variants/review-shows-edit.png)).
6. Stale edit: with variant 2's editor open in one tab, a second tab edited
   and saved it ("… Simplify the result."). Saving the first tab's edit ("…
   Show each step.") then showed "This variant was changed elsewhere after you
   started editing it. Cancel to see the latest version."
   ([screenshot](2026-11-05-concept-curate-variants/edit-conflict.png)). The
   stored exercise kept the second tab's text; the unit, at version 5, showed
   it too (versions: 2 assigned, 3 flag, 4 and 5 the two edits).
7. Deleting the assigned variant: variant 2's delete asks inline first
   ([screenshot](2026-11-05-concept-curate-variants/delete-confirm.png)).
   **Delete** removed it and assigned variant 10, now **Next in review**
   ([screenshot](2026-11-05-concept-curate-variants/after-delete.png)); the
   unit moved to version 6. The review tab went stale again, and the updated
   card showed variant 10
   ([screenshot](2026-11-05-concept-curate-variants/review-after-delete.png)).
   Rating it **Good** worked as before: variant 10 marked seen, variant 4
   assigned, unit version 7.
8. Refill after removal: the aid marked four variants seen, leaving 3 unseen
   (4, 7, 8). Deleting variant 7 from the panel left 2, and the same
   transaction started job 2: the panel read "Generating variants…"
   ([screenshot](2026-11-05-concept-curate-variants/refill-generating.png)).
   Job 2 stored 10 more, for 18 variants with 12 unseen
   ([screenshot](2026-11-05-concept-curate-variants/refill-ready.png)).
9. Browse flag with flagged variants: the aid marked every active variant
   seen, and Browse showed **Low on variants** on the card
   ([screenshot](2026-11-05-concept-curate-variants/browse-low.png)). Unflagging
   variant 9, which had never been shown, cleared the badge
   ([screenshot](2026-11-05-concept-curate-variants/browse-after-unflag.png)).
10. The last active variant: the aid flagged every variant but the assigned
    variant 4 and made the unit due. **Flag this exercise** in review was
    refused with "This is the card's only active variant, so reviews still
    need it. Edit it instead, or unflag another variant first."
    ([screenshot](2026-11-05-concept-curate-variants/review-flag-last-refused.png)),
    and the card stayed on variant 4. In the panel its delete button is
    disabled, with the tooltip "Reviews need this card's only active variant"
    ([screenshot](2026-11-05-concept-curate-variants/panel-last-active.png)).
11. Without Pro: after complimentary Pro was removed, the open editor turned
    read-only: the panel lists the same variants and flagged section with no
    edit, delete, or unflag buttons, and reads "No new variants are generated
    without Pro."
    ([screenshot](2026-11-05-concept-curate-variants/lapsed-read-only.png)).
12. Cleanup: the QA card was deleted from Browse, and complimentary Pro stays
    off. The concept card "Multiplying two whole numbers under 20" from the
    earlier refill walkthrough was left as it was.

## Checks

`pnpm check`, `pnpm --filter @armin/web build`, and
`pnpm --filter @armin/mobile check:bundle` pass.

## Not covered

- The server's own schema check and Pro refusal for curation writes were not
  reached through the app: the editor validates first and hides curation
  outside Pro. Both run in the mutations before anything is written.
- The stale banner after an edit elsewhere keeps its existing wording, "Your
  answer wasn't saved", although no answer was given.
- Mobile was not exercised. It gets no flag action (mobile has no authoring);
  its reviews read the unit's front and back, which curation keeps current.
