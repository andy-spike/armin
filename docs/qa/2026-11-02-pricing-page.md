# Pricing page overhaul

Date: 2026-11-02
Checkout: `t3/63733f0c` worktree
Environment: this checkout's local web app at
`http://armin-1bf0a09644.localhost:14288` (`pnpm dev`), headless Chromium
through agent-browser at 1280×900 (desktop) and 390×844 (emulated phone
viewport, not a real device).

## Change

- A Monthly / Yearly switch sits at the top beside the title, defaulting to
  Yearly with a "Save 33%" note. Pro shows $6 per month billed monthly, or
  $4 per month as $48 billed once a year (saving $24). Prices come from
  `PLAN_PRICES`; limits from `PLAN_LIMITS`.
- Each plan card lists its headline allowances with exact numbers.
- A "Compare plans" table lists every limit and feature for both plans:
  library (cards, review items, decks, cards per deck, image and audio
  storage), AI assistants (clients, monthly cards, hourly changes, assistant
  Anki import), studying, and data import/export.
- "Upgrade to Pro" carries the chosen period to Settings → Billing
  (`?interval=month|year`), which preselects it at checkout.
- `components/ui/switch.tsx` is now shadcn's Switch on Base UI
  (`@base-ui/react/switch`), with the same props, so existing callers are
  unchanged. AGENTS.md says `ui/` primitives follow shadcn's Base UI variants.

## Steps

1. Light, desktop, Yearly by default: Pro shows $4 per month, "$48 billed once
   a year, saving $24", and the link is `/settings?tab=billing&interval=year`
   (`desktop-yearly-light.png`).
2. Clicking the switch shows $6 per month, "Billed monthly. Cancel anytime.",
   and the link changes to `interval=month`. Space on the focused switch toggles
   it back, and clicking either label picks that period. The focus ring is
   visible (`desktop-monthly-focus-light.png`).
3. Dark, 390 px: the title, switch, cards, and table stack without horizontal
   scrolling (`scrollWidth` 390) (`mobile-yearly.png`). Dark desktop:
   `desktop-yearly.png`.

## Validation

`pnpm check`, `pnpm --filter @armin/web build`, and
`pnpm --filter @armin/mobile check:bundle` pass.
