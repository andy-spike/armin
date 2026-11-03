# Shared Polar sandbox for local worktrees

Validated in the T3 worktree `t3-56c8bb4c`, using its anonymous local Convex
backend on ports 30006/30007. Web URL printed by the launcher:
`http://armin-d71c5d53cb.localhost:30004` (HTTP 200 confirmed).

## Provisioning and app walkthrough

1. Confirmed the installed Polar CLI v3 session selected the Armin Cards sandbox
   organization. Discovered the existing monthly/yearly Pro products through the
   CLI; validated the privately supplied organization token against the sandbox
   products API. No production API or deployment was modified.
2. Saved machine configuration outside Git with directory mode 700/file mode 600.
   `pnpm worktree:setup` installed the five Polar variables into this checkout's
   local deployment, registered its webhook destination, and seeded its separate
   demo account/library. Secret values were not included in this record.
3. Started `pnpm dev`. The shared relay was available on loopback port 3219;
   subsequent startup reused it. Both backend and web became ready.
4. Used agent-browser with a dedicated task session, desktop Chromium, to load
   the app, sign in as the seed account, and open Settings → Billing. Monthly
   ($6) and yearly ($48) choices and Upgrade were available.
5. Clicked Upgrade on the monthly choice. The app created a checkout successfully
   and navigated to Polar's sandbox hosted checkout, where the buyer email, name,
   country, payment form, and Subscribe now action were present. No payment was
   submitted during this walkthrough. Closed the task browser session afterward.
6. `polar webhook trigger customer.state_changed --seed 7 --json` reported
   sandbox delivery through `http://127.0.0.1:3219/polar/events` with HTTP 202.
   The synthetic event does not change a real customer's subscription.

## Relay exercise

Used a temporary Node HTTP harness (not a committed test suite), registering two
local receiving servers and a stopped destination alongside the actual worktree.
Signed an unknown event using the configured secret. Both receiving servers got
identical original body bytes and signature headers; the stopped destination was
skipped and the relay returned 202. A bad signature returned 403 without reaching
the receivers. A live receiver returning 500 caused the relay to return 503.
Removed all temporary registrations and closed the harness servers afterward.
This exercises simultaneous destinations, not two full running app worktrees.

## Checks

- `pnpm check`: passed format, lint, and type checks.
- `pnpm --filter @armin/web build`: passed (existing sourcemap warnings).
- `pnpm --filter @armin/mobile check:bundle`: passed Android and iOS exports.
- `git diff --check`: passed.

The shared relay is a development forwarder without a durable delivery queue.
No complete payment, renewal, refund, account deletion, or production billing
scenario was exercised here. Other branches must include these setup changes
before their setup/launch commands can provision and reuse the relay.
