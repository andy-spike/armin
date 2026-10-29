# Cloze chips in the card editor walkthrough

Date: 2026-10-28
Checkout: `claude/manual-ui-polish`
Environment: local Convex deployment and web app from `pnpm dev`,
`http://armin-b69218dd35.localhost:19808`, desktop Chromium through
agent-browser at 1440×900.

The cloze card's Text field is now the rich Markdown editor, and
`{{N::answer::hint}}` deletions show as chips. The stored text format is
unchanged.

## Steps

1. Opened the imported card "Newton's second law…" from Browse. Text loads as
   rich text with two chips, **1 mass** and **2 acceleration**
   ([imported-card-chips.png](2026-10-28-cloze-chips/imported-card-chips.png)).
2. Round trip: read the stored text with **Edit source**, returned to rich text,
   typed and deleted a character to force a re-save, then read the source again.
   The text was identical apart from the editor's trailing newline, which the
   form now trims like the other rich-text fields.
3. In an unsaved Add card dialog, repeated the round trip for six texts; each
   came back byte-identical: two numbered chips; a hint
   (`{{1::Paris::a capital}}`); the bare form (`{{red}}`, shown with a "?"
   badge); two chips sharing a number; Markdown around chips
   (`**Note:** … _blood_ …`); and two paragraphs. `{{1::**bold**}}` stays in
   source mode ("Kept as source to preserve its formatting") because a chip
   can't hold formatting without changing the text.
4. Creating chips: selecting "mitochondria" and "cell" and pressing
   Ctrl+Shift+C made chips 1 and 2; **Cloze** in the toolbar with an empty
   cursor inserted a selected "answer" chip 3. Typing "ATP" over it kept the
   chip and continued inside it. After clicking elsewhere and returning to the
   end, typed text stayed outside the chip. Typing `{{chlorophyll}}` with real
   keystrokes became a chip as the `}}` closed.
5. Put the cursor in the "cell" chip: the settings popover opened under it
   ([chip-popover.png](2026-10-28-cloze-chips/chip-popover.png)). **+** moved
   it to card 3 and typing "organelle" added a hint, shown after the answer
   ([chip-number-and-hint.png](2026-10-28-cloze-chips/chip-number-and-hint.png)).
6. Saved the card, reopened it, and read the source:
   `The {{1::mitochondria}} is the powerhouse of the {{3::cell::organelle}}.{{3::ATP}} Done.`
   Reopening rebuilt the same three chips. Deleted the test card afterwards.
7. Checked the chips and popover in the light theme
   ([light-theme.png](2026-10-28-cloze-chips/light-theme.png)).

## Follow-up: chip restyle

The first chip used a boxed number badge and a 1px inset outline, which sat
off the text baseline and made the caret at a chip's edge look wrong. Chips are
now inline text only: a soft accent wash with a dotted underline, the card
number as a small raised numeral, and the hint in muted italics. Measured the
chip at 20px inside the paragraph's 21px line, and checked the caret inside a
chip and after it in both themes
([dark](2026-10-28-cloze-chips/chip-restyle-dark.png),
[light](2026-10-28-cloze-chips/chip-restyle-light.png)).

## Notes

- Phone widths and touch input were not checked.
- Validation: `pnpm check`, `pnpm --filter @armin/web build`, and
  `pnpm --filter @armin/mobile check:bundle` pass.
