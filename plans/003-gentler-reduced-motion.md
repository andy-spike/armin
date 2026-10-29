# 003 — Reduced motion: drop movement, keep fades

- **Status**: DONE
- **Commit**: 7b7de09
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file, ~40 lines of CSS

## Problem

With `prefers-reduced-motion: reduce`, every animation and transition in the
app is cut to 0.001ms. Reduced motion should mean fewer and gentler animations,
not none: opacity and color changes help people follow what changed (a dialog
appearing, a toast arriving) and are safe; only movement (translate, scale,
sliding) should go.

```css
/* apps/web/src/styles/app.css:804-815 — current */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
  .skeleton {
    animation: none;
    background: var(--color-surface-sunken);
  }
}
```

Motion in the app comes from three sources, all handled below:

1. The app's own keyframes in `app.css` (`a-rise`, `a-pop`, `a-pop-out`,
   `a-flip-in`, `a-rise-out`, `a-bar-in`, `a-bar-out`), which move and fade.
2. `tw-animate-css` popups (tooltips, menus, selects, comboboxes, context menus)
   using `animate-in`/`animate-out` with `zoom-*` and `slide-in-from-*`. These
   read the custom properties `--tw-enter-scale`, `--tw-enter-translate-x`,
   `--tw-enter-translate-y`, `--tw-exit-scale`, `--tw-exit-translate-x`,
   `--tw-exit-translate-y`.
3. CSS transitions on `transform`, `translate`, `scale`, `width`, `left` and
   `right` (sheet slide, sidebar collapse, switch thumb, card-tile exit).

## Target

Inside the reduced-motion media query:

- Redefine the moving keyframes as opacity-only, so every component keeps its
  timing and its `animationend` handlers (dialogs, toasts, and the cloze
  popover rely on `animationend` to unmount).
- Neutralise the tw-animate movement variables, keeping its fade.
- Stop transitions on movement properties only; colors and opacity keep their
  normal durations.
- The skeleton shimmer stays off; the landing page's own reduced-motion block
  (`.landing-cursor { display: none; }`) is unchanged.

```css
/* target — replaces the block at app.css:804-815 */
@media (prefers-reduced-motion: reduce) {
  /* Fewer, gentler animations: keep fades and color changes, drop movement. */
  @keyframes a-rise {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes a-pop {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes a-flip-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes a-bar-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes a-pop-out {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  @keyframes a-rise-out {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  @keyframes a-bar-out {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  *,
  *::before,
  *::after {
    --tw-enter-scale: 1 !important;
    --tw-enter-translate-x: 0 !important;
    --tw-enter-translate-y: 0 !important;
    --tw-exit-scale: 1 !important;
    --tw-exit-translate-x: 0 !important;
    --tw-exit-translate-y: 0 !important;
    transition-property:
      color, background-color, border-color, outline-color, text-decoration-color, fill, stroke,
      opacity, box-shadow !important;
  }
  .skeleton {
    animation: none;
    background: var(--color-surface-sunken);
  }
}
```

Run `pnpm format` afterwards; it will reflow the keyframes onto multiple lines,
which is fine.

Why this works: the block is unlayered and comes after the `@layer utilities`
keyframes, so its `@keyframes` definitions win while the media query matches.
`transition-property` with `!important` overrides every component's transition
list, so transform/size/position changes jump to their end state while color
and opacity still ease.

## Repo conventions to follow

- All global motion lives in `apps/web/src/styles/app.css`; the existing
  reduced-motion block is the one to replace. Don't add a second one.
- Keyframes are named `a-*` and defined in `@layer utilities` near the top of
  the "Motion" section (around line 141).

## Steps

1. Replace the whole `@media (prefers-reduced-motion: reduce) { … }` block that
   starts around `app.css:804` (the one containing `animation-duration: 0.001ms`)
   with the target block above.
2. Leave the separate landing block (`@media (prefers-reduced-motion: reduce) {
   .landing-cursor { display: none; } }`, around line 711) untouched.
3. Run `pnpm format`.

## Boundaries

- Do NOT edit any component `.tsx` file.
- Do NOT change the keyframes outside the media query.
- Do NOT remove `animate-spin` spinners; a loading spinner is essential
  feedback and keeps spinning.
- If the current block differs from the excerpt (drift since 7b7de09), STOP and
  report.

## Verification

- **Mechanical**: `pnpm check` passes; `pnpm --filter @armin/web build` succeeds.
- **Feel check**: run `pnpm dev`, open DevTools → Rendering → "Emulate CSS
  media feature prefers-reduced-motion: reduce", then:
  - Open and close a dialog (for example Rename deck): it fades in and out
    without rising or scaling, and it still unmounts after closing.
  - Trigger a toast (for example save settings): it fades in place, no rise,
    and disappears after dismissal.
  - Open a dropdown menu and hover a tooltip: they fade without zooming or
    sliding.
  - Collapse the sidebar: it jumps to its new width with no slide.
  - Hover a button: its background color still eases.
  - Turn the emulation off and confirm the normal motion is back unchanged.
- **Done when**: under reduced motion nothing moves or scales, fades still
  play, and every closing component still unmounts.
