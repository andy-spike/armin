# Permanent prerequisite access

The user selected N1, a flexible account-wide budget for new units, and P3,
unlock once. This record covers the policy follow-up to the earlier
[reliability walkthrough](2026-10-21-spaced-repetition.md).

## Semantics

Access is a permanent milestone on the dependent flashcard. Before it is earned,
every review unit of every active prerequisite must satisfy the current Review
state and stability-floor rule. Later lapses, Undo, raised stability floors,
content edits, new prerequisite links, and deck moves do not revoke access.
Accepted reviews also record access for root flashcards. Archiving or removing a
prerequisite can grant access permanently, as an intentional learner-controlled
bypass. Deleting and recreating a flashcard creates a new identity.

N1 requires no queue-policy rewrite: a selected deck can consume the shared daily
budget, and deck-specific and all-decks views may offer different new units.
Sibling grouping and its soft cap retain their existing behavior.

## Verification environment

- Isolated task Convex development deployment and root `pnpm dev` web launcher.
- Headless Chromium 151 on Linux, driven through the named agent-browser session.
- Web settings inspected at 1280 × 800 and an emulated 390 × 844 viewport. The
  latter is a desktop-browser viewport, not a physical phone or mobile-app test.
- Fixtures created through the signed-in app's API in the synthetic worktree
  library. Review and Undo exercised through the visible web controls.

## Running web app

1. Created a reversed prerequisite and a basic dependent, then linked them before
   reviewing either. The dependent was locked and absent from the review queue.
2. Rated the forward direction Easy through the authenticated API. The reverse
   direction was still New, so the dependent stayed locked.
3. Rated the reverse direction Easy through the visible review controls. The
   dependent unlocked and joined the open session.
4. Used the visible Undo control. The reverse direction returned to New, while
   the dependent stayed unlocked and remained in the backend queue.
5. Raised the deck's stability floor to 365. Earned access remained available.
6. Added an unstudied prerequisite to both the earned dependent and its already
   reviewed root prerequisite. Neither lost access.
7. Created a fresh dependent of the unstudied prerequisite. It remained locked.
   Archiving that prerequisite opened the gate; unarchiving it preserved access.
8. Converted the earned dependent to a reversed flashcard, generating another
   review direction. Its access remained available.
9. Moved the earned dependent to another deck, then added an unstudied prerequisite
   in that deck. Access remained available.
10. Downloaded a real authenticated ZIP export. Every exported flashcard included
    a boolean `prerequisiteAccessGranted`; the earned dependent exported as
    granted and unlocked, even with unsecured prerequisites.
11. Inspected the updated stability-floor help at desktop and narrow widths.
    The text explained initial access and permanence without clipping. The
    mechanical UI detector reported no findings.

Screenshots:

- [Desktop settings](2026-10-21-permanent-access/settings-desktop.png)
- [390px emulated settings viewport](2026-10-21-permanent-access/settings-390px.png)

Removed both temporary decks and the temporary export job afterward, confirmed
the account settings were unchanged, and closed only the task's browser session.

## Migration and controlled checks

The operator-run migration was executed against the isolated development
deployment. Its first run migrated the four existing sample flashcards. The three
unlocked cards retained access, and the unreviewed locked dependent stayed gated.
A second run changed nothing. The final one-card batch implementation was also
run through its scheduled continuations; inspection found no pending migration
jobs and no flashcards missing the milestone field.

Temporary checks outside the repository exercised the actual lock-refresh,
bulk-refresh, migration helper, and migration handler code with controlled
inputs. They covered all-direction initial gating; later lapses; restoration to
New as on Undo; higher floors; added links; archive/unarchive; legacy unlocked,
locked-studied, and locked-unreviewed cards; migration idempotency; multiple
scheduled pages; and skipping deleting libraries. Eight checks passed. The prior
implementation failed the new permanence and migration requirements. A natural
multi-day lapse was not awaited in the live app; lapse states were exercised in
these controlled checks.

The migration reads one flashcard's units per transaction to bound bytes as well
as document count. It uses surviving unit review counts and last-review timestamps,
not unbounded lifetime log scans. A legacy locked card with no surviving review
history cannot prove it was ever accessible and remains gated. The backend README
contains the deployment command and completion check.

## Validation

- `pnpm typecheck`
- `pnpm lint`
- `pnpm --filter @armin/web build`
- `pnpm --filter @armin/mobile check:bundle`, Android/iOS compatibility only
- `pnpm test`, successful runner exit with no configured test tasks
- `git diff --check`

No mobile source or native configuration changed. The previously reported
learning-step precision mismatch remains a separate follow-up.
