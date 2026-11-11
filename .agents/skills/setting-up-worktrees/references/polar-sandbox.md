# Polar sandbox payments

All checkouts on this machine share one Polar sandbox organization and its Pro products, but keep their own customers and billing state. Use distinct buyer email aliases for concurrent scenarios. Never copy a billing-enabled database between checkouts.

## One-time machine setup

1. Install the Polar CLI and run `polar auth login --sandbox`. Keep the session on sandbox.
2. Create `~/.config/armin/polar-sandbox.env` (directory mode 700, file mode 600). Never commit it or put production tokens in it.

   ```dotenv
   POLAR_SERVER=sandbox
   POLAR_SANDBOX_ORGANIZATION_ID=<sandbox organization UUID>
   POLAR_ORGANIZATION_TOKEN=<sandbox organization token>
   POLAR_PRODUCT_PRO_MONTHLY=<sandbox monthly product UUID>
   POLAR_PRODUCT_PRO_YEARLY=<sandbox yearly product UUID>
   POLAR_WEBHOOK_SECRET=<secret from polar webhook listen --print-secret --json>
   # Optional: POLAR_RELAY_PORT=3219
   ```

   The token needs the billing scopes listed in `packages/backend/README.md`.

3. Run `pnpm worktree:setup` in existing checkouts. New worktrees pick it up.

Setup installs the five billing variables into each local deployment and registers the checkout under `~/.config/armin/polar-targets/`. Without the shared file, setup leaves billing alone.

## Webhook relay

`pnpm dev` and `pnpm dev:backend` start or reuse one detached, loopback-only relay on port 3219. It verifies signatures and forwards webhooks to registered, running worktrees. It survives stopping one worktree and restarts on the next backend launch, but isn't a durable queue: after downtime, use Billing's Retry to refresh state.

- Foreground diagnostics: `pnpm dev:polar` while the relay is stopped. Never start a second relay on its port.
- Stop it: find the listener with `lsof -iTCP:3219 -sTCP:LISTEN` and send SIGTERM.
- After rotating the signing secret or changing the organization or port: stop the relay, update the shared file, rerun setup in each checkout, restart dev.
- Per-checkout product or token overrides go in that checkout's ignored `.armin/polar-sandbox.env`; rerun setup. Organization, secret, server, and port stay machine-wide.

## Testing a checkout

Sandbox checkout accepts card `4242 4242 4242 4242`, a future expiry, and any CVC. Polar may reject `test@example.com`; use a real email alias you control. Sandbox customer emails go only to organization members and their aliases.
