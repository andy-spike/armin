# 001 — Make the review answer reveal instant

- **Status**: DONE
- **Commit**: 7b7de09
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 1 file, 2 class removals

## Problem

Revealing a card's answer (Space, or the Show answer button) plays a 280ms
rise-and-fade on the answer block and on all four rating buttons. This is the
most frequent action in the app: a study session reveals hundreds of answers a
day, almost all from the keyboard. Animation on a 100+/day, keyboard-initiated
action makes the app feel slower every single time; the answer should simply be
there when the key lands.

```tsx
/* apps/web/src/components/review-session.tsx:223-224 — current */
      {flipped && (
        <div className="animate-flip-in flex w-full flex-col items-center">
```

```tsx
/* apps/web/src/components/review-session.tsx:858-859 — current (one rating button) */
                        className={cn(
                          "animate-flip-in flex h-full min-w-0 flex-col items-center justify-center gap-0 rounded-md px-1 text-sm leading-tight font-medium text-on-accent transition-[background-color,opacity] duration-150 focus-visible:outline-none ...",
```

`animate-flip-in` is defined in `apps/web/src/styles/app.css` as
`animation: a-flip-in 0.28s var(--ease-out-quart) both;` (translateY(6px) +
opacity 0 → rest).

## Target

No enter animation on the revealed answer or the rating buttons. Both appear in
their final state on the frame the answer is revealed. The rating buttons keep
their existing `transition-[background-color,opacity] duration-150` hover and
disabled feedback.

## Repo conventions to follow

- Motion classes are plain Tailwind/utility class strings inside `cn(...)`.
  Removing the `animate-flip-in` token from the string is the whole change.
- The landing page demo (`apps/web/src/components/landing/review-demo.tsx:118`,
  `:121`) also uses `animate-flip-in`. It is a marketing demo seen once, so it
  keeps its animation.

## Steps

1. In `apps/web/src/components/review-session.tsx` around line 224, change
   `className="animate-flip-in flex w-full flex-col items-center"` to
   `className="flex w-full flex-col items-center"`.
2. In the same file around line 859, delete `animate-flip-in ` (including the
   trailing space) from the start of the rating button's class string. Leave
   every other class unchanged.
3. Search the file for any other `animate-flip-in`; there should be none left.
   Do not delete the `.animate-flip-in` class or `a-flip-in` keyframes from
   `app.css` — the landing demo still uses them.

## Boundaries

- Do NOT touch `apps/web/src/components/landing/review-demo.tsx`.
- Do NOT change markup or structure, only the two class strings.
- Do NOT add a replacement animation (no fade, no shorter duration).
- If either line no longer contains `animate-flip-in` at the cited place
  (drift since 7b7de09), STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm check` passes; `pnpm --filter @armin/web build` succeeds.
- **Feel check**: run `pnpm dev`, sign in with the seed account, start a review,
  and press Space to reveal:
  - The answer and the rating row are fully visible on the same frame as the
    key press; nothing slides up or fades in.
  - In DevTools → Animations panel, revealing an answer records no animation
    group.
  - Hovering a rating button still eases its background color.
- **Done when**: `grep -n animate-flip-in apps/web/src/components/review-session.tsx`
  returns nothing.
