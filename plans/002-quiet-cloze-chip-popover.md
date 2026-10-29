# 002 — Make the cloze chip popover a short fade, not a pop

- **Status**: DONE
- **Commit**: 7b7de09
- **Severity**: HIGH
- **Category**: Purpose & frequency / Interruptibility
- **Estimated scope**: 2 files, ~10 lines

## Problem

The cloze settings popover appears whenever the editor cursor enters a cloze
chip, including while the user arrows through text, and leaves when the cursor
moves out. It uses the shared `animate-pop` / `animate-pop-out` keyframes
(200ms, translateY(6px) + scale(0.98) + opacity). Arrowing past a chip therefore
plays a full pop in and out, and because the popover is keyed by the chip's
position, moving between chips remounts it and restarts the keyframes from zero.
For a keyboard-triggered, frequent state change the movement is noise.

```tsx
/* apps/web/src/components/ui/cloze-chip-popover.tsx:48-51 — current */
      onAnimationEnd={() => {
        if (leaving) onExited?.();
      }}
      className={`absolute z-20 flex ${leaving ? "pointer-events-none animate-pop-out" : "animate-pop"} items-center gap-2 border border-border bg-surface px-2 py-1.5 text-xs shadow-overlay`}
```

```css
/* apps/web/src/styles/app.css — current utilities */
.animate-pop {
  animation: a-pop 0.2s var(--ease-out-quart) both;
}
.animate-pop-out {
  animation: a-pop-out 0.2s var(--ease-out-quart) both;
}
```

Settled decision to respect: commit `b4ad227` deliberately made the popover
animate _out_ instead of disappearing instantly, and `markdown-editor.tsx` keeps
the last chip mounted until `onExited` fires from `animationend`. Keep an exit
animation and that `onAnimationEnd` → `onExited` mechanism; only make it
smaller and faster.

## Target

Opacity only, no movement, 100ms in and 100ms out, on the strong ease-out curve:

```css
/* target — new utilities next to .animate-fade-in / .animate-fade-out */
.animate-fade-in-fast {
  animation: a-fade-in 0.1s var(--ease-out) both;
}
.animate-fade-out-fast {
  animation: a-fade-out 0.1s var(--ease-out) both;
}
```

```tsx
/* target class swap in cloze-chip-popover.tsx */
${leaving ? "pointer-events-none animate-fade-out-fast" : "animate-fade-in-fast"}
```

`--ease-out` is already defined in `app.css` as
`cubic-bezier(0.23, 1, 0.32, 1)`.

## Repo conventions to follow

- Motion utilities live in the `@layer utilities` block of
  `apps/web/src/styles/app.css` under the "Motion" heading. Exemplar to imitate:
  `.animate-fade-in { animation: a-fade-in 0.2s var(--ease-out-quart) both; }`.
- The `a-fade-in` and `a-fade-out` keyframes already exist; reuse them.

## Steps

1. In `apps/web/src/styles/app.css`, directly after the `.animate-pop-out { … }`
   rule inside `@layer utilities`, add the two rules from the Target block
   exactly as written.
2. In `apps/web/src/components/ui/cloze-chip-popover.tsx` line 51, replace
   `animate-pop-out` with `animate-fade-out-fast` and `animate-pop` with
   `animate-fade-in-fast`. Keep `pointer-events-none` on the leaving branch.
3. Leave `onAnimationEnd` (lines 48-50) unchanged; it still fires because the
   exit is still a CSS animation.

## Boundaries

- Do NOT touch `apps/web/src/components/ui/markdown-editor.tsx`.
- Do NOT change `.animate-pop` / `.animate-pop-out` themselves; dialogs and the
  image zoom dialog use them.
- Do NOT remove the exit animation (see the settled decision above).
- If line 51 no longer matches the current excerpt, STOP and report.

## Verification

- **Mechanical**: `pnpm check` passes; `pnpm --filter @armin/web build` succeeds.
- **Feel check**: open Edit flashcard on a cloze card, click into the text, and
  arrow left and right across a chip several times quickly:
  - The popover fades in and out without moving or scaling.
  - Holding an arrow key across several chips never shows a visible slide or
    a stuttering pop.
  - In DevTools → Animations at 10% playback, each enter/exit is opacity only
    and 100ms.
  - After the cursor leaves a chip, the popover disappears and is removed from
    the DOM (confirms `onExited` still fires).
- **Done when**: the popover uses the `-fast` fade classes and still unmounts
  after its exit.
