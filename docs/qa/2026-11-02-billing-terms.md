# Terms, privacy, pricing copy, and licensing notices

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

Licensing (after a license review; AGPL-3.0-only kept):

- `TRADEMARKS.md`: the code license doesn't cover the Armin name and logo;
  public forks and hosted services need their own.
- README "License" section, and a contributor-license note in
  `CONTRIBUTING.md` for when code PRs open.
- `writing-study-cards` skill licensed CC BY 4.0 (`LICENSE.md` and frontmatter
  in both copies, which stay identical), crediting Andy Matuschak's essay.
- "Source code" in the account menu and the legal pages' footer, from
  `apps/web/src/lib/source-code.ts`, so the AGPL §13 source offer is one place
  for forks to change.

## Steps

1. `/terms` renders section 8 with working links to `/pricing`, Polar, and the
   support address (`terms.png`).
2. `/privacy` shows the payments section and Polar in the provider list.
3. `/pricing` shows the two new questions (`pricing-faq.png`).
4. Signed in as the seed account, the account menu lists Settings, Source
   code, and Sign out (`account-menu.png`); Source code opened
   `https://github.com/andy-spike/armin` in a new tab.
5. `/privacy` footer has a "Source code" link to the same repository.
6. No browser console errors. `pnpm plugin:package` passes (skill copies
   identical).

`pnpm check`, `pnpm --filter @armin/web build`, and
`pnpm --filter @armin/mobile check:bundle` pass.
