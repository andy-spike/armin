# V1 QA fixes: settings, deck settings, theme, sidebar, home

Date: 2026-10-22. Branch: `t3/v1-qa-settings-sidebar-fixes`. Fixes the
settings/navigation/contrast issues from
[the cross-cutting QA report](2026-10-22-v1-qa-cross-cutting/report.md).

Environment: isolated T3 worktree deployment, http://armin-39e2ca7155.localhost:34440,
`pnpm worktree:setup` then `pnpm dev`. Browser: agent-browser managed Chromium,
desktop Linux. Viewports are emulated CSS widths (1440, 768, 390, 320); no real
phones, Firefox, or Safari were used. Signed in as `test@example.com`.

## Issue 1 (major): Deck settings could not be saved at 320px

**Root cause.** The dialog footer was a single non-wrapping row: the 174px
"Reset all to inherited" button plus the Cancel/Save group needed about 360px in
a 288px dialog. The setting rows also kept a two-column
`minmax(0,1fr)_auto` grid, so the description column collapsed beside the fixed
control column.

**Change** (`apps/web/src/components/deck-settings-dialog.tsx`):

- Footer is `flex flex-wrap` with `ml-auto` on the action group, so the buttons
  wrap to a right-aligned second row instead of leaving the dialog. Horizontal
  padding drops to `px-4` below `sm` in the header, body, and footer.
- `OverrideRow` stacks its label/description above the control below `sm`
  (`max-sm:grid-cols-1`), and the control block aligns left in that layout.
- The body keeps its own vertical scroll, so the footer is always reachable.

**Verification.** 320 × 844: dialog x=16, width 288, right edge 304; footer
Save button x=222.2–287, fully inside; footer wraps to two rows (height 109).
At 390 × 844: dialog right 374, Save right 357. Clicking Save closed the dialog
and showed "Deck settings saved". Screenshots:
[320](2026-10-22-v1-fix-settings-sidebar/screenshots/deck-settings-320-fixed.png),
[saved at 320](2026-10-22-v1-fix-settings-sidebar/screenshots/deck-settings-320-saved.png),
[390](2026-10-22-v1-fix-settings-sidebar/screenshots/deck-settings-390-fixed.png).

## Issue 2 (major): Settings tabs hid Data/Appearance at 320/390px

**Root cause.** The five tabs were a single non-wrapping flex row (444px) inside
a 288px content box. They widened the page scroll container instead of the tab
list, and the page scrolled sideways when Appearance received focus.

**Change** (`apps/web/src/components/ui/tabs.tsx`):

- `TabsList` is `flex-wrap`; tabs are `whitespace-nowrap`.
- Below `sm`, the sliding indicator is hidden and the active tab gets its own
  accent bottom border. The selected style now keys off Base UI's actual
  `data-active` attribute (the old `data-selected:` classes never matched), so
  the active tab is visible at every width.
- At `sm` and above the list stays one row and keeps the sliding indicator.

**Verification.** 320 × 844: list is 288 × 78 with rows
Scheduling/Keyboard/Account and Data/Appearance; document and `.route-scroll`
scroll widths both 320, so there is no page-level horizontal scroll. Focusing
Appearance leaves the page at `scrollLeft` 0 and shows its panel. 390 × 844:
document width 390, Appearance wraps to a second row, all tabs reachable.
Screenshots:
[320](2026-10-22-v1-fix-settings-sidebar/screenshots/settings-320-fixed.png),
[320 with Appearance focused](2026-10-22-v1-fix-settings-sidebar/screenshots/settings-320-appearance-fixed.png),
[390](2026-10-22-v1-fix-settings-sidebar/screenshots/settings-390-fixed.png),
[1440 unchanged](2026-10-22-v1-fix-settings-sidebar/screenshots/settings-1440-fixed.png).

## Issue 3 (major): Settings controls had no accessible names

**Root cause.** `Row`/`OverrideRow` rendered the visible label as a `<p>` with no
id, and the controls were separate children, so nothing connected them.

**Change** (`settings-layout.tsx`, `deck-settings-dialog.tsx`,
`scheduling-inputs.tsx`, `ui/switch.tsx`, `settings.tsx`):

- `Row` and `OverrideRow` now render the label with `useId()` and accept either
  a node or a `(labelId) => node` render function.
- Every numeric input, the Preset and Theme select triggers, and all switches
  receive `aria-labelledby={labelId}`. `StepsInput` exposes its minutes/seconds
  fields as a labelled `role="group"`.
- `Switch` accepts `aria-label`/`aria-labelledby` and forwards them to its
  button.
- The same wiring is applied to the eight deck-settings controls.

**Verification.** axe on `/settings` reports no `label` or `button-name`
violations (the remaining color-contrast entries are "background could not be
determined due to a background gradient", not failures). The accessibility tree
now announces `textbox "Desired retention"`, `textbox "Maximum interval"`,
`combobox "Preset"`, `switch "Interval fuzz"`, `switch "Short-term scheduling"`,
`switch "Keep siblings together"`, etc.; the deck-settings dialog matches. Raw
axe JSON: [settings](2026-10-22-v1-fix-settings-sidebar/axe/settings-a11y.json).

## Issue 4 (minor): Contrast below WCAG AA

**Root cause.** The Flexoki semantic aliases mapped to palette steps just below
4.5:1 for the affected pairs: paper on cyan-600 = 4.43:1, muted-600 on the
sunken sidebar = 4.46:1, a keycap chip tinted over cyan-600 = 3.74:1, and faint
(700) on black in dark mode = 2.6:1.

**Change** (`apps/web/src/styles/flexoki-theme.css`):

- Light accent moves from cyan-600 to cyan-700; its hover (`--armin-accent-deep`)
  is a slightly darker cyan-700 mix so hover feedback remains distinct.
- Light `--armin-muted` moves to flexoki-700; light `--armin-faint` to
  flexoki-600 (the sign-in/sign-up "or" divider).
- Dark `--armin-faint` moves from flexoki-700 to flexoki-500.

**Verification.** Computed from the rendered page:

| Pair | Before | After |
| --- | --- | --- |
| Paper on light primary | 4.43:1 | **6.03:1** |
| Keycap on light primary | 3.74:1 | **4.89:1** |
| Light sidebar muted text | 4.46:1 | **6.42:1** |
| Dark sign-in "OR" | 2.6:1 | **5.19:1** |
| Light sign-in "OR" | 2.0:1 | **4.97:1** |
| Dark primary button | — | 6.7:1 |
| Dark sidebar muted text | — | 4.67:1 |

Screenshots:
[dark sign-in](2026-10-22-v1-fix-settings-sidebar/screenshots/signin-dark-or-fixed.png),
[light sign-in](2026-10-22-v1-fix-settings-sidebar/screenshots/signin-light-or-fixed.png).
The review rating buttons remain with their separate owner.

## Issue 5 (minor): Preset description collapsed at 320px

**Root cause.** The preset row kept its 176px select beside the description in a
288px content box, leaving about 56px for text.

**Change** (`apps/web/src/components/settings-layout.tsx`): `Row` stacks below
`sm` (grid becomes one column, controls align left). This fixes the preset row
and every other scheduling row at the same width.

**Verification.** At 320 × 844 the preset description measures 254px wide and
reads normally; the select sits below it. Screenshot:
[settings 320](2026-10-22-v1-fix-settings-sidebar/screenshots/settings-320-fixed.png).

## Issue 6 (minor): Home progress bars were unnamed

**Root cause.** The deck tile passed no label, and `Progress` had no way to
forward one.

**Change.** The home tile now passes
`aria-label={`${deck.name} learned`}` (`routes/_app/index.tsx`). `Progress`
(`ui/progress.tsx`) forwards an optional `aria-label` to its progressbar root.
This one-line primitive change is outside the listed file scope but is required
for the home usage to typecheck; the progress-label work belongs to another
agent, so expect a textual merge there.

**Verification.** The progressbar exposes
`"Advanced Molecular Biology and Cellular Genetics Foundations learned"`; axe
reports no `aria-progressbar-name` violation on `/`. Raw axe JSON:
[home](2026-10-22-v1-fix-settings-sidebar/axe/home-a11y.json).

## Issue 7 (verify): Sidebar long deck name at 768px

**Result: already fixed, confirmed.** Renamed the sample deck to
`Advanced Molecular Biology and Cellular Genetics Foundations` (keeping its
3-due badge), at 768 × 900: the label's client width is 199px against 419px of
text, with `text-overflow: ellipsis`; its right edge is 215px and the due badge
starts at 223px, so they do not collide. Document width is 768.

While measuring, axe also flagged `aria-prohibited-attr` on the deck due badge
(`aria-label` on a role-less `div`). It was in this area, so the badge now
renders its count plus an `sr-only` " due"; the violation is gone.
Screenshot:
[sidebar 768](2026-10-22-v1-fix-settings-sidebar/screenshots/sidebar-768-longdeck-fixed.png).

## Validation

- `pnpm typecheck`: passed (4/4 packages).
- `pnpm lint`: passed.
- `pnpm --filter @armin/web build`: passed.
- No automated test suites were added, by project decision.

## Data and environment left behind

The sample deck in this checkout's local deployment was renamed to the long
deck name and left in place (4 flashcards, 3 due). The dev server and browser
session were stopped after the walkthrough.
