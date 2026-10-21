# ISSUE-001 follow-up: first card editor after reload

Date: 2026-10-21. Original finding: [production-readiness report](../2026-10-21-production-readiness/report.md#issue-001-first-card-editor-after-reload-loses-existing-text).

Result: fixed. The first editor opened after a reload now shows the stored card content and enables Save changes.

## Cause

`FlashcardFormDialog` copies a card's stored content into its field state only when `open` changes from false to true. It tracked the previous value with `useRef(open)`.

The lazy wrapper (`flashcard-form-dialog-lazy.tsx`) mounts the real dialog only on its first open, so the dialog's first render already has `open = true`. The ref started as `true`, the false-to-true check never matched, and the front/back text stayed empty. Tags and card type appeared correct because their state is initialized directly from props. Later opens worked because the dialog stays mounted after the first open.

## Fix

`apps/web/src/components/flashcard-form-dialog.tsx`: the ref now starts as `false`, so a dialog mounted already open runs the same field-loading step as every later open. Create and edit flows still share one field-loading path. Dialog button labels are unchanged.

## Walkthrough

Environment: isolated worktree deployment, development server started with `pnpm dev`, desktop Chromium via agent-browser, sample account from `docs/dev-worktrees.md`.

| Check | Result |
| --- | --- |
| Before fix: reload Browse, open basic card | Reproduced. Front and back empty, `demo` tag shown, Save changes disabled. [Screenshot](screenshots/before-first-open-empty.png) |
| After fix: reload Browse, open basic card | Front and back populated, Save enabled. [Screenshot](screenshots/after-first-open-browse.png) |
| Reload Browse, first open of cloze card | Cloze text populated. |
| Reload Browse, first open of typed-answer card | Prompt and answer populated. [Screenshot](screenshots/after-first-open-typed.png) |
| Switch between cloze, typed-answer, and basic cards without reload | Each card showed its own content. [Screenshot](screenshots/after-switch-to-locked-basic.png) |
| Reload, first open, edit back text, save | Dialog closed, list preview updated. After another reload, reopening showed the edited text. [Screenshot](screenshots/after-save-reload-reopen.png) |
| Reload deck page, open and close Deck settings, then open a basic card | Content populated. [Screenshot](screenshots/after-deck-page-after-settings.png) |
| Reload deck page, first open of Add card | Opened in create mode with empty fields. |
| Create a reversed card | Saved. The form cleared for the next card as before. |
| Open the new reversed card, then Add card again | Edit showed Reversed type and its text, [screenshot](screenshots/after-reversed-edit.png). Add card then opened empty. |
| Reload, first open of the reversed card | Front and back populated. |
| Browser errors | None reported by `agent-browser errors` after the walkthrough. |

Validation: `pnpm --filter @armin/web typecheck` and `pnpm lint` passed. No automated tests were added.

Data left in the isolated deployment: the basic card "What does a prerequisite link represent in Armin?" has " (edited)" appended to its back, and a reversed card "ISSUE-001 reversed front" was added to the sample deck.
