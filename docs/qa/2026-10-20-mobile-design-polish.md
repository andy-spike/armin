# Mobile design polish walkthrough

Walkthrough of the Expo app after porting the web app's design system, 2026-10-20.
Device: the `Armin_Pixel_7_API_36` Android emulator (Android 16) running Expo Go
against this worktree's Convex dev deployment and its synthetic sample library.
This is an emulator, not a physical phone. iOS was not run.

No new unit, integration, or E2E suites were added.

## Checks

- `pnpm lint`: no errors or warnings.
- `pnpm --filter ./apps/mobile typecheck`: passed.
- `pnpm --filter ./apps/mobile check:bundle`: Android and iOS exports passed.
- `pnpm --filter ./apps/mobile check:expo`: 20 of 21 checks passed. The failure
  is an upstream patch release (`expo` 57.0.30 available, 57.0.28 pinned) and
  is unrelated to this change.

## Flows observed on the emulator

- **Sign in:** fonts (Source Serif 4, Inter, JetBrains Mono) loaded; the
  notebook grid, sharp-cornered panel, labelled fields, and password reveal
  rendered. Signed in with the demo account using the keyboard's Go key.
- **Decks:** the sample deck appeared as a ruled row with progress, due/new
  stats, and a pinned "Review all decks · 3 due" action.
- **Review:** the card front rendered centered; "Show answer" revealed the back
  and the Again/Hard/Good/Easy bar showed server interval previews (10m, 15m,
  2d, 10d). Rating Good advanced to the next card; a prerequisite unlock grew
  the session from 3 to 4. Undo restored the rated card with a "Review
  undone." notice. Clearing the queue showed the "All caught up" panel.
- **Deck-scoped review:** tapping the deck row opened that deck's review; with
  nothing due it showed the deck-specific empty copy.
- **Navigation:** Android Back and "Back to decks" both returned to the deck
  list. The deck list's bottom bar showed "All caught up · next review in 7d".
- **Themes and text size:** dark mode (`cmd uimode night yes`) and a 1.3 font
  scale rendered without clipping on the deck list and review empty state.
  The emulator was reset to light mode and 1.0 afterwards.

## Not observed

- Offline banner, error boundary, stale-card notice, and private images were
  not triggered in this walkthrough.
- Sign-out confirmation dialog was not opened; Expo Go's developer menu button
  overlaps the top-right corner in development builds.
