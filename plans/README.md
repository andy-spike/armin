# Animation plans

Written by the `improve-animations` audit at commit `7b7de09`. Each plan is
self-contained; run them in order with any agent.

| #   | Plan                                                                              | Severity | Status |
| --- | --------------------------------------------------------------------------------- | -------- | ------ |
| 001 | [Make the review answer reveal instant](001-instant-answer-reveal.md)             | HIGH     | DONE   |
| 002 | [Make the cloze chip popover a short fade](002-quiet-cloze-chip-popover.md)       | HIGH     | DONE   |
| 003 | [Reduced motion: drop movement, keep fades](003-gentler-reduced-motion.md)        | MEDIUM   | DONE   |
| 004 | [Toggle the sidebar instantly from the shortcut](004-instant-sidebar-shortcut.md) | MEDIUM   | DONE   |
| 005 | [Make toasts interruptible with transitions](005-interruptible-toasts.md)         | MEDIUM   | DONE   |

## Execution order and dependencies

1. **001** and **002** first: smallest changes, biggest effect on daily use.
   Independent of each other.
2. **003** next. It redefines the `a-*` keyframes under reduced motion, which
   covers 001's and 002's remaining classes as well.
3. **004** is independent of the others.
4. **005** last. Under reduced motion it depends on 003's `transition-property`
   override to drop the toast's 8px rise; without 003 the old global rule makes
   it instant, which is also acceptable.

## Not planned yet

Lower-severity findings from the same audit: `transition-all` on the sidebar
rail, missing button press feedback, a 320ms card-tile exit, Tailwind's weak
`ease-out` on dropdown menus, the duplicate `--ease-out-quart` / `--ease-out`
curves with the unused `a-bar-in`/`a-bar-out` keyframes, and replaying tooltip
animations when moving between toolbar tooltips.
