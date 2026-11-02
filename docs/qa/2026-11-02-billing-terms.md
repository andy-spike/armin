# Terms, privacy, and pricing copy for Pro billing

Date: 2026-11-02
Checkout: `t3/billing-legal-terms` worktree
Environment: this checkout's local web app at
`http://armin-61cf9681fe.localhost:30536` (`pnpm dev:web`), headless Chromium
through agent-browser (1280×577 viewport). Not a real device.

## Change

The Terms of Service and Privacy Policy still described Armin as free. Pro is
now sold through Polar, so:

- Terms §8 "Plans, payments, and refunds": Polar as merchant of record,
  automatic renewal with 14 days' notice of price changes, cancel anytime with
  Pro kept to the end of the paid period, **full refund on request within 14
  days of any payment**, nothing deleted when Pro ends, and account deletion
  cancelling the subscription. Later sections renumbered; the liability cap no
  longer says Armin is free.
- Privacy: a "Payments, if you buy Pro" section (what goes to Polar, what we
  keep), Polar in "Provided by others", the deletion tombstone under "Keeping
  data", and the summary line.
- Pricing page questions: refunds and who handles the payment.

## Steps

1. `/terms` renders section 8 with working links to `/pricing`, Polar, and the
   support address (`terms.png`).
2. `/privacy` shows the payments section and Polar in the provider list.
3. `/pricing` shows the two new questions (`pricing-faq.png`).
4. No browser console errors.

`pnpm check`, `pnpm --filter @armin/web build`, and
`pnpm --filter @armin/mobile check:bundle` pass.
