# Sidebar deck rows and toolbar Cloze state walkthrough

Date: 2026-10-28
Checkout: `claude/manual-ui-polish` (`.claude/worktrees/armin-integrations-9e908c`)
Environment: this worktree's local Convex deployment and web app at
`http://armin-b69218dd35.localhost:19808`, the Claude desktop app's built-in
Chromium browser at an emulated 1280×800 viewport, seed account with 58 decks.

The running dev server's file watcher had stopped picking up edits, so the new
modules were not served. Both checks below exercised the shipped logic or CSS
directly on the live page instead of through a reloaded bundle.

## Sidebar rows: `content-visibility: auto`

1. Applied the row styles (`content-visibility: auto`,
   `contain-intrinsic-size: auto 2rem`, `overflow-clip-margin: 4px`) to all 58
   deck rows. Every row stayed 32px tall and the list stayed 1970px, the same
   as before, so the scrollbar does not jump.
2. Tabbed onto the third deck row: its 2px focus ring rendered in full.
3. With the clip margin set to 0px, the ring disappeared entirely (paint
   containment clips it), which is why the margin is part of the change.

## Toolbar Cloze button at chip edges

1. Before the fix, in the Edit flashcard dialog for the sample cloze card,
   moving the cursor with the arrow keys to either edge of the `FSRS` chip
   turned the toolbar Cloze button off while the chip popover stayed open.
2. The fix makes the button use `clozeRangeAt`, the same test as the popover
   and `toggleCloze`. Not re-run in the browser for the reason above.

## Not exercised

- Either change after a dev server restart.
- Mobile; neither change touches it.
