# 005 — Make toasts interruptible with transitions

- **Status**: DONE
- **Commit**: 7b7de09
- **Severity**: MEDIUM
- **Category**: Interruptibility / Easing & duration
- **Estimated scope**: 1 file, ~15 lines

## As implemented

Uses `transition-[opacity,translate]`, not `transition-[opacity,transform]`:
Tailwind v4's `translate-y-*` utilities set the CSS `translate` property, so a
`transform` transition never animated the rise.

## Problem

Toasts enter and exit with keyframe animations: `animate-rise` (320ms) and
`animate-rise-out` (280ms). Keyframes always restart from their first frame, so
a toast dismissed while it is still entering jumps back to fully visible before
it starts leaving, and toasts arriving in quick succession each replay from the
start. The 320ms entrance is also over the 300ms budget for UI.

```tsx
/* apps/web/src/components/ui/toast.tsx:16 — current */
const EXIT_MS = 280;
```

```tsx
/* apps/web/src/components/ui/toast.tsx:144-158 — current (exit wiring) */
const panel = panelRef.current;
const onEnd = (event: AnimationEvent) => {
  if (event.target !== panel) return;
  finishExit();
};

panel?.addEventListener("animationend", onEnd);
const fallback = window.setTimeout(finishExit, EXIT_MS + 50);

return () => {
  panel?.removeEventListener("animationend", onEnd);
  window.clearTimeout(fallback);
};
```

```tsx
/* apps/web/src/components/ui/toast.tsx:167-170 — current (panel classes) */
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-border bg-surface p-3.5 shadow-overlay",
        exiting ? "pointer-events-none animate-rise-out" : "animate-rise",
      )}
```

## Target

CSS transitions on `opacity` and `transform`, 250ms on the strong ease-out
curve, with the entry state set through `@starting-style` (Tailwind's
`starting:` variant). A transition retargets from wherever the toast is, so a
dismissal mid-entry reverses smoothly.

```tsx
/* target — panel classes */
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-border bg-surface p-3.5 shadow-overlay transition-[opacity,transform] duration-250 ease-(--ease-out) starting:translate-y-2 starting:opacity-0",
        exiting && "pointer-events-none translate-y-2 opacity-0",
      )}
```

```tsx
/* target — exit wiring */
const EXIT_MS = 250;
…
    const panel = panelRef.current;
    const onEnd = (event: TransitionEvent) => {
      if (event.target !== panel || event.propertyName !== "opacity") return;
      finishExit();
    };

    panel?.addEventListener("transitionend", onEnd);
    const fallback = window.setTimeout(finishExit, EXIT_MS + 50);

    return () => {
      panel?.removeEventListener("transitionend", onEnd);
      window.clearTimeout(fallback);
    };
```

`--ease-out` is defined in `apps/web/src/styles/app.css` as
`cubic-bezier(0.23, 1, 0.32, 1)`. `translate-y-2` is 0.5rem (8px), matching the
current keyframe offset.

## Repo conventions to follow

- Custom curves are referenced as `ease-(--ease-out)`; exemplar:
  `apps/web/src/components/ui/sheet.tsx:54` uses `ease-(--ease-out-quart)` with
  `data-starting-style:opacity-0` for Base UI's equivalent of `@starting-style`.
- Keep the existing `fallback` timer: it guarantees removal if
  `transitionend` never fires (for example when the tab is hidden).

## Steps

1. In `apps/web/src/components/ui/toast.tsx` line 16, change `EXIT_MS = 280` to
   `EXIT_MS = 250`.
2. In the exit `useEffect`, change the handler type to `TransitionEvent`, add
   the `event.propertyName !== "opacity"` guard, and switch both
   `addEventListener`/`removeEventListener` from `"animationend"` to
   `"transitionend"`, exactly as in the target.
3. Replace the panel `className` with the target `cn(...)` call.
4. Do not delete `.animate-rise` / `.animate-rise-out` from `app.css` in this
   plan; check with `grep -rn "animate-rise" apps/web/src` and leave cleanup to
   a separate change if they become unused.

## Boundaries

- Do NOT change the toast container, the toast store, or timing of
  auto-dismissal.
- Do NOT touch other components that use `animate-rise`.
- If the exit wiring no longer matches the excerpt, STOP and report.

## Verification

- **Mechanical**: `pnpm check` passes; `pnpm --filter @armin/web build` succeeds.
- **Feel check**: run `pnpm dev`, sign in, and trigger toasts (for example save
  settings, or copy a link):
  - A toast rises 8px and fades in over 250ms.
  - Dismissing a toast while it is still entering reverses from where it is,
    with no jump back to full opacity.
  - Triggering three toasts quickly: each enters smoothly; none restart.
  - Dismissed toasts are removed from the DOM after their fade.
  - In DevTools → Animations at 10% playback, the toast shows CSS transitions,
    not CSS animations.
  - Plan 003, if applied, still makes the toast fade without moving under
    reduced motion (`transform` is excluded from transitions there).
- **Done when**: toasts use transitions and `transitionend`, and dismissing
  mid-entry is smooth.
