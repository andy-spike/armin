# Production deployment

Production has two parts, deployed separately from `master`:

| Part | Where | URL |
| --- | --- | --- |
| Backend (Convex functions, data, auth) | Convex cloud, prod deployment `intent-bullfrog-922` | `https://intent-bullfrog-922.convex.cloud` |
| Web app (TanStack Start, server-rendered) | Cloudflare Workers, Worker `armin-web` | `https://armincards.app` |

Deploy the backend first when a change touches both, so the web app never
calls functions that don't exist yet.

## Backend

From `packages/backend`, on an up-to-date `master`:

```bash
npx convex deploy
```

The production environment variables (`SITE_URL`, `BETTER_AUTH_SECRET`,
`EMAIL_FROM`, `MOBILE_TRUSTED_ORIGINS`, `RESEND_API_KEY`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`) live on the Convex deployment, never in the
repository. See [the backend README](../packages/backend/README.md#deployment-environment-variables).
In a worktree, whose `.env.local` selects a local deployment, prefix Convex
commands with `CONVEX_DEPLOYMENT=dev:oceanic-fly-888` so the CLI resolves the
cloud project; `--prod` and `deploy` then target production.

## Web app

The Cloudflare Vite plugin builds the server for Workers (`apps/web/wrangler.jsonc`).
Production Convex URLs are public and committed in `apps/web/.env.cloudflare`.
The `cloudflare` build mode loads them ahead of `.env.local`, so a deploy from
any checkout targets production, while ordinary `build` and `dev` keep using the
checkout's local deployment.

One-time setup:

1. Add `armincards.app` to the Cloudflare account as a zone, and keep the
   Resend DNS records (SPF, DKIM, DMARC) when moving DNS.
2. Run `pnpm exec wrangler login` from `apps/web` (or set `CLOUDFLARE_API_TOKEN`
   with the Workers Scripts and Workers Routes edit permissions).

Deploy, from `apps/web`:

```bash
pnpm run deploy
```

This builds with `--mode cloudflare` and runs `wrangler deploy`. The first
deploy creates the `armin-web` Worker and attaches the `armincards.app` custom
domain, including its DNS record and certificate.

Redirect `www` once, in the Cloudflare dashboard: add a proxied DNS record for
`www` and a redirect rule from `www.armincards.app/*` to
`https://armincards.app/${1}` with status 301, preserving the query string.

Check the build locally with `pnpm preview:cloudflare` (runs the production
build in workerd against the production backend; use a throwaway account).

## Compatibility date

`compatibility_date` in `wrangler.jsonc` must not be newer than the date the
installed `workerd` supports, or `pnpm dev` fails to start. Raise it when
upgrading `wrangler` and `@cloudflare/vite-plugin`.
