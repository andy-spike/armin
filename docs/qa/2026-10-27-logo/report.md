# Armin logo across the apps

Validated in headless Chromium through agent-browser against this worktree's
isolated local deployment, signed in with the seeded sample account. The narrow
layout was an emulated 390×844 viewport, not a physical phone. The mobile app
was checked by bundle export only; its new icons were not viewed on a device or
emulator.

## Changes checked

- The `Brain` icon and serif "Armin" text are replaced by `<ArminMark>` (the
  prerequisite-tree mark) and `<ArminWordmark>` (outlined Source Serif 4
  Semibold) in the sidebar, the narrow-screen app header, the landing page nav
  and footer, the legal pages, and the sign-in family of pages.
- `favicon.ico` (16, 32, 48 px drawings) and `apple-touch-icon.png` replace
  `favicon.png`.

## Walkthrough results

- Landing nav and footer (`screenshots/landing.png`, `landing-footer.png`):
  mark and wordmark render, ink branches with teal tips.
- Sign-in (`sign-in.png`): mark and wordmark centred above the card. The link's
  accessible name is "Armin" (accessibility snapshot: `link "Armin"`).
- App sidebar, expanded (`app-sidebar.png`): mark at 20 px beside the wordmark.
- Sidebar collapsed: the wordmark fades out and the mark stays. Measured the
  mark's centre at x = 24 px, matching the Review button below it (the link's
  padding was reduced by 2 px so the larger mark stays on the rail's axis).
- Dark mode (`app-dark.png`, `legal-dark.png`): branches and wordmark follow
  the text colour; tips use the dark theme's brighter accent.
- Narrow layout header (`narrow-header.png`): mark and wordmark beside the
  sidebar trigger.
- Privacy page header (`legal-dark.png`): mark and wordmark render.
- `GET /favicon.ico` → 200 `image/x-icon`; `GET /apple-touch-icon.png` → 200
  `image/png`; the document head links both and no longer references
  `favicon.png`.
- During the walkthrough the first in-app mark (an eight-node simplification)
  read as a trident at 16–20 px. It was replaced with the full tree drawn with
  heavier nodes and strokes, which keeps the arched crown; screenshots show the
  final version. `logo-family.png` shows the icon family at real sizes.

## Project checks

- `pnpm check`: passed, zero errors; 61 lint warnings, all pre-existing.
- `pnpm --filter @armin/web build`: passed (build reports sourcemap warnings).
- `pnpm --filter @armin/mobile check:bundle`: passed for Android and iOS.
- `pnpm plugin:package`: passed with the new plugin logo.
- No automated suite added, per the repository's validation policy.
