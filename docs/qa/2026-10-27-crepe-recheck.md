# Milkdown Crepe re-check — 2026-10-27

Re-tested the seven defects in
[2026-10-27-crepe-interactions.md](2026-10-27-crepe-interactions.md) after the
fixes in the shared checkout at
`/home/andy-spike/.t3/worktrees/armin/t3-98b4d733`, branch
`t3/evaluate-tiptap-alternatives`, HEAD `b074a2e`. The app code was still
uncommitted, and stayed unmodified by this run.

This was a headless Chromium walkthrough through `agent-browser` in a dedicated
session, `crepe-recheck`, against the checkout's running dev server at
`http://armin-e10076973e.localhost:12872`, signed in with the credentials in
`.armin/demo-account.json`. Desktop checks used a 1280 × 800 viewport; the narrow
check used 375 × 720 viewport emulation. This is a browser walkthrough, not a
physical device, production, or native-app test. No application source, commit,
push, or deployment was produced. Static checks and the web build remain with
the implementation owner.

The deployment is shared. Another tester's cards appeared live (the sample deck
went from 19 to 25 cards during the run), and another QA report
(`2026-10-27-crepe-fidelity.md`) appeared in the same checkout. I did not open
or edit their cards. I created a temporary deck, `Crepe Recheck 2026-10-27`,
for the destructive checks and deleted it through the UI at the end.

## Verdict

| # | Prior defect | Result |
| --- | --- | --- |
| 1 | Crepe's unlayered theme overrides the Armin theme | **Fixed** for the dark-mode white panel, the 375 px content squeeze, and padding. Residual typography note below (16 px body text). |
| 2 | Typing lost when Save is clicked within the 200 ms debounce | **Fixed**; a real Save click 80.2 ms after the last input persisted the last characters. |
| 3 | Typing lost when Edit source is clicked within the 200 ms debounce | **Fixed**; a real Edit source click 80.4 ms after the last input showed the new text in the textarea. |
| 4 | Opening a list or table card marks the form dirty | **Fixed**; both cards closed on Escape without `Discard changes?`, and the table's source still had its original `\| --- \|` separator. |
| 5 | Display `$$...$$` becomes inline after a visual edit | **Fixed for preservation**; the stored value and the deck preview kept the block form after typing nearby text. Two non-blocking observations below. |
| 6 | Literal square brackets force source mode | **Fixed**; `See [1] and [2].` reopened visually while the stored source stayed `See \[1] and \[2].`. Legacy `\(x^2\)` still opens in source mode with a preview. |
| 7 | Focus lost after adding a card or switching type | **Fixed**; focus was in `Flashcard front` after a create and in `Prompt` after switching to Type answer, and typing landed in both. |

No remaining blocker was found in the seven issues. One new confirmed,
non-blocking defect and three observations are recorded below.

## Evidence

### 1. Theme and responsive layout

Dark mode, 1280 × 800, an empty create dialog:

- `.milkdown` computed background `rgba(0, 0, 0, 0)` and color
  `rgb(206, 205, 195)`, not a white panel.
- `--crepe-color-background` was `#100f0f` and
  `--crepe-color-on-background` was `#cecdc3`, matching the app tokens
  `--color-surface: #100f0f` and `--color-ink: #cecdc3`.
- `.ProseMirror` padding was `0px`, font-family was Inter, and width was 484 px
  in a 510 px editor.

Light mode, 1280 × 800, the bracket card open:

- `.milkdown` background was transparent and `--crepe-color-background` was
  `#fffcf0`, matching `--color-surface`.
- `.ProseMirror` padding was `0px`.

375 × 720 emulation, same dark dialog:

- Dialog width 343 px, editor width 293 px, `.ProseMirror` width 267 px with
  `padding: 0px`. The content no longer wraps as `alp / ha` and `bet / a`, and
  both Front and Back were visible above the footer as the dialog body
  scrolled. This is an emulated viewport, not a real phone.

Residual typography note: the editor body is still 16 px with a 26 px line
height while the surrounding form text is 14 px with a 22.75 px line height.
Crepe's `reset.css` sets `.milkdown { font-size: var(--crepe-base-font-size,
16px) }`; the Armin rule sets `.ProseMirror { font-size: inherit }`, so it
inherits 16 px rather than the 14 px wrapper. The font family is now Inter.
This is cosmetic and not a blocker for the reported layout defect.

Evidence: [01-dark-basic-1280.png](2026-10-27-crepe-recheck/01-dark-basic-1280.png),
[02-dark-basic-375.png](2026-10-27-crepe-recheck/02-dark-basic-375.png),
[03-light-basic-1280.png](2026-10-27-crepe-recheck/03-light-basic-1280.png).

### 2. Save and Ctrl+Enter within the debounce window

I opened the saved card, put the caret at the end of Back, typed
` BUTTONRACEZ`, then installed an `input` listener that clicked the real
`Save changes` button 80 ms after the last input event.

- Input events: 6; last input at `204059.9` ms; Save click at `204140.1` ms;
  gap **80.2 ms**.
- The dialog closed. Reopening showed Back as
  `back base BUTTONRACEZ RACE2` and the deck tile contained the same value, so
  the final keystrokes were not lost.

Control: the same card previously saved normally after a settled edit.

#### Ctrl+Enter

On the same card, I typed ` CTRLRACE` into Front and dispatched a
document-level `keydown` (`Enter`, `ctrlKey: true`) 80 ms after the last input
event, exercising the dialog's real shortcut handler.

- Input events: 9; last input at `218182.1` ms; key event at `218262.4` ms;
  gap **80.3 ms**.
- The dialog closed and the tile updated. Reopening showed Front as
  `Button race base CTRLRACE`, with `CTRLRACE` present.

The key event was dispatched in-page at 80 ms rather than by a separate CLI
process, because the CLI cannot reliably hit a sub-200 ms gap. The real Save
and Edit-source paths above used real clicks.

### 3. Edit source within the debounce window

On the reopened card, I typed ` ZRACE2` into Front and clicked that field's real
`Edit source` button 80 ms after the last input.

- Input events: 7; last input at `8831.0` ms; click at `8911.4` ms; gap
  **80.4 ms**.
- Dialog stayed open; the front source textarea contained
  `Button race base CTRLRACE ZRACE ZRACE2`. No text was lost.

### 4. False dirty state on list and table cards

List:

- Created a card whose front rendered as a two-item bullet list `alpha`,
  `beta`, and Back `bullet back`.
- Reopened it: the visual editor showed `alpha` / `beta` and Back
  `bullet back`.
- Pressed `Escape` without editing. The dialog closed directly; no
  `Discard changes?` appeared.

Table:

- Created a card from source with front
  `| A | B |\n| --- | --- |\n| 1 | 2 |` and Back `table back`.
- Reopened it: the visual table rendered and an immediate `Escape` closed
  without a prompt.
- Reopened again, clicked `Edit source` without editing, and read the textarea:
  it showed the **original** `| --- |` separator, not Crepe's normalized
  `| ---------- | ----- |`. `Escape` then closed without a prompt.

The `loaded-value guard` is behaving as intended: mount-time serialization no
longer enters the form state, so opening does not make the card dirty.

### 5. Display math

Created a card from source with front `$$\frac{a}{b}$$` and a non-empty Back.

- The deck tile rendered one `.katex-display` node with MathML
  `display="block"` before any edit.
- Reopening the card parsed the block as Crepe's LaTeX representation
  (`<pre data-language="LaTeX"><code>\frac{a}{b}</code></pre>`), not as inline
  math, and the editor showed no KaTeX node at rest.
- I placed the caret at the end, typed ` tail`, waited ~800 ms, and clicked
  `Edit source`. The value was:

  ```
  $$
  \frac{a}{b}
  $$

  &#x20;tail
  ```

  The display delimiters were preserved.
- After saving and returning to the deck, the tile still had exactly one
  `.katex-display` node with MathML `display="block"` and no inline downgrade.

So the original display-to-inline defect is fixed. One UX observation and the
leading-space defect remain:

- The visual editing surface for block math is a grey LaTeX code block, not a
  rendered equation. That is Crepe's representation of a `math` node as a
  `LaTeX` code block; the deck and source previews render the equation. If the
  product expects an equation to be visible while editing, this is a UX gap.
- The typed leading space became `&#x20;`, which the read-only renderer shows
  literally. See the new defect below.

Evidence: [04-display-math-visual.png](2026-10-27-crepe-recheck/04-display-math-visual.png),
[05-display-math-source.png](2026-10-27-crepe-recheck/05-display-math-source.png).

### 6. Literal square brackets

- Typed `See [1] and [2].` into the visual Front and saved with Back
  `bracket back`.
- Reopening opened the **visual** editor (no textarea), with the text
  `See [1] and [2].`.
- `Edit source` showed the stored form `See \[1] and \[2].`, confirming Crepe
  escapes the literal brackets, and `Escape` closed without a prompt.
- Legacy `\(x^2\)` content still opened in lossless source mode with a rendered
  KaTeX preview, so the narrower bracket check did not regress legacy math.

### 7. Focus after create and after switching type

Create flow:

- In create mode, Ctrl+Enter added the card and kept the dialog open with
  cleared fields.
- 1.5 s after the save, `document.activeElement` was the `Flashcard front`
  ProseMirror (`class` included `ProseMirror-focused`).
- Typing `focus after create` immediately afterwards landed in Front.

Type switch:

- Clicking `Type answer` from Basic replaced the form with the typed-answer
  fields.
- 1.2 s later `document.activeElement` was the `Prompt` ProseMirror; typing
  `FocusProbe` landed in the Prompt and the field showed `FocusProbe`.

First open still focused `Flashcard front` in the create dialog.

## New confirmed issue: a leading space is stored as `&#x20;` and rendered literally

This is a real, reproducible data-fidelity defect, independent of the seven
issues and not covered by the prior report.

Reproduction:

1. Open Add card with an empty Front.
2. In the visual editor, type a space then `tail`.
3. Click `Edit source`. The textarea contains `&#x20;tail\n`, not a leading
   space.
4. Save the card with any Back. The deck tile renders the literal text
   `&#x20;tail`.

The same happens when the space begins a new paragraph after block content:
after the display-math card, typing ` tail` below the equation stored
`...\n\n&#x20;tail`, and the deck tile and source-mode preview showed the
literal entity. `contentFromFields` trims ordinary outer whitespace, but does
not remove or decode the entity, so the value persists.

Crepe's serializer is preserving the otherwise-unrepresentable leading space as
an HTML entity. The read-only Markdown renderer does not decode it, so it
becomes visible text. Either the stored value should be normalized (for
example, drop the leading entity) or the renderer must decode entities.

Evidence: [06-leading-space-entity.png](2026-10-27-crepe-recheck/06-leading-space-entity.png)
(the source textarea shows `&#x20;tail`).

## Unconfirmed observation: fields flipped to source mode on the first keystroke

At one point, after a dirty source-mode edit was discarded, three consecutive
create dialogs replaced the front editor with a source textarea on the first
typed character:

- typing `- alpha` produced a source value of `* alpha\n`;
- typing `-` produced `\\-\n`;
- typing `hello` produced `hello\n`.

The trailing newline in each value is Crepe's serialization, so the visual
editor had accepted the text before the field switched to source mode. A page
reload cleared the behaviour. I could not reproduce it afterwards in repeated
open/Edit-source/discard/reopen sequences, and instrumenting the
`needsSourceMode` regex showed no match for the triggering values. No page
errors were logged.

I am recording this as an **unconfirmed observation**, not a confirmed
regression. The cause is currently speculation (possibly stale editor state
from the dialog's exit snapshot or a late editor-creation failure), and it
should be retested in a fresh session before release. It did not recur during
the final verification of any of the seven issues.

## Console and coverage notes

- No page errors were reported by `agent-browser errors`.
- Console output was limited to Vite connection messages, the React DevTools
  development message, and Milkdown's bundled Vue feature-flag warning.
- I did not exercise image drag/paste, the image zoom dialog, headings and
  fenced code blocks, the review session, Anki-imported formatting, or a
  physical phone.
- I did not run `pnpm check`, the web build, or the mobile bundle check.
- The temporary `Crepe Recheck 2026-10-27` deck and its six cards were deleted
  through the UI at the end of the run. No sample-deck card was saved over.
- Screenshots were captured from the dedicated `crepe-recheck` browser
  session.

## Bottom line

All seven prior defects passed re-test in this browser walkthrough. The display
math fix preserves `$$...$$` as a block through an edit and a save, the theme
fix removes the dark-mode white panel and the narrow-viewport squeeze, and the
Save, Ctrl+Enter, and Edit-source races no longer lose text at 80 ms. The
remaining work is the new `&#x20;` leading-space rendering defect (medium,
release-relevant but outside the seven) and the optional typography/block-math
editing polish. The single source-mode flip episode is unresolved but not
reproducible; treat it as a retest item, not a confirmed blocker.
