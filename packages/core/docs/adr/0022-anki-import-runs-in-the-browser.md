# Anki import runs in the browser; the server only sees validated cards

Users import Anki decks (`.apkg`, `.colpkg`, and plain-text exports) from the web
app. The file is opened and converted **in the browser**, in a Web Worker, and
the backend receives ordinary flashcard input in batches through
`convex/imports.ts`.

## Why

- Anki packages with media are often hundreds of megabytes. Convex HTTP
  request bodies and action memory are far smaller, so uploading the package for
  server-side parsing would fail exactly for the decks people most want to move.
- Images already have a trusted path: `/upload-image` sniffs the bytes,
  content-addresses the file, and enforces the per-library quota. The importer
  uploads each referenced image through it rather than adding a second one.
- The browser is untrusted either way. Every imported card still passes
  `validateFlashcardInput` and the shared `insertFlashcard` helper (ADR 0005), so a
  crafted package can't produce anything the editor couldn't.

## How it is split

- `@armin/core/anki` holds the contract types and a pure converter
  (`convertAnkiCollection`): notetype mapping, Anki template rendering, HTML to
  Markdown, cloze and image-occlusion conversion, and schedule replay through
  ts-fsrs. It has no SQLite, DOM, or Node dependency, so mobile can reuse it.
- `apps/web/src/lib/anki/` reads the file (fflate, fzstd, and sql.js loaded on
  demand inside a worker) into a normalized `AnkiCollection`, and runs the import:
  upload images, re-validate with real image references, then
  `start` → `addCards` → `addReviewLogs` → `finish`.

## Consequences

- Imports are not one transaction. `imports.start` declares exact totals and
  creates the decks; batches are idempotent by request id; any failure or cancel
  deletes every deck the import made, and a cron removes imports that stall for
  an hour (a closed tab).
- Each Anki deck becomes one Armin deck named with its full path
  (`Spanish › Verbs`). Anki has no prerequisites, so imported cards start
  unlocked with no prerequisite edges.
- Anki scheduling is kept by default: Anki's own FSRS memory state when present,
  otherwise a replay of the review log; Anki's due dates always win. Imported
  review logs can't be undone (`unitVersionAfter` is 0).
- Anki's Cloze "Back Extra" maps to a new optional cloze `extra` field, shown only
  after the answer.
- Audio, video, SVG, and scripts are dropped, and MathJax stays as text; the
  preview names each loss before anything is imported.
- The beta library limits still apply. The preview blocks a selection that would
  exceed them and lets the user import a subset of decks.
