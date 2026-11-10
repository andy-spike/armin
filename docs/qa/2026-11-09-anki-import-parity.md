# Anki import parity: plan limits, deck splitting, tags, templates, SVG kit

Date: 2026-11-09. Branch `t3/anki-import-parity-research`, local deployment from
`pnpm dev`. Browser: headless Chromium driven by agent-browser at 1280×577 and
1440×900 (desktop viewports; no phone or real-device check). Account: the seeded
`test@example.com`, first on Free (complimentary Pro off), then Pro.

Image occlusion has its own walkthrough:
[2026-11-09-anki-image-occlusion.md](2026-11-09-anki-image-occlusion.md).

## Fixtures

Real public packages (not committed): Kaishi 1.5k v2.4.3 (1,501 cards, 4,345
media files), Open Anki JLPT N5 v0.3.0, Lapis 1.7.0, the AnKing note type
samples (`All_AnKing_Note_Types.apkg`), and Ultimate Geography v5.3 EN (built
into an `.apkg` from its CrowdAnki release). `make-big-deck.py` builds a
synthetic 10,050-card single deck whose first notes carry 41 long hierarchical
AnKing-style tags.

## Converter (kit 1.2.0)

| Deck | Result |
| --- | --- |
| Kaishi | 1,501 cards, unchanged content |
| JLPT N5 | 718 Basic and reversed cards (was 1,436 Basic); back no longer repeats the front |
| AnKing note types | 6 cards; no logo, `%AnKingNoteTypes`, `× ↪`, or button icons; hints as `### Personal Notes` sections; IO-one by one listed as not imported |
| Lapis | 1 card, 3 media files |
| Ultimate Geography | 978 cards, 0 unresolved (SVG flags rasterized by the kit) |

`node scripts/build-anki-kit.mjs --verify` builds a reproducible archive.

## Browser walkthrough

1. **Plan limit** (`01-firstn-offer.png`): on Free, Kaishi's preview reads
   "Kaishi 1.5k has 1,501 cards. Your plan has room for 996." with
   **Import the first 996 cards** and **Upgrade for all**.
2. **Limited preview** (`02-firstn-applied.png`): "Importing the first 996 of
   1,501 cards" with **Import all** to undo; totals and media update.
3. **Done** (`03-firstn-done.png`): 996 cards imported; "505 cards left out to
   fit your plan".
4. **Splitting** (`04-split-preview.png`, `05-split-done.png`): on Pro, the
   10,050-card deck previews as "Big Pharm has 10,050 cards. It will be imported
   as 2 decks, because a deck holds up to 10,000 cards." and imports as
   `Big Pharm (1 of 2)` and `Big Pharm (2 of 2)`.
5. **Long tags** (`06-browse-long-tags.png`, `07-editor-long-tags.png`): all 41
   tags arrive whole. The Browse tile first squeezed every tag into a sliver;
   fixed to show two truncated tags plus `+39`. The editor lists every tag.
6. **Reversed card** (`10-jlpt-answer.png`): JLPT reviews as ああ → Ah!, Oh!.
7. **Template cleanup** (`11-anking-basic-answer.png`): the AnKing Basic answer
   shows only content and a "Personal Notes" section.
8. **Occlusion** (`14-ioe-answer.png`): an Image Occlusion Enhanced card at
   1440×900; masks align with the diagram labels.

## Polish pass (2026-11-10)

Every touched surface again, at 1440×900 light and 390×844 dark (emulated
viewports): deck tiles, tag filter, card editor, image occlusion editor and
review, import preview (first-N, library full, split, changes, not imported),
done step, and the pricing FAQ. Fixed:

- Card counts above 999 read `10000 flashcards`; they now use separators in
  deck headers, Browse, and the delete dialog.
- The tag filter clipped every hierarchical tag to the same
  `#AK_Step1_v12::#UW…`; the list now widens up to 28rem and aligns to the
  trigger (`15-tag-filter-long-tags.png`).
- Short tile tags carried empty padding from a forced minimum width.
- Mask numbers in the occlusion editor covered the first letters of labels;
  they now sit as tabs outside the mask (`16-io-editor-badges.png`).
- A full library said "1,501 cards, room for 0" with no way forward; it now
  reads "Your library has no room left on your plan" with an upgrade link
  (`17-library-full.png`, `19-library-full-390-dark.png`).
- Choosing "Import the first N cards" flashed the "doesn't fit" box while the
  preview recalculated.
- Change rows repeated their count ("4 Additional cloze fields from 4
  notes…"); every change type now has a short label.

One import failed with "too many system operations" while a deleted 10,000-card
deck was still being cleaned up on the local backend; the same import succeeded
once cleanup finished. This branch doesn't change that path.

## Validation

`pnpm check`, `pnpm --filter @armin/web build`, `pnpm --filter @armin/mobile
check:bundle`, and `node scripts/build-anki-kit.mjs --verify` pass.

## Not covered

No real AnKing Step deck (not public) or real old-Anki IOE export; splitting and
long tags were checked with the synthetic deck. Review-history trimming over
300,000 reviews was checked in the converter only, not in the browser. Mobile
was not walked through.
