# Undo after deleting the reviewed exercise walkthrough (2026-11-05)

Local worktree deployment, desktop Chromium via agent-browser (1440×960
viewport), sample account `test@example.com` with complimentary Pro (local
deployment, removed at the end). Variants come from the fake generator; no
model was called. State was read with `convex data`.

Decision: when the exercise a review showed has since been deleted or flagged,
Undo restores the review's schedule and keeps the card on the active exercise
it shows now, so a removed exercise never returns. Before this change, Undo
refused with "The exercise from that review was removed, so it can't be
undone."

1. Created a concept card "Undo QA". Its first batch assigned variant 4: unit
   version 2, New, 0 reps, 10 active variants, none seen.
2. **Review** → variant 4 → **Show answer** → **Good**. The unit moved to
   variant 1 (version 3, Review, 1 rep), with 1 review log.
3. In a second tab, the card's editor → variant 4 → **Delete variant** →
   **Delete**. Variant 4's row was gone; the unit still showed variant 1 at
   version 3.
4. Back in the review tab → **Undo last review**. Undo succeeded: the unit went
   back to New with 0 reps (version 4), the review log was removed, and the
   card kept showing variant 1
   ([screenshot](2026-11-05-concept-undo-removed/undo-after-delete.png)).
   Variant 4 did not come back (9 variants, none seen). The card kept its
   earned prerequisite access, as for any Undo (ADR 0021).

For a flagged rather than deleted exercise, the same code path also restores
that variant's previous `lastShownAt`, so it isn't counted as seen, while it
stays flagged. Flagging from review only applies to the exercise on screen,
which bumps the unit version and makes an earlier review's Undo stale before
this path is reached. This case was not driven separately.

Cleanup: deleted the QA card and its variants, and turned complimentary Pro
off; the sample library has its 4 cards.
