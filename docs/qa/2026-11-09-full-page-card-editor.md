# Full-page card editor walkthrough (2026-11-09)

Local worktree deployment, desktop Chromium via agent-browser (1440×900
viewport, plus a 390×844 emulated narrow viewport), sample account
`test@example.com`, deck "Agent sample library". The narrow check is an
emulated viewport, not a phone.

1. Deck page → **Add card**: the dialog shows a **Full page** button beside
   the close button ([screenshot](2026-11-09-full-page-card-editor/01-dialog.png)).
2. Typed a front and back, then **Full page**: the editor filled the
   1440×900 window. The card's fields took the main column with taller editors,
   and Type and Tags moved to the side column. Both drafts were kept, and the
   button changed to **Exit full page**
   (`aria-pressed="true"`; [screenshot](2026-11-09-full-page-card-editor/02-full-page.png)).
3. Escape with unsaved edits: "Discard changes?" asked from the floating
   560 px panel ([screenshot](2026-11-09-full-page-card-editor/03-discard.png)).
   **Keep editing** returned to full page with the draft intact.
4. **Exit full page**: back to the 560 px dialog, draft intact.
5. Full page at 390×844: one column (Type, Front, Back, Tags), no horizontal
   scroll (`scrollWidth` 390), and the footer stacked
   ([screenshot](2026-11-09-full-page-card-editor/04-narrow.png)).
6. At 1440×900, Ctrl+Enter added the card ("Explain the full page editor
   draft" appeared in the deck). The form emptied for the next card and
   stayed full page.
7. Opened that card (**Edit flashcard**), switched to full page, and added a
   1400×800 PNG to the front. The image displayed 814 px wide, compared with
   about 480 px in the dialog
   ([screenshot](2026-11-09-full-page-card-editor/05-edit-image-full.png)).
   **Save changes** with Ctrl+Enter closed the editor.

Each new open starts as the floating dialog. Validation: `pnpm check`,
`pnpm --filter @armin/web build`, `pnpm --filter @armin/mobile check:bundle`.
