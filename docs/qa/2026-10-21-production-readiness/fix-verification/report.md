# Fix verification for the 2026-10-21 production-readiness QA

All three defects from [the original report](../report.md) are fixed on this branch.
Each fix has its own report with the cause, the change, and its walkthrough:

| Issue | Fix | Detailed report |
| --- | --- | --- |
| ISSUE-001: first editor opening after reload is empty | The lazily mounted form treated its first, already-open render as "was open" and skipped loading the card. It now loads on that first render too. | [issue-001-editor](../../2026-10-21-issue-001-editor/report.md) |
| ISSUE-002: graph toolbar overlaps search at narrow widths | Back, search, and Tidy now share one full-width row. Search fills the remaining space and Tidy shortens to "Tidy" on narrow canvases. | [issue-002-graph-toolbar](../../2026-10-21-issue-002-graph-toolbar/report.md) |
| ISSUE-003: deck progress reaches 125% | Progress counts flashcards on both sides. A flashcard is learned only when all of its active review units are in Review state. | [issue-003-progress](../../2026-10-21-issue-003-progress/report.md) |

## Combined check

After integrating the three commits, `pnpm typecheck`, `pnpm lint`,
`pnpm --filter @armin/web build`, and `pnpm --filter @armin/mobile check:bundle`
passed. A walkthrough in desktop Chromium (agent-browser) on this worktree's
deployment, using the same data as the original QA pass, showed:

- The Biology deck that showed 125% now shows "4 flashcards" and 75% learned
  ([progress-deck-list-after.png](progress-deck-list-after.png)).
- After reloading Browse, the first opening of a basic card shows its front
  and back, with Save enabled ([editor-first-open-after.png](editor-first-open-after.png)).
- At 390 × 844 CSS pixels the graph toolbar shows back, search, and Tidy without
  overlap ([graph-toolbar-390-after.png](graph-toolbar-390-after.png)).

The narrow check is a resized desktop browser, not a real mobile device.
Email/Google authentication, real mobile browsers, large libraries, concurrent
load, and production deployment remain unverified, as in the original report.

## Follow-up polish: sidebar deck names

The ISSUE-002 walkthrough noted that at 768 px a long deck name in the sidebar
ran into its due count. The badge floats over the row's right edge, but the
row reserved no space for it. Deck rows with a due count now reserve that space
(`pr-8`), so the name truncates before the badge.

Typecheck, lint, the web build, and the mobile bundle check pass. **This change
was not checked in a browser.** When the walkthrough was attempted, every auth
request returned HTTP 500 because Convex had disabled the team's development
deployments for exceeding free-plan limits. Re-check a long deck name with due
cards at 768 px once the deployments are available. The open question from
ISSUE-002, whether Tidy visibly rearranges a messy graph, is still unverified
for the same reason.
