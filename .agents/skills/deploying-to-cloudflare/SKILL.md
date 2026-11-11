---
name: deploying-to-cloudflare
description: Deploy Armin to production: the Convex backend, the web app (Worker `armin-web`), and the docs site (Worker `armin-docs`). Use only when the user asks to deploy, release, or ship, or to set up production Polar billing, PostHog analytics, or Cloudflare DNS and domains.
---

# Deploying Armin to production

Merging a PR does not deploy. Deploy from an up-to-date `master`, and confirm with the user before running any production command.

| Part                                      | Where                                               | URL                                        |
| ----------------------------------------- | --------------------------------------------------- | ------------------------------------------ |
| Backend (Convex functions, data, auth)    | Convex cloud, prod deployment `intent-bullfrog-922` | `https://intent-bullfrog-922.convex.cloud` |
| Web app (TanStack Start, server-rendered) | Cloudflare Workers, Worker `armin-web`              | `https://armincards.app`                   |
| Docs site (Nimbus, the user guide)        | Cloudflare Workers, Worker `armin-docs`             | `https://docs.armincards.app`              |

Deploy the backend first when a change touches both, so the web app never calls functions that don't exist yet. Run `pnpm check` first.

## Backend

From `packages/backend`:

```bash
npx convex deploy
```

Production environment variables live on the Convex deployment, never in the repo: `SITE_URL`, `BETTER_AUTH_SECRET`, `EMAIL_FROM`, `MOBILE_TRUSTED_ORIGINS`, `RESEND_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the Polar billing variables (see `packages/backend/README.md#deployment-environment-variables`).

A worktree's `.env.local` selects a local deployment. Prefix Convex commands with `CONVEX_DEPLOYMENT=dev:oceanic-fly-888` so the CLI resolves the cloud project; then `--prod` and `deploy` target production.

### Polar billing (once, before enabling billing)

1. Connect the payout account (Finance → Payout account) and pass Polar's organization review.
2. Create the monthly and yearly Pro products and an organization access token with the scopes in the backend README.
3. Add a webhook (Settings → Webhooks): URL `<production Convex site URL>/polar/events`, format Raw, a generated secret, events `subscription.*` and `customer.state_changed`.
4. Set `POLAR_ORGANIZATION_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRODUCT_PRO_MONTHLY`, `POLAR_PRODUCT_PRO_YEARLY`, and `POLAR_SERVER=production` with `npx convex env set --prod`.

Billing stays off until all five are set.

## Web app

The Cloudflare Vite plugin builds the server for Workers (`apps/web/wrangler.jsonc`). Production Convex URLs and PostHog values are public and committed in `apps/web/.env.cloudflare`. The `cloudflare` build mode loads them ahead of `.env.local`, so a deploy from any checkout targets production.

From `apps/web`:

```bash
pnpm run deploy
```

This builds with `--mode cloudflare` and runs `wrangler deploy`. Check the build first with `pnpm preview:cloudflare` (runs the production build in workerd against the production backend; use a throwaway account).

One-time setup:

1. Add `armincards.app` to the Cloudflare account as a zone, keeping the Resend DNS records (SPF, DKIM, DMARC) when moving DNS. The first deploy creates `armin-web` and attaches the custom domain, DNS record, and certificate.
2. Run `pnpm exec wrangler login` from `apps/web`, or set `CLOUDFLARE_API_TOKEN` with Workers Scripts and Workers Routes edit permissions.
3. Redirect `www`: add a proxied DNS record for `www` and a redirect rule from `www.armincards.app/*` to `https://armincards.app/${1}`, status 301, preserving the query string.

## Docs site

No backend; it deploys on its own. From `apps/docs`:

```bash
pnpm run deploy
```

This runs `astro check`, builds with the Nimbus Cloudflare adapter, and runs `wrangler deploy`. The first deploy creates `armin-docs` and attaches `docs.armincards.app`. Check locally with `pnpm preview:cf`.

## Compatibility date

`compatibility_date` in each `wrangler.jsonc` must not be newer than the date the installed `workerd` supports, or `pnpm dev` fails to start. Raise it when upgrading `wrangler` and `@cloudflare/vite-plugin`.

## PostHog analytics and error reports

See [references/posthog.md](references/posthog.md).
