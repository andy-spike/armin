# Anki compatibility: audio, formatting, deck options, and field mapping

Date: 2026-11-01. Branch `t3/c0629844`, local deployment from `pnpm dev`.
Browser: headless Chromium driven by agent-browser at 1440×1000 (desktop
viewport; no phone or real-device check). Account: the seeded
`test@example.com`.

## Fixture

`make-fixture.py` (next to the screenshots) builds a real Anki 26.09 package
with the `anki` library and ffmpeg: an audio-only listening card, a card with
OGG audio, five new cards whose Anki order is the reverse of their creation, a
WMA/MP4 card, a card with `<sub>`, `<sup>`, red text, `<u>`, black text and
`<mark>`, an SVG image, a custom "Vocab (custom)" note type with a
`{{tts es_ES:Word}}` back, one red-flagged review card, one buried blue-flagged
review card, and a "Spanish preset" with retention 0.87, steps 1m/10m, relearn
10m, max interval 3650, and FSRS-6 parameters.

## Converter (Node kit 1.1.0 on the fixture)

- Audio became `![audio](armin-media:<sha>.mp3|.ogg)`; the listening card was
  kept (it was skipped before).
- `H~2~O`, `x^2^`, `==nine==`, `==Underlined==`, `==highlighted==`; black text
  stayed plain.
- Tags `flag::red` and `flag::blue`.
- Deck settings: Spanish 0.87 / `1m, 10m` / `10m` / 3650 / FSRS-6 weights;
  Science from Anki's Default preset without weights.
- Warnings: flags as tags, TTS left out, WMA removed, MP4 removed. The kit
  can't rasterize SVG, so that card is listed as unresolved (expected).

## Browser walkthrough

1. **Preview** (`01-preview.png`): 12 cards in 2 decks, "1 image and 2 audio
   files", deck options note naming both presets, daily limits note (15 new,
   150 reviews) linking to Settings, changes list, Custom note types section.
2. **Field mapping** (`02-notetype-mapping.png`): Vocab set to Basic with
   Word + Audio on the front and Meaning + Example on the back. The plan
   refreshed: the template and TTS warnings disappeared.
3. **Import** (`03-import-done.png`): completed; the done screen shows the
   "Next: connect your cards" prompt with Copy prompt and Set up an AI
   assistant. Sidebar: Science 1 due (buried card hidden), Spanish 9 new.
4. **Stored data** (`convex data`): Spanish deckSettings row matches the
   preset; the buried unit has `buriedUntil` at the next study day; the five
   ordered cards have ascending `frontierKey`s in Anki's order;
   `libraryCounters` counts audio (17,237 B) apart from images (5,080 B).
5. **Review** (`04-review-first-new.png`, `05-review-audio.png`): the first
   new card is "Order 5" (Anki position 1). The audio card shows an inline play
   button; with autoplay on, stepping to it called `play()` once and stepping
   to cards without audio did not. Clicking the button played the clip
   (pressed → released after 0.8 s). `R` replayed it. Rating intervals show
   the imported 1m/10m steps.
6. **SVG** (`06-review-svg.png`): the diagram arrived as a 240×120 PNG.
7. **Editor** (`07-editor-formatting.png`): the formatted card opens as
   source ("Kept as source to preserve its formatting") with a rendered
   preview showing H₂O, x², and highlights.
8. **Export** (`08-export-audio.png`): with Include audio on, the ZIP held
   the MP3, OGG, and PNG; with it off, only the PNG.
9. **Autoplay setting** (`09-autoplay-setting.png`): turned off, stepping to
   the audio card played nothing and `R` still replayed. Turned back on.
10. **Add audio** (`10-editor-add-audio.png`): in a new card, Add audio
    uploaded an MP3, switched the field to source, and the preview showed the
    play button. Saving created the card; `flashcardMedia` tracks the clip and
    the deck tile reads "Listen and repeat [Audio]".

## Validation

`pnpm check`, `pnpm --filter @armin/web build`, `pnpm --filter @armin/mobile
check:bundle`, and `node scripts/build-anki-kit.mjs --verify` pass.

## Not covered

Mobile renders audio references as images and was not changed (out of scope
for this change). Safari and Firefox playback were not tried; playback uses
blob URLs to avoid HTTP range requests. Legacy (schema 11) presets are read
from `col.dconf` but this fixture used the current format.
