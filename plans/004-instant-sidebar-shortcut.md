# 004 — Toggle the sidebar instantly from the keyboard shortcut

- **Status**: DONE
- **Commit**: 7b7de09
- **Severity**: MEDIUM
- **Category**: Purpose & frequency / Performance
- **Estimated scope**: 2 files, ~20 lines

## As implemented

The shipped change differs from the steps below. Passing `{ instant }` through
`toggleSidebar` broke the existing `onClick={toggleSidebar}` call sites (the
click event is not assignable to the options type), and clearing the switch
with `requestAnimationFrame` left it stuck on in a hidden page. Instead,
`SidebarProvider` exposes a separate `toggleSidebarInstantly`: it commits the
toggle with `resizing` on inside `flushSync`, forces a style flush with
`document.body.offsetWidth`, then turns `resizing` off. The sidebar container
also gained `group-data-resizing/sidebar-wrapper:[&_*]:transition-none`, so the
menu items' own size and fade transitions skip too.

## Problem

Collapsing or expanding the sidebar animates `width` (the gap element) and
`left`/`right`/`width` (the fixed container) over 240ms. These are layout
properties, so every frame re-lays-out the main content next to the sidebar.
The same animation also runs when the sidebar is toggled with its keyboard
shortcut (the `sidebar.toggle` command). Keyboard-initiated actions should not
animate: the user already knows what they asked for.

```tsx
/* apps/web/src/components/ui/sidebar.tsx:233 — current (gap) */
"relative w-(--sidebar-width) bg-transparent transition-[width] duration-[240ms] ease-(--ease-out-quart) group-data-resizing/sidebar-wrapper:transition-none",
```

```tsx
/* apps/web/src/components/ui/sidebar.tsx:245 — current (container, truncated) */
"fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-[240ms] ease-(--ease-out-quart) group-data-resizing/sidebar-wrapper:transition-none ...";
```

```tsx
/* apps/web/src/components/ui/sidebar.tsx:110-113 — current */
// Helper to toggle the sidebar.
const toggleSidebar = React.useCallback(() => {
  return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open);
}, [isMobile, setOpen, setOpenMobile]);
```

```tsx
/* apps/web/src/routes/_app.tsx:379 — current */
    "sidebar.toggle": toggleSidebar,
```

The wrapper already has a "no transition" switch: while `resizing` is true the
wrapper gets `data-resizing`, and both elements above carry
`group-data-resizing/sidebar-wrapper:transition-none`. Reuse it.

Clicked toggles (the sidebar button and rail) keep their 240ms animation: they
are occasional and the motion shows where the sidebar went. Moving the sidebar
to a transform-based animation would remove the layout cost too, but it changes
how the main content is laid out and is out of scope here.

## Target

- `toggleSidebar` accepts an optional `{ instant?: boolean }`. With
  `instant: true` on desktop, it sets `resizing` to true, flips `open`, and
  clears `resizing` two animation frames later, so the width change commits
  with transitions off.
- The `sidebar.toggle` shortcut calls `toggleSidebar({ instant: true })`.
- Clicks keep calling `toggleSidebar()` and animate as today.

```tsx
/* target — sidebar.tsx */
// Helper to toggle the sidebar. Keyboard toggles pass `instant` and skip the
// width transition, reusing the resize switch.
const toggleSidebar = React.useCallback(
  (options?: { instant?: boolean }) => {
    if (isMobile) return setOpenMobile((open) => !open);
    if (options?.instant) {
      setResizing(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setResizing(false)));
    }
    setOpen((open) => !open);
  },
  [isMobile, setOpen, setOpenMobile],
);
```

```tsx
/* target — _app.tsx */
    "sidebar.toggle": () => toggleSidebar({ instant: true }),
```

## Repo conventions to follow

- `SidebarContextProps` near the top of `sidebar.tsx` declares the type of
  `toggleSidebar`; update it to `(options?: { instant?: boolean }) => void` so
  existing `onClick={toggleSidebar}` call sites still type-check. Note that
  `onClick={toggleSidebar}` passes the click event as `options`; it has no
  `instant` property, so clicks keep animating. Do not change those call sites.
- No explicit return types elsewhere (repo rule); only the context type needs
  the signature.

## Steps

1. In `apps/web/src/components/ui/sidebar.tsx`, find the `SidebarContextProps`
   type and change the `toggleSidebar` member to
   `toggleSidebar: (options?: { instant?: boolean }) => void;`.
2. Replace the `toggleSidebar` `useCallback` (lines ~110-113) with the target
   code above, keeping the comment.
3. In `apps/web/src/routes/_app.tsx` line 379, change
   `"sidebar.toggle": toggleSidebar,` to
   `"sidebar.toggle": () => toggleSidebar({ instant: true }),`.

## Boundaries

- Do NOT change the transition classes on lines 233 and 245.
- Do NOT change `components/app-sidebar.tsx` (its click handlers keep animating).
- Do NOT touch mobile behavior (the `isMobile` branch is unchanged).
- If `setOpen` has a different shape than in the excerpt, STOP and report.

## Verification

- **Mechanical**: `pnpm check` passes; `pnpm --filter @armin/web build` succeeds.
- **Feel check**: run `pnpm dev`, sign in, then:
  - Press the sidebar shortcut (shown in Settings → Keyboard): the sidebar
    collapses and expands on the next frame, no slide.
  - Click the sidebar toggle button: it still slides over 240ms.
  - Press the shortcut twice quickly: no half-finished slide is visible.
  - Drag the sidebar edge to resize: still live, no lag (resize still uses
    `data-resizing`).
- **Done when**: the shortcut toggle records no transition in DevTools →
  Animations while the click toggle still does.
