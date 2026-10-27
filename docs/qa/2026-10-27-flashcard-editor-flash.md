# Flashcard editor content flash

Validated in headless Chromium through agent-browser against this worktree's
isolated local deployment. This was a desktop browser walkthrough, not a physical
mobile-device check. Used the seeded sample library.

## Reproduction

Opened a basic flashcard from the deck grid and sampled the first Markdown field
on each requestAnimationFrame for 30 frames. Before the fix the question appeared,
then the field was empty for two frames, then the question returned. The assertion
that every sampled frame contained the saved question returned `pass: false`.
This matches the supplied recording's brief example-placeholder flash.

## Cause and fix

The static preview was replaced as soon as the rich editor component mounted.
TipTap initially returned no editor, then created an empty editor, then populated
it from its deferred onCreate callback. Both intermediate states could paint.
Keep the preview while the instance is unavailable and initialize the saved
Markdown (or select lossless source mode) in a layout effect before painting.
Attach overflow observation when the actual editor container becomes available.

## Walkthrough results

- Basic card: all 30 frames retained the saved question; zero empty frames.
- Repeated after a full page navigation and opening the deck again: all 30
  frames retained the saved question; zero empty frames.
- Autofocus landed on `Flashcard front` after initialization.
- Closed the basic card with Escape and opened the typed-answer card: all 30
  frames retained its saved prompt; zero empty frames.
- Saved question, answer, and demo tag appeared correctly in the basic editor.
- No permanent automated suite added, per the repository's validation policy.

## Project checks

- `pnpm check`: passed, zero errors; 61 lint warnings across the repository.
- `pnpm --filter @armin/web build`: passed (build reports sourcemap warnings).
- `pnpm --filter @armin/mobile check:bundle`: passed for Android and iOS.
