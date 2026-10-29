# Animation opportunities walkthrough

Date: 2026-10-28
Checkout: `claude/manual-ui-polish` (`.claude/worktrees/armin-integrations-9e908c`)
Environment: this worktree's web app at `http://armin-b69218dd35.localhost:19808`
in the user's desktop Chromium, driven by agent-browser over CDP in its own
visible tab (real frames, about 56 fps). Values were sampled every animation
frame; feel was not judged by eye.

## Steps

1. Copy buttons (AI setup): with the page's clipboard stubbed so the real
   clipboard stayed untouched, clicking Copy crossfaded the icons over about
   150ms: copy opacity 1 → 0 and scale 1 → 0.8, check opacity 0 → 1 and scale
   0.8 → 1. After 2 seconds it reversed the same way. The icon box stayed 16px.
2. "Or run it yourself" (AI setup → Claude Code): opening eased the
   `<details>` height 20 → 124px. Closing first ended in a 12px snap because the
   content's top margin escaped the clipped box; `display: flow-root` on
   `::details-content` fixed it, and closing now eases 124 → 20px.
3. Finished-session panel: tested with a stand-in using the same classes,
   since reaching the real panel means rating every due card. The icon settles
   from scale 0.9 and opacity 0; the heading and description rise 4px and fade
   in starting about 60ms and 120ms later; all settle by about 320ms. The first
   attempt had no stagger: the `animation` shorthand reset an arbitrary
   `animation-delay`, so the delay now comes from an `--animate-delay` variable.
4. Reduced motion (emulated in that tab): the finished-panel stand-in fades
   with no transforms, keeping the stagger.
5. `pnpm check` and `pnpm --filter @armin/web build` pass.

## Not exercised

- The real finished-session panel after rating a queue.
- The import "changes on the way in" `<details>` (needs a parsed Anki file);
  it uses the same `details-reveal` class as step 2.
- Firefox and Safari, which don't support `::details-content` and keep the
  instant toggle.
