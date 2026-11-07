# @armin/backend

The Convex backend for Armin: the account-scoped study database, Better Auth
(through the Convex component), server-side FSRS scheduling, private media,
exports, the hosted MCP server, and Polar billing. The web and mobile apps call
it through the generated API.

Clients import only `@armin/backend/api` (function references) and
`@armin/backend/types` (view models). Neither bundles server code.

## Rules every function follows

- **Ownership comes from the session.** `model/access.ts` maps the session to
  its library; a caller never supplies an account ID. Every lookup by ID checks
  `libraryId`, and a foreign ID behaves as "not found". MCP calls act through a
  grant that every read and write re-checks in the same transaction.
- **Study writes go through `model/`.** `model/flashcards.ts`, `decks.ts`, and
  `prereqs.ts` own every create, edit, archive, move, rename, link, and their
  cascades. App mutations, assistant tools, and imports all call them, and each
  study change commits in one mutation. Use the builders in `functions.ts`; lint
  rejects the raw ones from `_generated/server`.
- **Writes are safe to retry.** Edits name the version they started from; a
  stale save returns a conflict. Creates, ratings, undos, and imports take a
  client `requestId`, so a retry returns the first result.
- **Derived data is never written directly.** Browse summaries, deck counters,
  and activity projections are maintained by triggers (`model/summaries.ts`,
  `model/performance.ts`) in the same transaction as their source writes.
- **Reads stay bounded.** `model/limits.ts` keeps each function within Convex's
  per-function limits. Whole-library work reads index ranges and counters, never
  every row; large cleanups run as scheduled batches. Time-dependent queries take
  a `now` argument instead of ticking.
- **Plan limits live in `@armin/core/plans`** and are enforced by
  `model/usage.ts` (`checkCapacity`). Every write that adds decks, flashcards, or
  media checks them, and concept card generation reserves variants against the
  monthly allowance (`model/variantAllowance.ts`) before calling a model.
- **Media is private.** Files are validated by their bytes, content-addressed,
  and served only through authenticated routes; no storage URL reaches a client.

## Development

Run `pnpm dev:setup` once, then `pnpm dev`, from the repository root. Each
checkout gets its own local Convex deployment; see
[local development environments](../../docs/dev-worktrees.md).

```bash
pnpm --filter @armin/backend dev          # local backend + watcher only
pnpm --filter @armin/backend codegen      # regenerate convex/_generated (commit it)
pnpm --filter @armin/backend dev:clients  # rewrite client URLs without pushing
```

CLI commands such as `pnpm exec convex env set` or `convex run` (from
`packages/backend`) need the local backend running.

To read a verification or password-reset link locally without an inbox, look in
the Resend component's `emails` and `content` tables
(`npx convex data --component resend ...`).

## Deployment environment variables

Set with `pnpm exec convex env set <NAME> <value>` from `packages/backend`
(add `--prod` for production). Values never go in the repository.

| Name                                                    | Purpose                                                                                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BETTER_AUTH_SECRET`                                    | Session signing secret (`openssl rand -base64 32`).                                                                                                    |
| `SITE_URL`                                              | Public web origin. Used for auth callbacks and email links.                                                                                            |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`              | Google OAuth. Register `${SITE_URL}/api/auth/callback/google`. Google sign-in is hidden without both.                                                  |
| `RESEND_API_KEY`                                        | Verification and reset email. Without it, sign-up and resets are disabled; verified accounts can still sign in.                                        |
| `EMAIL_FROM`                                            | Optional sender. Defaults to `Armin <onboarding@resend.dev>`, which only delivers to the Resend account's own address.                                 |
| `MOBILE_TRUSTED_ORIGINS`                                | Optional comma-separated Expo origins. Defaults to `armin://`. Development adds `exp://,exp://**`; never use those in production.                      |
| `POLAR_ORGANIZATION_TOKEN`                              | Polar token. Scopes: `checkouts:write`, `customers:read`, `customers:write`, `customer_sessions:write`, `subscriptions:read`, `subscriptions:write`.   |
| `POLAR_WEBHOOK_SECRET`                                  | Signing secret of the `<site>/polar/events` webhook (or of `polar webhook listen` locally).                                                            |
| `POLAR_SERVER`                                          | `production` or `sandbox` (default).                                                                                                                   |
| `POLAR_PRODUCT_PRO_MONTHLY`, `POLAR_PRODUCT_PRO_YEARLY` | Pro product IDs. Billing is off unless the token, webhook secret, and both products are set.                                                           |
| `AI_GATEWAY_API_KEY`, `AI_GATEWAY_MODEL`                | Vercel AI Gateway key and `creator/model` ID for concept card generation. Concept cards are unavailable unless both are set (or the fake below is on). |
| `CONCEPT_GENERATOR_FAKE`                                | Development only. `true` uses a free deterministic generator; it wins over the gateway and is ignored outside a local deployment. Local setup sets it. |
| `OPENAI_APPS_CHALLENGE`                                 | Optional domain-verification token served at `/.well-known/openai-apps-challenge`. See [plugin publishing](../../plugins/PUBLISHING.md).               |
| `REVIEWER_ACCOUNT_USER_ID`, `REVIEWER_RESET_HOURS`      | Optional public reviewer account; see below.                                                                                                           |
| `SELF_HOSTED`                                           | `true` on self-hosted instances; hides billing.                                                                                                        |

Local setup also sets `JWKS` from the deployment's own Better Auth keys so
token verification doesn't call back into the local backend. Leave it unset in
production.

## Operator commands

Give an account Pro without a subscription (it must have signed in once;
`false` removes it):

```bash
pnpm --filter @armin/backend exec convex run billing:setComplimentaryPro '{"email":"you@example.com","enabled":true}' --prod
```

### Public reviewer account

The shared login `reviewer@armincards.app` / `ArminDemo123!` is visible to
everyone, so it must never hold private material. The account must exist, be
verified, and have a library. Set `REVIEWER_ACCOUNT_USER_ID` to its Better Auth
user ID to protect it and reset its library every `REVIEWER_RESET_HOURS`
(1–168, default 6). After deploying, run the first reset:

```bash
pnpm --filter @armin/backend exec convex env set REVIEWER_ACCOUNT_USER_ID <verified-user-id> --prod
pnpm --filter @armin/backend exec convex run reviewer:reset '{"force":true}' --prod
```

The reset refuses any user other than the verified reviewer email. Remove the
variable to disable it.
