# Anki conversion follow-up, 2026-10-27

Scope: core conversion of additional cloze fields and resolution of images
unavailable after preview. No server or browser was operated in this follow-up.

## Focused probes

A temporary Bun probe (`/tmp/anki-conversion-follow-up-probe.ts`) built a
three-note synthetic collection modeled on the documented AnKing example. The
first note retained its cloze text and Extra, plus the Sketchy link and a
referenced image under labeled answer sections. Two notes with additional
convertible fields produced an `additional_fields_added` count of 2. An
audio-only additional field produced an `additional_fields_omitted` count of 1
and the audio-removal warning. A 25,000-character additional field produced
the existing content-truncation warning. These counts refer to notes, not
fields.

The probe resolved a successfully uploaded image reference and validated the
resulting cloze. When that image was unavailable in an optional cloze answer,
the image was removed and the remaining answer retained. An unavailable image
in a basic front, reversed basic back, cloze text, or typed-answer prompt caused
resolution to reject the card, even when other text remained. An image
occlusion with an unavailable base failed content validation. The import runner
catches these failures before declaring totals, and its existing completion
summary reports skipped cards and images; this integration was inspected, not
exercised in a running application. The conservative required-field rule also
skips a card when its text could potentially stand alone without the image.

`pnpm check` passed with 0 errors and 59 warnings. The previous downloaded
packages and subset under `/tmp/anki-originals-terra` were absent in this
session, so the original AnKing note and full-deck warning totals were not
rechecked. The probe does not establish browser rendering, real upload failure
behavior, or end-to-end completion-summary counts. No automated suite was added
and no deployment was performed.
