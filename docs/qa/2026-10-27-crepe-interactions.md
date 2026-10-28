# Milkdown Crepe card editor — 2026-10-27

Tested the uncommitted Milkdown Crepe migration in the shared checkout at
`/home/andy-spike/.t3/worktrees/armin/t3-98b4d733`, branch
`t3/evaluate-tiptap-alternatives`, HEAD `b074a2e`, against the checkout's
existing dev server at
`http://armin-e10076973e.localhost:12872`. This was a headless Chromium
walkthrough through `agent-browser` in a named session separate from the other
tester. Desktop checks used a 1280 × 800 viewport; the narrow check used
375 × 720 emulation. This is a browser walkthrough, not a physical device,
production, or native-app test. No application source, automated test suite,
commit, push, or deployment was produced by this run. Build and static checks
remain with the implementation owner.

The deployment is shared. Another tester's cards appeared live during the
session; I did not edit them. I created a temporary deck, `Crepe QA 2026-10-27`,
for the destructive checks and deleted it in the UI at the end. The seeded basic
card was restored to its original front and back; the seeded cloze and typed-answer
cards were not saved over.

## What passed

- Signed in through the normal form with the sample account and opened the sample
  deck.
- Opened the seeded basic card: both Markdown fields loaded, focus landed in
  `Flashcard front`, and typing, select-all, bold, inline code, and inline dollar
  math (`$E=mc^2$`) worked.
- `Ctrl+Enter` saved the basic card and closed the dialog; reopening showed both
  edited fields and the math intact. The `Save changes` button also saved and
  reopened correctly when the field value had settled.
- In create mode, `Ctrl+Enter` added a card, kept the dialog open, cleared the
  fields, and the card appeared in the deck.
- Cloze: the cloze text field focused, `Ctrl+Shift+C` wrapped two selections as
  `{{1::mitochondria}}` and `{{2::cell}}`, and the Crepe `Extra` field accepted
  bold and inline math. Saving and reopening preserved both.
- Typed answer: the Prompt used Crepe, the Answer input and accepted-answer
  token field worked, and `Ctrl+Enter` created the card. Reopening preserved the
  prompt, math, answer, and accepted answer.
- GFM tables loaded in the visual editor. I edited a table cell, saved with
  `Ctrl+Enter`, and reopened the card; the edited cell persisted.
- Inline dollar math in a table cell rendered with KaTeX and round-tripped.
- Legacy `\(x^2\)` content opened in lossless source mode with a rendered
  preview, as described in the README.
- `Add image` inserted a local PNG into a visual field. Saving and reopening kept
  the image; moving the width range control to 100 px wrote
  `"w=100"` into the Markdown title and the source preserved it.
- A first-open frame sample of 200 frames after a page reload showed dialog
  content from the first frame where the dialog existed; no empty intermediate
  frame was observed, and focus was in `Flashcard front` by the fifth sampled
  frame.
- No console errors were emitted. The only warning was Milkdown's bundled Vue
  development feature-flag warning.

## Defects

### 1. Crepe's unlayered theme overrides the editor's Armin theme (high)

Every visual editor renders as a pure white panel with black text in dark mode,
and its typography and padding are the Crepe frame defaults rather than the
values in `app.css`.

Reproduction:

1. Use the sidebar theme toggle to switch to `Dark mode`.
2. Open any basic card, cloze Extra field, or typed-answer Prompt.
3. Inspect the field.

Observed computed values in the first card's front editor:

- `.milkdown` background: `rgb(255, 255, 255)`; color: `rgb(0, 0, 0)`.
- `.milkdown` custom properties: `--crepe-color-background: #ffffff`,
  `--crepe-color-on-background: #000000`.
- `.ProseMirror` padding: `60px 120px`; font: `16px "Noto Sans"`; line-height
  `26px`. The app's intended override asks for `padding: 0`,
  `font-size: inherit`, and `line-height: inherit`.
- At 375 × 720 the content width is **27 px** (267 px ProseMirror width minus
  240 px horizontal padding). "alpha" wraps as "alp / ha" and "beta" as
  "bet / a"; the two-field dialog also pushes the Back field behind the footer.

Cause: the Armin overrides live under `@layer components` in
`apps/web/src/styles/app.css`, while the Crepe theme stylesheet is unlayered.
Unlayered CSS wins over every cascade layer regardless of selector specificity.
The computed-style check found the Armin rule as
`.card-markdown-editor .milkdown .ProseMirror` in layer `components`, and the
winning Crepe rule as `.milkdown .ProseMirror { padding: 60px 120px; }` with no
layer. The same applies to the `.milkdown` color variables. This affects every
visual editor in every card type, and is the reason both the dark-mode white
panel and the narrow-viewport wrapping occur. Source mode is unaffected.

Evidence: [01-dark-basic-dialog.png](2026-10-27-crepe-interactions/01-dark-basic-dialog.png),
[02-dark-add-card-empty.png](2026-10-27-crepe-interactions/02-dark-add-card-empty.png),
[03-light-basic.png](2026-10-27-crepe-interactions/03-light-basic.png),
[04-narrow-375.png](2026-10-27-crepe-interactions/04-narrow-375.png).

### 2. Typing is lost when Save is pressed within the 200 ms Markdown debounce (high)

Crepe's `markdownUpdated` listener is debounced by 200 ms. The form submits the
React field state, which has not received the last keystrokes yet.

Reproduction with the Save button:

1. Open a saved basic card and put the caret at the end of the back field.
2. Insert ` BUTTONRACE` and click `Save changes` about 100 ms later.
3. Reopen the card. The back field still reads the old value without
   `BUTTONRACE`.

Reproduction with the keyboard:

1. Open a saved basic card with a valid front and back.
2. Append ` RACE` to the front, then dispatch `Ctrl+Enter` 150 ms later.
3. The dialog closes and the card is saved, but reopening shows the old front
   without `RACE`.

Control: appending the same text, waiting 500 ms, and then saving persists it.
The failing window is the same whether the Save button or the dialog-level
`Ctrl+Enter` handler submits.

Cause: `@milkdown/plugin-listener`'s `markdownUpdated` debouncer is 200 ms. The
form's `handleSubmit` reads `fields` from React state; the editor has the new
document, but the state update has not run. The submit path should flush the
editor's Markdown (or the listener should flush on blur/submit) before
`contentFromFields`.

### 3. Typing is lost when Edit source is clicked within the 200 ms debounce (high)

Reproduction:

1. Open a saved basic card and focus the front editor.
2. Append ` Z`, then click `Edit source` in the same task/within 200 ms.
3. The source textarea shows the previous Markdown without `Z`. The visual
   editor is destroyed, which cancels the pending debounced update.

This is the edit path, so the lost text is not recoverable by saving. A real
user can hit this by typing and immediately reaching for `Edit source`, exactly
as with the Save path above.

### 4. Opening a list or table card marks the form dirty without user edits (high)

Reproduction with a list:

1. Create a basic card with front `- alpha\n- beta` (typed as a visual bullet
   list), back `bullet back`, and save it.
2. Reopen the card, wait for the editor, and press `Escape` without editing.
3. The dialog shows `Discard changes?` even though nothing was changed.

Reproduction with a table:

1. Create or import a card whose front has a GFM table written with
   `| --- | --- |`.
2. Reopen it and click `Edit source` without editing. The source already shows
   the normalized separator `| ---------- | ----- |` (and `*` bullets for a
   `-` list).
3. Press `Escape`; `Discard changes?` appears.

Plain single-paragraph cards do not show the false prompt. Block content does:
the table card's source already showed the normalized separator and `*` bullets
before any edit, so Crepe reserialized the document on mount while the stored
value was trimmed by `contentFromFields` on save. The emitted value differs from
the initial form snapshot, so `dirty` becomes true. If the user clicks
`Save changes` to clear the prompt, the card's Markdown formatting is silently
rewritten (for example `-` to `*`, table separator widths, and display math as
noted below). The exact emitted difference for the plain bullet-list card was
not recorded; the false prompt itself was reproduced twice.

### 5. Display math `$$...$$` becomes inline `$...$` after any visual edit (medium)

Reproduction:

1. Create a basic card whose front is exactly `$$\frac{a}{b}$$` (source mode),
   with a non-empty back, and save.
2. The deck tile renders a display equation (`.katex-display`, MathML
   `display="block"`).
3. Reopen the card. The editor parses the node as
   `data-type="math_inline"`/`data-value="\frac{a}{b}"`, and the fraction
   renders in inline style.
4. Type ` tail` into the visual editor and wait 500 ms. `Edit source` now shows
   `$\frac{a}{b}$ tail`, so the display form is lost as soon as the document is
   reserialized.
5. A separate card that contained the same `$$\frac{a}{b}$$` alongside a table
   was edited and saved. Its deck tile then had zero `.katex-display` nodes and
   two inline `.katex` spans (the `$x^2$` table cell and the former display
   equation), confirming the stored and rendered downgrade.

The README documents `$$...$$` as a display delimiter, so display equations do
not survive a visual edit with their display form. Source mode for `\[\frac{a}{b}\]`
and legacy `\(...\)` math does preserve the original source and preview.

### 6. Literal square brackets force source mode on reopen (medium)

Reproduction:

1. Create a basic card and type the front as visual text: `See [1] and [2].`
2. Save and reopen it.
3. The front opens as raw source with `See \[1] and \[2].`, not as the visual
   editor. The back and other fields still open visually.

Cause: the new `needsSourceMode` regex treats `\[`/`\]` as a source-only legacy
construct. Crepe's serializer produces those escapes for ordinary literal
brackets. The previous TipTap implementation parsed the stored Markdown and did
not force source mode for an escaped bracket in a paragraph. Citation and
reference cards can hit this routinely. The deck preview still renders
`[1]` and `[2]` correctly; only the editor mode is wrong.

### 7. Focus is lost after adding a card and after switching type (medium)

After `Ctrl+Enter` adds a card in create mode, the dialog stays open and clears
the fields, but `document.activeElement` is `BODY` (verified 1.5 s after the
save), not the new `Flashcard front` editor. Typing immediately after the save
goes nowhere until the user clicks the field. The same remount sequence happens
when switching from Basic to Type answer: after clicking the `Type answer`
button, focus stays on the button; typed text is discarded and the Prompt stays
empty. The first open of a dialog does focus `Flashcard front`, `Cloze text`, or
`Prompt` correctly. The async `crepe.destroy()` of the previous editor
blurring the newly focused editor is a plausible cause. This is a regression in
the rapid-entry flow, not a data-integrity issue.

## Coverage notes

The pass/fail claims above are representative, not an exhaustive audit. I did
not exercise image drag/paste, the image zoom dialog, headings and fenced code
blocks, every Anki-imported formatting combination, the review session, or a
physical phone. I did not run `pnpm check`, the web build, or the mobile bundle
check. The findings are local-deployment defects in the uncommitted migration;
they do not establish production behaviour.

Screenshots in this report were captured from the separate `crepe-qa` browser
session. The temporary `Crepe QA 2026-10-27` deck and its cards were deleted
through the UI at the end of the run.
