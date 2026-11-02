# Anki import runs in the browser; the server only sees validated cards

Users import Anki decks (`.apkg`, `.colpkg`, and plain-text exports) from the web
app. The file is read **in the browser** in a Web Worker, converted locally, and
the backend receives ordinary flashcard input in batches through
`convex/imports.ts`.

## Why

- Anki packages with media are often hundreds of megabytes. Direct File Storage
  uploads can accept large files, but hosted Node action memory is bounded. Our
  benchmark found that compressed inputs can expand beyond that budget. Keeping
  parsing local avoids building and operating a separate cloud processor.
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
- `@armin/core/anki/reader` reads the file (fflate and fzstd, with the caller
  injecting sql.js and the file bytes) into a normalized `AnkiCollection`. The
  web app runs it on demand inside a worker; the converter kit runs it in Node.
- `apps/web/src/lib/anki/` runs the import: upload images, re-validate with real
  image references, then `start` → `addCards` → `addReviewLogs` → `finish`.

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
- Images and audio (MP3, OGG, M4A, WAV, FLAC, AAC) are kept. Audio is stored
  as `![audio](armin-media:…)` and plays from a button, with autoplay and a
  replay shortcut in review; it has its own per-library quota because it is
  far larger than images. SVG is drawn to a PNG in the browser (never stored as
  SVG); the Node kit can't, so it reports those cards. MathJax becomes KaTeX.
- Superscript, subscript, and deliberate highlights (`<mark>`, `<u>`, colored
  text that isn't black, white, or gray) become `^x^`, `~x~`, and `==x==`.
  The rich editor can't show these or audio, so such fields open as source
  with a rendered preview.
- Video, text-to-speech, scripts, and note-type styling are dropped; the
  preview names each loss before anything is imported.
- Each deck's options preset carries its desired retention, steps, maximum
  interval, and FSRS parameters into deck settings. Daily limits stay behind:
  Armin has one library-wide limit. Buried cards stay buried until the next
  study day, new cards keep Anki's queue order (spread over the order keys so
  they interleave with existing new cards), and flags become `flag::<color>`
  tags.
- Custom note types render from their templates by default; the preview can
  instead map their fields onto Basic, Basic and reversed, or Type the answer.
  Re-importing an updated deck is out of scope: it creates new decks.
- The beta library limits still apply. The preview blocks a selection that would
  exceed them and lets the user import a subset of decks.

## Assistant-assisted import

The app recommends an assistant route while keeping browser import directly
available. `get_anki_import_guide` provides a versioned, checksummed kit that
reuses this converter and reader. A capable agent executes it in its own Node
workspace; Armin never parses the archive in the cloud. File access and code
execution are required, and hosted chat compatibility must be verified rather
than inferred from MCP connectivity.

Assistant imports preserve supported images, start fresh, and create new decks.
Unresolved content requires a requested repair or an explicit skip. Polishing
is a separate user request. After reviewing the final preview, the user approves
its content commitment. Staging and bounded materialization keep incomplete
imports hidden until all decks publish together. The backend rechecks ownership,
active grants, quotas, and cancellation, and cleans up abandoned sessions.
Ordinary agent authoring stays text-only; media upload is scoped to a staging
import. See [assistant import](../../../../docs/anki-assistant-import.md).
