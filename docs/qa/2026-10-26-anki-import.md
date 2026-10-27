# Anki import, 2026-10-26

Scope: importing Anki decks into the web app (reader, converter, `imports`
backend, import dialog) and the optional cloze `extra` field. Run against the
worktree's local Convex deployment with the sample account, in headless
Chromium driven by agent-browser on Linux. Mobile-width checks used a 390 px
emulated viewport, not a real device. Nothing was deployed.

## Fixtures

Built locally (not committed) with Anki's own Python package and genanki, plus
hand-made files: current-format `.apkg` and `.colpkg` (`collection.anki21b`,
with and without scheduling, all six stock notetypes, an image, review history,
a nested subdeck), legacy `.anki21` and genanki `.anki2` packages, int64 ids
above 2^53, a filtered deck, a 183 MB `.colpkg` with 30,000 notes and 3,000
images, text/CSV variants (tab, comma, semicolon, pipe, quoted newlines,
`#html:false`, BOM and CRLF), and broken files (encrypted, truncated, random
bytes, a ZIP without a collection, an empty collection).

## Reader and converter

- Every package layout above opened in Node, and a subset through the real
  worker in Chromium. Stock kinds 1–6 were detected; big ids stayed exact;
  filtered-deck cards came back under their home deck and original due date.
- Broken files each produced a specific message (password-protected, damaged,
  not an Anki package, nothing to import) without crashing.
- The 30,000-note collection opened in about 0.5 s in Node and was converted in
  the browser in about 5 s.
- The converter was checked with a synthetic collection covering every
  notetype: each card passes `validateContent`, review-unit keys match
  `generateReviewUnits`, and totals are exact. The HTML and cloze parsers took
  3,000 random inputs without throwing or hanging.
- Image-occlusion ellipse placement was checked against Anki's source
  (`ts/routes/image-occlusion/shapes`): shapes use fabric.js's top-left origin,
  and rotated shapes now import as their rotated bounding box.

## Backend

Against the local deployment as the sample user: start → addCards (basic,
cloze, scheduled, archived) → addReviewLogs → finish; quota, validation, and
foreign-id rejections each returned a coded error and created nothing; retries
by request id returned the first result; cancel and the stale-import sweep
removed the import's decks. 100 cloze cards with 15 units each took 751 ms per
call; 1,000 review logs took 442 ms.

## Running app

- Settings → Data shows Import above Export.
- `modern.apkg`: the preview listed three decks with Anki paths, type counts,
  the image, and "8 past reviews" ([preview](2026-10-26-anki-import/03-preview-modern.png)).
  The import created three decks and four cards ([done](2026-10-26-anki-import/04-done-modern.png));
  Browse showed the imported due times ([browse](2026-10-26-anki-import/05-browse-after-modern.png));
  the image rendered; review showed the cloze answer with its extra only after
  reveal ([review](2026-10-26-anki-import/31-review-answer.png)).
- `legacy.apkg` with one deck deselected and **Start fresh**: the plan
  recomputed and the cards arrived as new ([preview](2026-10-26-anki-import/16-legacy-fresh-deselected.png)).
- `notes.txt`: a quoted multi-line field imported intact; the progress choice
  is hidden for text files ([preview](2026-10-26-anki-import/28-text-preview.png)).
- `random.apkg`: inline error, no crash ([error](2026-10-26-anki-import/07-error-random.png)).
- `big-30k.colpkg`: the preview blocked the import with exact counts against the
  2,000-card limit ([blocked](2026-10-26-anki-import/08-big-30k-preview.png)).
- A 1,900-card text file imported in about 8 s ([progress](2026-10-26-anki-import/11-progress.png)).
  Stopping at 500 cards returned the library to its prior decks and counts
  ([after cancel](2026-10-26-anki-import/14-after-cancel.png)).
- A second tab saw "Another import is still running" and could cancel it; the
  first tab then reported the import as cancelled ([second tab](2026-10-26-anki-import/25-other-import-running.png)).
- 390 px viewport: deck list, preview, progress, and done states fit
  ([preview](2026-10-26-anki-import/21-mobile-preview.png)).
- Cloze extra: created in the editor, shown only after reveal, reloaded when
  editing; an existing cloze card without extra looked unchanged.

## Checks

`pnpm check` (0 errors), `pnpm --filter @armin/web build` (sql.js only in the
lazily loaded import worker chunk, its WASM a separate asset), and
`pnpm --filter @armin/mobile check:bundle`.

## Review fixes

A code review of the branch found six problems, each fixed and rechecked:

- Relearning cards (Anki `type 3`, `queue 1`) carry their due date in seconds,
  not days. They produced an invalid date that failed the whole import when
  progress was kept. The converter now reads the unit from the queue, and a
  card whose due date still can't be read starts fresh instead. Rerunning the
  reviewer's relearning case gave a due date of today.
- Shared deletions (`{{c1,2::…}}`) imported as a broken card whose answer was
  `c1,2`. They now become a deletion for the lowest number, with a preview
  warning that the other cards' items are dropped.
- Each card read every tag twice, so a 100-card batch with 20 tags per card
  went over Convex's 4,096-read limit. Batches now share a tag cache (agent
  `save_cards` too). Against the local deployment, 100 cards with 20 tags each
  imported in one call.
- A deck deleted from another tab mid-import left later cards without a deck.
  `addCards` now refuses with `CONFLICT`; checked locally, and the following
  cancel returned the library to its earlier 7 decks and 14 cards.
- `cancel` deleted the first deck inside its own transaction, so a very large
  deck could make the cancel itself fail. It now only marks the import
  cancelled and schedules the deletions.
- Stopping during image upload reported a failure; it now reports a
  cancellation. Not rechecked in the browser.

## Not covered

The deck-list empty state, an import that skips images (the "Left out" list),
hitting the 80 MiB image quota, a real Anki-produced Image Occlusion deck with
ellipses or rotation, packages with `legacy_zip_filename` media entries, newer
Anki schema versions, real phones, and the Cloudflare deployment of the WASM
asset.

Known gap: importing the same file twice creates the decks twice. The earlier
large-deck deletion failure was addressed and rechecked below.

## Real-deck recheck and follow-up (2026-10-26)

The prior DeepSeek recheck used headless agent-browser and local real Anki
packages. Japanese Core previewed 600 cards and 199 images, skipping 400
audio-only fronts; Kaishi imported 1,501 cards and 1,382 images; Anatomy
imported 74 cards including 66 occlusions, with masks checked against labels.
The prior run inspected Japanese content and Kaishi bold rendering and
sampled 30 image URLs successfully. It recorded 36 `libraryCounters` conflict
log lines during Kaishi, but no ultimate upload failures. These are logged
mutation attempts, not a count of failed uploads. Its full evidence and
screenshots are in `/tmp/anki-recheck/`.

The Terra follow-up independently reproduced the Kaishi deletion failure in
headless agent-browser: the 1,501-card deck remained after confirmation, and
the backend reported the 4,096-read limit in `deleteDeckCascade`. Screenshots:
`/tmp/anki-terra-followup/delete-confirm.png` and `delete-failed.png`; log:
`/tmp/anki-terra-followup/dev.log`. At that point a successful large-deck deletion had not been verified; the
subsequent bounded-deletion checks below supersede that result.

After the prior cleanup and scheduled media collection, the local backend had
1,379 media rows and 1,379 storage blobs, with no missing or unclaimed blobs;
all 1,500 remaining flashcard-media links resolved, and the media counter and
sum of media sizes both read 40,838,881 bytes. This is a snapshot of the
remaining local data, not a fresh upload test. The prior run's 1,581 blobs and
1,578 media rows were captured before cleanup; the current counts show no
remaining orphan blobs. No new upload failure was measured in this follow-up.

The follow-up also reproduced loss of literal `****` in inline and fenced code
caused by the final Markdown replacement. After the fix, targeted converter
checks preserved both forms and rendered adjacent Japanese bold elements as
one bold span. The real Kaishi deck was not reimported after this change.
`pnpm check` passed with 59 warnings and no errors; web build and mobile bundle
checks passed.


## Bounded-deletion follow-up (2026-10-26)

On local head `171fc18`, the prior run passed deletion of the 1,501-card
Kaishi deck and a short-content quota fixture of 2,000 cards and 10,000 units,
and verified that moved-out history survived. Its long-text fixture failed
with Convex's 16 MiB read limit, and Browse and all-deck Review also failed
while those orphan units remained. The old failed fixture had already been
removed by the time of this follow-up, so it could not be resumed.

A new local fixture held four deleted-deck cards and 240 units, each unit
carrying 19,000 CJK characters on both sides, without scheduling cleanup.
With those rows present, authenticated headless agent-browser Browse showed
only the four sample cards, the tag filter offered only `demo`, and all-deck
Review displayed a sample card. `exports.snapshotCore` returned one deck,
four cards and four units, with no orphan tag. Calling the real
`deletion.cleanupDeck` then removed all four cards and 240 units; the unit
counter went from 244 to 4. Recent scheduled functions reported success.
Evidence: `/tmp/anki-long-followup/` including `before.json`, `after.json`,
`snapshot.json`, screenshots, and scheduled-job captures.

A separate held orphan fixture was rated before its deck row was removed,
creating a real current review log. Authenticated stale `get` returned null;
`update` and `move` returned `NOT_FOUND`; `rate` and `undo` returned stale.
The orphan card retained its original deck, version and tags, its unit retained
version 2, and the review log remained before cleanup. The fixture was then
cleaned through the real scheduled deletion path.

A real authenticated `imports.start` and `imports.addCards` created 45 cards
and units in a partial import; one unit was rated to create history.
`imports.cancel` returned cancelled, and scheduled cleanup removed the deck,
cards, units and review log, returning the sample library counter to four.
This crossed multiple 20-row content batches. No image links were added to
this particular import, so link removal was not independently retested here.

An isolated deleting QA library with 21 long-text cards and 21 long-text
units was passed to `cleanupLibrary`. The library, deck, cards and units were
absent afterward and the scheduled cleanup jobs succeeded. The active sample
library was retained. A legacy missing-unit-counter fixture was not tested.
The account check confirms eventual removal across a filled content batch,
not an observation of every intermediate transaction.

The parent run's `pnpm check` passed with 0 errors and 59 warnings, web build
and mobile Android/iOS bundle checks passed; logs are in
`/tmp/anki-bounded-delete/*-second.log`. No builds were repeated for this QA
follow-up. This verifies exclusion of orphan payloads in the tested paths,
not that every query supports arbitrarily large active text libraries: some
active-deck queries still collect their full matching rows.
