# Explicit dialog, review, and export state walkthrough (2026-11-07)

Local worktree deployment, desktop Chromium via agent-browser (1440×960
viewport), sample account `test@example.com`. State was read with
`convex data`. Overlapping actions were sent with `KeyboardEvent`s dispatched
in one script, so both start in the same tick, faster than a person can press
keys. The late-response cases (a delete summary or an edit load resolving after
a newer request) were not forced: local responses arrive in milliseconds, so
the dialog can't be made to wait on an old request. Those paths are covered by
reading the code, not by this walkthrough.

## Delete confirmations

1. Deck page → the prerequisite card's **Delete flashcard**: "1 dependent will
   be unlocked or recomputed", 1 review unit
   ([screenshot](2026-11-07-explicit-state-machines/tile-delete-prereq-card.png)).
2. **Cancel**, then the cloze card's **Delete flashcard**: the dialog named the
   cloze card and showed its own counts, 0 dependents
   ([screenshot](2026-11-07-explicit-state-machines/tile-delete-cloze-card.png)).
3. Graph → the prerequisite node's context menu → **Delete flashcard**: 1
   dependent, 1 review unit
   ([screenshot](2026-11-07-explicit-state-machines/graph-delete-consequences.png)).
4. Review → the typed card's **Flashcard actions** → **Delete flashcard**: 0
   dependents ([screenshot](2026-11-07-explicit-state-machines/review-delete-dialog.png)).
   **Archive instead** archived that typed card (`archived: true`) and the
   session moved on to the cloze card. It was unarchived from Browse at the end.

## Graph card dialog

5. Edit requests for the prerequisite card and then the typed card in the same
   tick: the dialog opened once, on the typed card, with its prompt, answer, and
   the Type form ([screenshot](2026-11-07-explicit-state-machines/graph-edit-latest-wins.png)).
6. Escape, then immediately an edit request for the prerequisite card while the
   dialog was still animating closed: it opened on that card's front and back
   and was still open 1.5 s later, so the earlier close didn't close it again
   ([screenshot](2026-11-07-explicit-state-machines/graph-edit-reopen-during-exit.png)).

## Review undo and bury

7. Rated the prerequisite card Good; the dependent unlocked (card 2 / 4).
8. Undo (`z`) and Bury (`b`) in the same tick: the answer was undone and the
   prerequisite card returned (card 1 / 4). Nothing was buried: every unit read
   `buriedUntil` absent, and the prerequisite unit was back at `reps: 0`
   ([screenshot](2026-11-07-explicit-state-machines/review-undo-and-bury-same-tick.png)).
9. Bury then Undo in the same tick: "Card buried until tomorrow." The
   prerequisite unit was buried (version 4) and Undo was refused while Bury ran
   ([screenshot](2026-11-07-explicit-state-machines/review-bury-then-undo-same-tick.png)).
10. Undo on its own then reversed the bury: "Card unburied.", nothing buried.

## Exports

11. Settings → Data → **Export** (the save picker was turned off so the
    download fallback ran headless): the export went `ready` and showed
    **Download**. The scheduler held `exports:expireBuild` 11 minutes out
    (created 13:25:20, due 13:36:20) next to `exports:expire` an hour out.
12. Running `exports:expireBuild` and a late `exports:markResult` with an error
    against that ready export changed nothing; it stayed `ready` with its file.
13. A stuck build was simulated by adding a `pending` export row with
    `convex import --append` (no build running). **Export** then failed with
    "An export is already being prepared."
    ([screenshot](2026-11-07-explicit-state-machines/export-stuck-blocks-new.png)).
14. Running its watchdog marked it `failed`, and the list showed "The export
    stopped before it finished. Try again."
    ([screenshot](2026-11-07-explicit-state-machines/export-watchdog-failed.png)).
    **Export** then succeeded. A late `markResult` with an error left the
    failed row's message unchanged.

Cleanup: the archived card was unarchived and the review was undone, so the
sample library has its four cards as before. The simulated failed export row
and two test exports remain in this checkout's local deployment only.
