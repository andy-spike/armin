# Concept cards in the rest of the study model walkthrough (2026-11-05)

Local worktree deployment, desktop Chromium via agent-browser (1440×960
viewport), sample account `test@example.com`. Variants come from the generator's
fake provider; no model was called. The sample library is free, so it got
complimentary Pro (`billing:setComplimentaryPro`, local deployment) for the
walkthrough, removed at the end.

State was read with `convex data` on the local deployment (flashcards, review
units, review logs, cram logs, concept variants): no code was added for QA. Two
concept cards took part: **M**, "Multiplying two whole numbers under 20" (from
an earlier walkthrough: Review state, 4 reps, 4 review logs, 30 variants, 20
seen, assigned variant `p971…` showing "Practice variant 4"), and **S**,
"Subtracting two-digit whole numbers without borrowing", created in step 1.

1. **Waiting badge.** Deck → **Add card** → **Concept** → S. Half a second
   after **Add card**, while the fake generator was still running, S's tile
   read **No exercises yet** instead of New
   ([screenshot](2026-11-05-concept-study-model/tile-no-exercises-yet.png),
   tile behind the dialog, which stays open for the next card). After the
   first batch arrived (about 3 s) the tile read **New**: variant 2 assigned,
   unit version 2.
2. **Template edit keeps history.** M's editor → appended "Keep one factor at
   least 11." to the brief → **Save changes**
   ([screenshot](2026-11-05-concept-study-model/template-edit.png)). The card
   went to version 2; its review unit kept the same ID, version 6, state
   Review, 4 reps, all 4 review logs, and the assigned variant (still "Practice
   variant 4").
3. **Prerequisites, locks, earned access.** Added a basic card B ("What is 9
   minus 4?"), then in the deck graph dragged B → S and S → "When does a card
   blocked by a prerequisite become eligible for study?"
   ([screenshot](2026-11-05-concept-study-model/graph-links.png)).
   - S as a dependent: it locked at once (graph and data: card and unit
     `locked`, no earned access), with its assigned variant kept.
   - S as a prerequisite: the reviewed sample card kept its earned access and
     stayed unlocked.
   - Review → B → **Easy** secured B. S unlocked with
     `prerequisiteAccessGranted`, joined the open session as card 2 / 2, and
     showed its assigned exercise
     ([screenshot](2026-11-05-concept-study-model/review-unlocked-concept.png)).
4. **Bury.** S's actions menu in review → **Bury until tomorrow**: "All caught
   up", and the unit's `buriedUntil` was the next study day (2026-11-06 00:00
   UTC, the account's time zone).
5. **Cram shows random variants and writes nothing.** Deck → **Cram** with all
   states (7 cards). M showed "Practice variant 15 … Compute 15 × 17" while its
   review stayed assigned to variant 4
   ([screenshot](2026-11-05-concept-study-model/cram-random-variant.png)).
   **Show answer** → **Good**. Afterwards M's unit had the same version (6) and
   assigned variant, the variants' summed `lastShownAt` was unchanged
   (35877981522000), no review log was added, and one cram log was. Three
   fresh cram sessions on Review cards showed variants 16, 14, and 17; within a
   session the pick stays put.
6. **Archive.** S's tile menu → **Archive**: the tile showed **Archived**, the
   card and unit were `archived`, and a new cram session over all states
   matched 6 cards without S (7 before). **Unarchive** restored it.
7. **Move.** New deck "QA moved concepts" → M's tile menu → **Move to deck…**:
   the card and unit moved (unit version 7), keeping state Review, 4 reps, 4
   review logs, its cram log, all 30 variants, and the assigned variant.
8. **Export.** Settings → Data → **Export**. Automation can't operate the
   browser's native save picker, so the page's `showSaveFilePicker` was
   replaced in the console with one that kept the written bytes, and the ZIP
   was unpacked locally. `manifest.json` counted `conceptVariants: 40` and
   listed a checksum for `data/concept-variants.json`; that file held 30
   active variants for M and 10 for S with exercise, solution, status, origin,
   `lastShownAt`, and timestamps. The templates (brief and worked example, M's
   with the step 2 edit) were the concept cards' content in
   `data/flashcards.json`, and the README describes the new file.
9. **Delete cleans up variants.** S's tile menu → **Delete flashcard**
   ([screenshot](2026-11-05-concept-study-model/delete-concept-dialog.png)).
   Within 3 s the card, unit, and all 10 variants were gone. Deleting the "QA
   moved concepts" deck likewise removed M and all 30 of its variants through
   the deck's scheduled cleanup.
10. **Older orphans.** 28 variants were left in the table, belonging to two
    concept cards deleted by the #99 and #100 walkthroughs before this cleanup
    existed. Running `deletion:cleanupConceptVariants` for each card ID
    removed them; the table is now empty. The export excluded variants of
    cards that no longer exist.

Cleanup: deleted B, so the sample library is back to its 4 seeded cards (M,
an earlier walkthrough's card, went with the QA deck), and turned
complimentary Pro off. `AI_GATEWAY_MODEL` stays unset.

Not covered: mobile (no mobile change; mobile has no cram). A concept card
whose generation fails stays **No exercises yet** too, by the same rule as
step 1; this run only saw the generating case.
