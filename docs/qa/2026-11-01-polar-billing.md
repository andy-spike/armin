# Polar billing walkthrough

Date: 2026-11-01
Checkout: `t3/add-pricing-page` worktree
Environment: this checkout's local Convex deployment and web app at
`http://armin-61cf9681fe.localhost:30536`, headless Chromium through
agent-browser (1280×577 viewport), seed account `test@example.com`. Polar
**sandbox** organization; webhooks forwarded with `polar webhook listen`.
Not a real device.

## Steps

1. Settings → Billing on the free plan shows "Free" and an Upgrade row with a
   Monthly/Yearly choice (`billing-free.png`).
2. Upgrade (monthly) first failed: Polar's API rejected the prefilled
   `test@example.com` ("The domain name example.com does not accept email").
   Checkout now retries without the prefilled email.
3. The first build used Polar's embedded checkout. The iframe stayed blank:
   Polar sends `frame-ancestors 'none'` for hosts missing from its Embedding
   allowlist, and embedded checkout disables Apple Pay and Google Pay. Switched
   to Polar's hosted checkout page (user decision).
4. Upgrade redirected to Polar's sandbox checkout (`checkout-hosted.png`).
   Paid $6.00 with the test card `4242 4242 4242 4242`, country Colombia.
   Polar returned to `/settings?tab=billing&checkout=success`; the page
   replaced the URL and showed Pro, "$6.00 / month", renewing December 1, 2026
   (`billing-pro.png`). Forwarded `subscription.created`, `subscription.active`,
   and `customer.state_changed` all returned 202. The `billing` row held the
   active subscription and the library's `plan` was `pro`.
5. Manage subscription opened Polar's customer portal for the same customer,
   with Change plan and Cancel available (`portal.png`). Cancelled there; the
   Billing tab updated live to "Ends December 1, 2026" with Pro kept
   (`billing-canceled.png`).
6. Revoked the subscription through the sandbox API, standing in for the end
   of the paid period. `subscription.revoked` and `customer.state_changed`
   returned 202; the `billing` row became `null`, the library's plan `free`,
   and the tab showed the upgrade offer again (`billing-ended.png`).
7. `/pricing` shows "Upgrade to Pro", which opens Settings → Billing
   (`pricing.png`); signed-out visitors go through sign-in to the same tab.
8. A forwarded sample `customer.state_changed` for an unknown customer
   returned 202 and changed nothing. The CLI could not build a sample
   `subscription.updated` itself (a CLI-side payload error), so real
   subscription events covered that path.

## After the code review

A Codex review found that deletion revokes were neither retried nor applied to
checkouts completed after deletion, that concurrent syncs could apply an older
Polar read last, and that the checkout return announced Pro without checking.
The sync became a leased per-user job with request numbers, retries, and a
deletion tombstone. Re-tested:

9. Opening `/settings?tab=billing&checkout=success` without paying showed
   "Confirming your payment", then after 30 s "Payment not confirmed yet" with
   Retry, and no "Welcome to Pro" (`checkout-unconfirmed.png`).
10. A yearly checkout ($48.00) returned to Billing, which showed Pro,
    "$48.00 / year" once the job applied it; `requested` and `applied` both 8,
    lease released (`billing-pro.png`).
11. Deletion tombstone: set the account's `billing` row to `deleted` and
    requested a sync, as a late webhook does. The runner revoked the live
    yearly subscription; Polar reported it `canceled` with `ended_at` set, and
    the revoke webhooks that followed were all applied (`requested` =
    `applied` = 13). The row was then restored for further testing.
12. Retry: with an invalid Polar token, a sync recorded `failures: 1` and
    the 401 in `lastError`; after restoring the token the scheduled retry
    30 s later succeeded and set the plan to `free`.

`pnpm check`, `pnpm --filter @armin/web build`, and
`pnpm --filter @armin/mobile check:bundle` pass.

## Not exercised

- Production Polar organization, its dashboard webhook, and payouts.
- A failed renewal (`past_due`), switching monthly ↔ yearly in the portal, and
  deleting an account through the app (the tombstone was set directly).
- Self-hosted mode hiding billing (covered by the `billingEnabled` check, not
  run here) and the mobile app, which does not show billing.
