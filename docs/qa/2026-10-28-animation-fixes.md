# Animation fixes walkthrough (plans 001–005)

Date: 2026-10-28
Checkout: `claude/manual-ui-polish` (`.claude/worktrees/armin-integrations-9e908c`)
Environment: this worktree's local Convex deployment and web app at
`http://armin-b69218dd35.localhost:19808`, the Claude desktop app's built-in
Chromium browser at an emulated 1280×800 viewport, seed account.

The browser pane was hidden during the run, so its animation clock was
throttled and `requestAnimationFrame` did not fire. Checks below read the
animations and transitions the browser started (`getAnimations()`) rather than
watching them play; timing and feel were not judged by eye.

## Steps

1. Review (001): pressed Space to reveal an answer. No animation or transition
   started; the answer and all four rating buttons rendered at once.
2. Cloze popover (002): in Edit flashcard on the sample cloze card, arrowed into
   the `FSRS` chip. The popover ran `a-fade-in 0.1s` with `transform: none`;
   leaving the chip ran `a-fade-out 0.1s` and the popover was then removed.
3. Sidebar (004): the `[` shortcut collapsed and expanded the sidebar with no
   transitions in either direction and left `data-resizing` cleared. Clicking
   Collapse/Expand still transitioned width, padding, and opacity.
4. Toasts (005): a stand-in element with the toast's classes entered with
   `opacity` and `translate` transitions, 250ms, `cubic-bezier(0.23, 1, 0.32, 1)`,
   and exited with the same two transitions. The first attempt showed only
   `opacity`; `transition-[opacity,transform]` doesn't cover Tailwind v4's
   `translate` property, fixed to `transition-[opacity,translate]`.
5. `pnpm check` and `pnpm --filter @armin/web build` pass.

## Not exercised

- Reduced motion (003) in the browser: not emulated in this run.
- A real toast: every toast in the app follows a data-changing action.
- Watching any of the motion at full speed or in slow motion.
- Mobile; none of these changes touch it.
