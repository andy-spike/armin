# Anki image occlusion: built-in IO, Image Occlusion Enhanced, AnKing IO

Date: 2026-11-09. Branch `t3/d9fbd258`, local deployment from `pnpm dev`
(web `http://anki-image-occlusion-import.armin.localhost:4100`).
Browser: headless Chromium driven by agent-browser at 1440×900, plus an
emulated 390×844 viewport (not a phone or real device). Account: the seeded
`test@example.com`.

## Formats, from the sources

- **Anki's built-in image occlusion** (23.10+, stock kind 6): one cloze
  marker per shape in the Occlusion field,
  `{{cN::image-occlusion:rect|ellipse|polygon:left=…:top=…:…}}`, fractions of
  the image. Shapes grouped in Anki's editor share a cloze number. Text labels
  use `{{c0::image-occlusion:text:…}}` and show on every card. `oi=1` on the
  shapes means "hide all, guess one". Values escape `:` as `\:`. Fields:
  Occlusion, Image, Header, Back Extra, Comments.
- **Image Occlusion Enhanced** (read from glutanimate/image-occlusion-enhanced,
  `ngen.py`, `config.py`, `template.py`, svg-edit's `svgCanvasToString`):
  model "Image Occlusion Enhanced", fields ID (hidden), Header, Image, Question
  Mask, Footer, Remarks, Sources, Extra 1, Extra 2, Answer Mask, Original
  Mask, one template "IO Card". One note per mask. The ID is
  `<uuid4 hex>-<ao|oa>-<nr>`; `ao` is "Hide All, Guess One", `oa` "Hide One,
  Guess One"; `nr` is the shape's 1-based position in the mask layer. Mask
  files are `<id>-Q.svg`, `<id>-A.svg`, and `<uniq>-<tp>-O.svg`, referenced as
  `<img src="…" />`. The SVG root carries the image's `width`/`height`; its
  last top-level `<g>` is the "Masks" layer (the first is "Labels"). Each
  shape in the original mask has the note ID as its `id`; the question mask
  sets `class="qshape"` and the qfill colour (default `#FF7E7E`) on the tested
  shape, recursively for a `<g>` group. In `ao` the answer mask keeps the
  other shapes; in `oa` it is empty. The Footer shows under the image on both
  sides; Remarks, Sources, Extra 1, Extra 2 show on the back under their
  field names.
- **AnKing "IO-one by one"**: closet syntax in field `I0`,
  `[#!occlusions [[rect0::x,y,w,h]] … #]`, pixel coordinates, revealed one at
  a time by template scripts. Out of scope; left out.

## Fixture

`2026-11-09-anki-image-occlusion/make-fixture.py` builds a real Anki 26.09
package (`python3 -I … /tmp/anki-real/in/All_AnKing_Note_Types.apkg`):

- Two diagrams drawn with ImageMagick, a 1200×700 solar system and a
  900×1200 plant cell; every label sits on a plate with a pink outline, so a
  mask that drifts by a pixel shows it.
- Built-in IO via `add_image_occlusion_note`: "Name the inner planets"
  (4 rects, `oi=1`) and "Name the planet" (ellipse, polygon with
  `left`/`top`, two rects grouped as `c3`, a text label, Comments filled).
- IOE notes produced by a port of `ngen.py`'s generator (IDs, minidom
  `toxml()` masks, file names, field HTML), written to the media folder with
  `open()` as the add-on does: one `ao` occlusion of 5 masks (rect, ellipse,
  pen-tool path, `rotate()`d rect, `<g>` of two rects) with a text label in
  the Labels layer, Footer, Remarks, Sources, and review history (3 reviews)
  on mask 1; one `oa` occlusion of 3 rects with mask 2 suspended; one `ao`
  occlusion whose O and Q mask files are missing.
- AnKing's "IO-one by one" note and image, imported from the sample.

## Converter results (browser and kit agree)

4 cards, 15 review units, 3 review logs, 2 images:

| Card | Mode | Masks |
| --- | --- | --- |
| Name the inner planets | hide_all | 4 rects |
| Name the planet | hide_one | ellipse box, polygon box, `c3` with 2 parts |
| Label the plant cell (IOE `ao`) | hide_all | 5, the last with 2 parts; mask 1 is Review, due in 4 days, 3 logs |
| Hide one: name this structure (IOE `oa`) | hide_one | 3 |

Not imported: 2 IOE notes ("their occlusion masks are missing from the file
or can't be read") and 1 IO-one by one note ("this occlusion format isn't
supported yet"). Changes: 6 notes had text labels left out, 4 had round or
slanted shapes drawn as rectangles. The kit (`pnpm anki:kit`, unzipped to
`/tmp`, `node armin-anki-kit.mjs <fixture> --out <tmp>`) wrote the same 4
cards (same masks, modes, and parts) and the same 3 unresolved notes with the
same reasons.

## Browser walkthrough

1. **Preview** (`01-preview.png`): 4 cards in 2 decks, Keep from Anki ·
   3 reviews, "2 changes on the way in" and "3 notes not imported" with the
   reasons above. The generic "skipped for empty or unusable content" row is
   no longer repeated when the list names each note.
2. **Import**: completed, 4 cards, 2 decks, 3 past reviews. The done step now
   says "3 notes Armin couldn't convert, as listed before importing" (it said
   "skipped for having no usable content").
3. **Deck** (`02-deck-tiles.png`): tiles show the header, mask count, and a
   thumbnail with the masks drawn.
4. **IOE hide all** (`03`–`06`): question shows the tested mask in the accent
   colour with "?" and the other masks in neutral grey, each exactly on its
   plate (only the plates' 1.5 px outer stroke shows). Answer outlines the
   revealed plate and keeps the other masks, as Anki does; "Hide other masks"
   lifts them. Footer, Remarks, and Sources render below as Markdown, bold
   kept.
5. **All IOE units** (`07-ioe-questions.png`, `08-ioe-answers.png`): the
   cell wall (path), chloroplast (rotated rect), and the grouped
   mitochondrion + ribosome mask (two parts, "?" on the first) in hide all;
   the three hide-one cards show only their mask, with the answer outlining it.
6. **Built-in IO** (`09-native-io-review.png`): hide all and hide one, the
   ellipse and polygon as boxes, the grouped `c3` as two parts, Back Extra
   followed by **Comments**.
7. **Browse, dark** (`10-browse-dark.png`): tiles read well; context masks
   stay opaque in the dark theme.
8. **Editor** (`11-editor-dark.png`): opens at the top with the image, numbered
   mask badges, mode, header, and extra read-only; type buttons are disabled
   with "Changing the type would discard the masks". Saving without changes
   bumped the version to 2 and left `content` byte-identical (compared with
   `convex data flashcards` before and after).
9. **Cram, emulated 390×844, dark** (`12-cram-narrow-dark.png`): the image
   fits the width, masks stay aligned, the question and answer are readable.
10. **Undo** (`13-undo.png`): after rating the last due card, Undo brought it
    back to the question side.

Masks are placed in a frame that takes the image's aspect ratio and is never
taller than the space left in the card, so there is no letterboxing for them
to drift into. Before this change the frame was full width with an
`object-contain` image, so masks drifted on any image that hit the height
limit.

## Validation

- `pnpm check`: pass.
- `pnpm --filter @armin/web build`: pass.
- `pnpm --filter @armin/mobile check:bundle`: pass.

## Not covered

- The mobile app shows image occlusion units as text only (header or
  "Recall the hidden area." / "Hidden area"); drawing the image and masks
  needs the authenticated image loader plus an overlay, which is more than a
  small change.
- A partly suspended IOE occlusion: Armin can archive only a whole card, so
  the suspended mask studies normally (the card is archived only when every
  note is suspended), as for cloze notes.
- Rotation of built-in IO shapes is approximated in image fractions (the
  image's aspect ratio isn't known to the converter).
- Text labels (built-in `text` shapes, the IOE Labels layer) are left out
  with a warning.
- Real decks exported by old Anki with the add-on installed; the fixture
  follows the add-on's source instead.
- A real phone or browser other than headless Chromium.
