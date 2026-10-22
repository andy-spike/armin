# V1 fix walkthrough — card editor and dialog primitive

Date: 2026-10-22
Branch: `t3/293c35bb`
Base commit: `550ab86` (`master` at the time of the QA pass)
Environment: isolated local Convex deployment and dev server,
`http://armin-9f93e2e165.localhost:22328` (the URL printed by `pnpm dev`)
Browser: agent-browser managed Chromium. Viewports below are emulated CSS
widths/height, not real phones or tablets. No Firefox or Safari was used.

This pass covers the card editor, the shared `Dialog`, card image upload, and
cloze content validation. The other V1 QA findings are outside this worktree.

## Results

| # | Issue | Result |
| --- | --- | --- |
| 1 | Stored Markdown with a heading opens the editor empty | Fixed |
| 2 | Card dialog overflows short viewports; 320px footer/tab clipping | Fixed |
| 3 | Dialogs do not move focus in / restore it to the opener | Fixed |
| 4 | No unsaved-changes guard on the card form | Fixed |
| 5 | Empty cloze deletion is accepted | Fixed |
| 6 | Generic image upload errors; oversized upload returns 500 | Fixed |
| 7 | Two inputs named "Add tag" in the typed-answer editor | Fixed |

## 1. Stored Markdown heading opened the field empty

**Root cause.** `markdown-editor.tsx` disabled `heading`, `blockquote`, and
`codeBlock` in `StarterKit`, but `@tiptap/markdown` still parsed stored
Markdown into those node types. The ProseMirror schema rejected the heading
(`RangeError: Unknown node type: heading`), Tiptap logged
`Invalid content`, and the field rendered as an empty document while the form
state still held the original text. Saving then overwrote the stored content
with whatever the user typed.

**Change.**

- `apps/web/src/components/ui/markdown-editor.tsx`: enable the full
  `StarterKit` schema (headings, blockquotes, code blocks, lists, horizontal
  rules, and the rest) so every block type the Markdown parser can emit has a
  home in the schema. The editor root also receives `markdown-content`, reusing
  the read-only renderer's list/quote/code styles.
- A fallback loader catches Markdown the schema still cannot represent (GFM
  tables, for example) and renders the raw text as paragraphs instead of an
  empty document. The form state is not changed by loading, so opening and
  saving an unsupported construct does not rewrite it.
- Audit of the parser with the enabled extensions:
  `# Heading` -> heading; `> quote` -> blockquote; `- one` -> bullet list;
  fenced code -> code block; `---` -> horizontal rule; HTML -> literal text;
  a table-only document parses to zero nodes, which triggers the literal-text
  fallback. No tested stored Markdown now loads empty.

**Verification.** `screenshots/heading-editor-loaded.png` shows the reopened
card with the H1 and paragraph. Saving and reopening again kept both. Console
had no `[tiptap warn]` after the change. This card is
`Markdown heading test` (back: `# Heading` + blank line + `Normal paragraph.`)
in the sample deck.

## 2. Dialog viewport overflow and 320px clipping

**Root cause.** The panel had no maximum height or internal scroll area, so a
750px image-card dialog was centred at `top: -87.5px` on a 577px viewport.
The title/Close were above the viewport and Save was below it. The footer and
type tabs were single non-wrapping rows, so at 320px they extended past the
panel (`Cancel` started at x = -30).

**Change.**

- `apps/web/src/components/ui/dialog.tsx`: the panel is capped at
  `calc(100dvh - 2rem)`. With the new optional `footer` prop, the panel is a
  flex column with a fixed header, an internally scrolling body
  (`overflow-y-auto overscroll-contain`), and a fixed footer. Titled dialogs
  without a footer get a sticky header so their title and Close stay visible
  while the dialog scrolls. The panel also receives `tabIndex={-1}` for the
  focus fallback in issue 3.
- `apps/web/src/components/flashcard-form-dialog.tsx`: the card form passes
  its action row through `footer`, so Save/Cancel cannot scroll away. The type
  tabs are a two-column grid on narrow widths and four columns from `sm` up.
  Footer actions stack vertically below `sm` and sit in one row above it.

**Verification.** `screenshots/dialog-with-image-1280x577.png` and
`dialog-1280x577-measurements.txt`: panel 16–561px in a 577px viewport, title
at 41–69px, Close at 35–67px, Save at 508–544px, body scrollHeight 495 vs
clientHeight 406. At 320×844, `dialog-edit-320.png` and
`dialog-320-measurements.txt` show Cancel and Save at x 41–279 (fully inside),
and every type tab at 116px with content 114px (no overflow). Plain dialogs
also fit: the deck settings dialog still opens and renders normally
(`deck-settings-still-works.png`).

## 3. Dialog focus entry and restoration

**Root cause.** The opener was captured in a `useEffect` after React had
already applied an input's native `autoFocus` during commit, so dialogs with an
autofocused input stored the dialog's own input as the return target (which
then unmounted). Dialogs with no input, such as Delete deck, had no focus
target at all and left focus on `BODY`. A dropdown menu also unmounts its
items when the dialog opens, so the focused menu item is gone by close time.

**Change.** `apps/web/src/components/ui/dialog.tsx` now:

- captures the active element during render, before dialog content/autoFocus
  mounts;
- falls back to the panel itself (`tabIndex={-1}`) when there is no field to
  focus, so confirm dialogs move focus inside and are announced via
  `aria-labelledby`;
- keeps a small history of recent external focus targets and, when the
  original opener is detached (dropdown case), returns focus to the last
  connected one.

**Verification.** `screenshots/focus-restore.txt` records
`document.activeElement` for Delete deck (opened from the Deck actions menu),
New deck, and the card editor: focus starts inside each dialog and returns to
the corresponding trigger after Escape. Backdrop click on Delete deck also
returned focus to "Deck actions".

## 4. Unsaved-changes guard

**Root cause.** Escape, a backdrop click, and Cancel called the parent's
`onClose` immediately; no dirty state existed.

**Change.** `flashcard-form-dialog.tsx` snapshots the editable fields (type,
front/back, cloze text, prompt/answer/accepted answers, tags) when the dialog
opens and compares the current values on close. A dirty form swaps the same
dialog to a "Discard changes?" confirmation with "Keep editing" and "Discard
changes". Labels stay static per ADR 0016. "Keep editing" receives focus when
the confirmation appears. Using the same dialog avoids the nested-modal
Escape/Tab conflicts the image preview already works around.

**Verification.** `screenshots/discard-confirmation-320.png`. Escape with an
edited front showed the confirmation; "Keep editing" returned to the form,
and "Discard changes" closed the dialog and returned focus to the Add card
button. Cancel with no edits still closes immediately.

## 5. Empty cloze deletion

**Root cause.** `buildContent` only checked that at least one cluster existed;
`clozeClusters` counts `{{1::}}`, so an empty answer passed both the UI and
the core zod schema.

**Change.**

- `packages/core/src/flashcard-rules.ts`: new `hasEmptyClozeDeletion`
  (whitespace-only answers count as empty).
- `packages/core/src/flashcard-types.ts`: the strict authoring schema rejects
  any empty deletion with "Every cloze deletion needs an answer." The backend
  already validates through `validateContent`, so the API rejects it too.
  `parseStoredContent` deliberately keeps the previous, looser cloze schema so
  a card written before this fix remains readable; it can then be repaired in
  the editor, whose Save stays disabled while the deletion is empty.
- `flashcard-form-dialog.tsx`: `buildContent` rejects empty deletions; the
  cloze field shows an inline `role="alert"` message, marks the textarea
  `aria-invalid`, highlights the offending chip, and keeps Add/Save disabled.

**Verification.** `screenshots/cloze-empty-validation.png` and
`cloze-empty-validation.txt`: empty deletion -> Add card disabled, alert
visible, `aria-invalid="true"`. Replacing it with `{{1::mitochondria}}` cleared
the message and enabled Add card. Direct core checks:
`validateContent("cloze", { text: "Empty {{1::}} test." })` rejects (with a
space-only answer too), while `parseStoredContent` still reads a stored legacy
card.

## 6. Image upload errors

**Root cause.** The picker accepted `image/*`, the client uploaded any size,
and the UI reduced every failure to a fixed string. The backend already
returned 413 for an oversized body, but it responded before reading the
request; the dev proxy was still writing and surfaced `EPIPE` as a 500.

**Change.**

- `apps/web/src/components/ui/markdown-editor.tsx`: the picker accept list is
  exactly the supported set (PNG, JPEG, GIF, WebP, BMP, AVIF; SVG excluded).
  The client checks size against `MAX_MEDIA_FILE_BYTES` before uploading and
  shows the file's size versus the 10 MB limit. Unsupported image types show
  the supported-format message without a round trip. Server/network failures
  now use the server's text or a specific connection message instead of the
  generic fallback.
- `packages/backend/convex/media.ts`: oversized bodies are drained before the
  413 is returned (both when `Content-Length` declares too much and when the
  stream crosses the limit), so a proxy finishes sending and passes the 413
  through instead of seeing a mid-write reset.

**Verification.** `screenshots/upload-too-large.png`,
`upload-unsupported-type.png`, and `media-upload-errors.txt`: a 41 MB PNG made
no request and showed "That image is 41 MB. Images must be 10 MB or smaller.";
an SVG made no request and showed the format list; a small PNG uploaded (200)
and inserted. A 12 MB body sent directly through the same-origin proxy
returned HTTP 413 "Image too large." The dev log's EPIPE count stayed at the
two pre-fix occurrences; no new EPIPE or 500 appeared. The picker's accept
attribute is the six supported MIME types.

## 7. Duplicate "Add tag" accessible names

**Root cause.** `TagsInput` hardcoded `aria-label="Add tag"` and was used for
both tags and accepted answers.

**Change.** `TagsInput` takes an `ariaLabel`; the accepted-answers instance
passes "Add accepted answer", the tags instance keeps "Add tag".

**Verification.** `screenshots/typed-answer-accessible-names.txt` shows the
three textboxes as "Answer", "Add accepted answer", and "Add tag".

## Validation run

- `pnpm typecheck` — passed (4/4 workspaces).
- `pnpm lint` — passed.
- `pnpm --filter @armin/web build` — passed.
- `pnpm --filter @armin/mobile check:bundle` — passed (Android and iOS
  bundles exported).
- Running-app walkthrough against the isolated worktree deployment, signed in
  as `test@example.com`, as described above.

No unit, integration, or E2E suites were added (project decision).

## Data and environment left behind

Two walkthrough cards remain in the sample deck of this isolated local
deployment: `Markdown heading test` (heading/paragraph) and
`Markdown blocks test` (mixed Markdown). The small PNG used while checking the
image-card layout belongs to a discarded draft; the unreferenced-media cleanup
will remove it. The dev server and agent-browser session were stopped after the
walkthrough.

## Scope

Changed files:

- `apps/web/src/components/flashcard-form-dialog.tsx`
- `apps/web/src/components/ui/dialog.tsx`
- `apps/web/src/components/ui/markdown-editor.tsx`
- `packages/backend/convex/media.ts`
- `packages/core/src/flashcard-rules.ts`
- `packages/core/src/flashcard-types.ts`

No changes were made outside the assigned area, and no generated Convex or
route files changed.
