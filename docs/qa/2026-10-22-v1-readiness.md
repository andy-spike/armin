# v1 web readiness: QA, fixes, and verification (2026-10-22)

This records the second production-readiness pass on the web app, after the
fixes from [the first pass](2026-10-21-production-readiness/report.md).

## Process

1. Five QA agents (DeepSeek V4.1 Flash, max reasoning) explored the app as
   users, each in its own worktree and local deployment: authentication and
   account, cards and Browse, review and scheduling, the prerequisite graph,
   and cross-cutting layout, accessibility, and the production build.
2. Six fix agents addressed the findings by area. Their walkthroughs:
   - [Graph](2026-10-22-v1-fix-graph.md), including its Round 2 section
   - [Card editor and dialogs](2026-10-22-v1-fix-card-editor.md)
   - [Browse and deck pages](2026-10-22-v1-fix-browse-deck.md)
   - [Review and scheduling](2026-10-22-v1-fix-review-scheduling.md)
   - [Authentication and page titles](2026-10-22-v1-fix-auth.md)
   - [Settings, layout, and contrast](2026-10-22-v1-fix-settings-sidebar.md)
3. Three independent verification agents repeated the original reproduction
   steps on the merged branch. Their follow-ups were fixed in a second round
   ([round 2](2026-10-22-v1-fix-round2.md) and the graph Round 2 section).
4. A simplification pass removed defensive layers the fixes had added: the
   dialog's document-wide focus history, three overlapping Markdown editor
   fallbacks (one of which re-escaped Markdown on save), a double
   `requestAnimationFrame` focus workaround, and a redundant warn-once flag.
5. A final verification agent checked round 2 and the simplified code: 12 of
   13 items passed. The remaining failure (a graph layout save rejected after
   a card was created in another tab) and an API-only validation gap (seconds
   in learning steps) were then fixed and checked in the running app.

## Validation

`pnpm typecheck`, `pnpm lint`, `pnpm --filter @armin/web build`, and
`pnpm --filter @armin/mobile check:bundle` pass. Browser checks used desktop
Chromium through agent-browser; narrow widths were emulated viewports, not
real devices.

## Not covered by code changes

- Email delivery (Resend) and Google sign-in need production credentials.
  Without them, sign-up and password reset now report that email is
  unavailable, and Google buttons are hidden.
- Real phones, Firefox, Safari, screen-reader software, large libraries,
  concurrent users, and production hosting were not tested.
