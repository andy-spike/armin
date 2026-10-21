# ISSUE-003 follow-up: deck learning progress stays within 0–100%

Date: 2026-10-21. Fixes ISSUE-003 from
[the production-readiness report](../2026-10-21-production-readiness/report.md).
Before evidence: [125% learned](../2026-10-21-production-readiness/screenshots/issue-003-progress-125.png).

## Diagnosis

`deckStats` in `packages/backend/convex/decks.ts` returned `total` as the number of
distinct active flashcards, and `learned` as the number of active **review units**
in FSRS Review state. A reversed flashcard has two review units and a cloze
flashcard has one per deletion number, so one flashcard could add several units to
`learned`. In the QA deck, four flashcards had five Review-state units, which showed
as "4 flashcards · 5 learned" and 125%.

## Fix

Progress is now counted in flashcards for both numerator and denominator. A
flashcard counts as learned only when **every** active review unit it generates is
in FSRS Review state. A partially learned reversed or cloze flashcard counts toward
`total` but not toward `learned`. This matches the glossary in
`packages/core/CONTEXT.md`, where a flashcard is the authored unit and is secured
only when all of its review units are. `learned ≤ total` therefore holds without
clamping.

Unchanged: the `DeckWithStats` shape and field types, `newCount`/`learning`/`due`
(review-unit counts used for the queue badges), scheduling, locks, and permanent
earned access. Archived units are still excluded. Locked flashcards count toward
`total` and are not learned until all their units reach Review. Consumers checked:
the web deck-card percentage and progress bar (`routes/_app/index.tsx`), the deck
header (`routes/_app/deck.$deckId.index.tsx`), and "learned"/"progress" sorting
(`lib/sort-decks.ts`). The mobile deck list (`apps/mobile/src/App.tsx`) shows only
`total` and `due`. No regenerated Convex files changed.

## Walkthrough

Isolated worktree deployment, `pnpm worktree:setup` then `pnpm dev`, desktop
Chromium through agent-browser at 1280 × 577. Signed in with the sample account
documented in `docs/dev-worktrees.md`.

1. Created deck "QA mixed progress" with a basic card, a reversed card, a cloze
   card with `c1` and `c2`, and a typed-answer card: 4 flashcards, 6 review units.
2. Reviewed all six units: Easy on typed, basic, both cloze deletions, and the
   reversed card's forward direction, and Again on its reverse direction. The
   reversed card is now partially learned.
3. Deck list: **4 flashcards, 75% learned** (3/4).
   [Screenshot](screenshots/01-deck-list-before-move.png). Deck header:
   **4 flashcards · 3 learned**. [Screenshot](screenshots/02-deck-header-before-move.png).
   The old unit-based count would have shown 5 learned and 125%.
4. Moved the typed-answer card to "Agent sample library" and reloaded. Source
   header: **3 flashcards · 2 learned**
   ([screenshot](screenshots/03-deck-header-after-move.png)). Deck list: **67%
   learned** ([screenshot](screenshots/04-deck-list-after-move.png)). The old
   count would have been 4/3 = 133%. The destination shows 5 flashcards and 20%
   learned: only the moved card is learned, and the seeded locked card counts as
   not learned.
5. Archived the cloze card: header **2 flashcards · 1 learned**
   ([screenshot](screenshots/05-deck-header-cloze-archived.png)). Unarchived it:
   back to 3 flashcards · 2 learned.
6. Deleted the basic card, confirmed, and reloaded: header **2 flashcards · 1
   learned** ([screenshot](screenshots/06-deck-header-after-delete.png)). Deck list
   showed **50% learned** ([screenshot](screenshots/07-deck-list-after-delete.png)).

At every step the counts stayed within 0–100% and matched the all-units-in-Review
rule.

## Validation

- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm --filter @armin/mobile check:bundle`: passed. The contract shape did not
  change; this was run as a precaution.
- No automated tests were added, by user decision.

Not checked: a deck with a cloze card whose units are in mixed states, beyond the
reversed case above (the same per-flashcard rule applies), the mobile UI on a
device, and other browsers.
