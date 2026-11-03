# Pricing page overhaul

Date: 2026-11-02
Checkout: `t3/63733f0c` worktree
Environment: this checkout's local web app at
`http://armin-1bf0a09644.localhost:14288` (`pnpm dev`), headless Chromium
through agent-browser at 1280×900 (desktop) and 390×844 (emulated phone
viewport, not a real device).

## Change

- A Monthly / Yearly switch sits at the top beside the title. It starts on
  Monthly; nothing preselects the longer commitment. Pro shows the price you
  actually pay for the period: $6 per month, or $48 per year. The yearly price
  is never broken down into a per-month figure. A "Save 33%" note states the
  difference from twelve monthly payments. Settings → Billing also defaults to
  Monthly. Prices come from `PLAN_PRICES`; limits from `PLAN_LIMITS`.
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
- The questions are a collapsible list built from shadcn's Accordion on Base UI
  (`components/ui/accordion.tsx`, new). All start closed, and several can be open
  at once.

## Steps

1. Light, desktop, Monthly by default: Pro shows "$6 per month", "Billed every
   month. Cancel anytime.", and the link is `/settings?tab=billing&interval=month`
   (`desktop-monthly-light.png`).
2. Clicking the switch shows "$48 per year", "Billed once a year. Cancel
   anytime.", and the link changes to `interval=year` (`desktop-yearly-light.png`).
   Space on the focused switch toggles it, and clicking either label picks that
   period.
3. Dark, 390 px: the title, switch, cards, and table stack without horizontal
   scrolling (`scrollWidth` 390) (`mobile-monthly.png`).
4. Questions: five triggers, all collapsed on load. Clicking "What happens if Pro
   ends?" opens it (`aria-expanded="true"`) and the chevron flips
   (`desktop-questions-light.png`). With "Can I get a refund?" focused, Enter
   opens it and Space closes it.

## Validation

`pnpm check`, `pnpm --filter @armin/web build`, and
`pnpm --filter @armin/mobile check:bundle` pass.
