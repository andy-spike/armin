# @armin/backend

The Convex backend for the Armin web SaaS: the account-scoped study database,
Better Auth (through the Convex component), server-owned FSRS scheduling,
private image storage, and library export. The web app (`apps/web`) and the
Expo app (`apps/mobile`) both call the same Convex functions through the
generated API.

## What lives where

- `convex/schema.ts` — tables. Every study row carries `libraryId`; one library
  per Better Auth user.
- `convex/auth.ts`, `auth.config.ts`, `http.ts` — Better Auth with the Convex
  adapter, email verification and password reset through Resend, Google sign-in,
  verified account linking, and the authenticated `/media/*` and `/export/*`
  HTTP routes and authenticated raw-byte image upload.
- `convex/agents.ts`, `agentHttp.ts`, `agentAuthoring.ts` — scoped OAuth grants,
  hosted MCP transport, and atomic agent authoring. See
  [AI assistant connections](../../docs/agent-connections.md).
- `convex/account.ts` — viewer, idempotent library provisioning, account
  timezone, and the library revision clients subscribe to.
- `convex/decks.ts`, `flashcards.ts`, `graph.ts`, `settings.ts` — authoring,
  browse, prerequisite graph, and scheduling settings.
- `convex/review.ts` — queue, rating previews, rate, and undo.
- `convex/media.ts`, `exports.ts`, `exportBuilder.ts` — private images and the
  ZIP export job.
- `convex/deletion.ts`, `maintenance.ts`, `crons.ts` — bounded cleanup jobs.
- `convex/model/` — shared server logic: access checks, queue selection, lock
  propagation, limits, and error codes.

Client entry points (see `package.json` `exports`):

- `@armin/backend/api` — generated function references. Importing it never
  bundles backend implementation code.
- `@armin/backend/types` — type-only view models for clients.

## Rules every function follows

- First-party ownership comes from the authenticated session and its library mapping
  (`model/access.ts`), never from a caller-supplied account ID. Lookups by ID
  check `libraryId` before returning or changing anything; a foreign ID behaves
  as "not found".
- External MCP calls use a separate OAuth grant derived from a verified Armin
  session at consent. Agent functions recheck the active grant, resource audience,
  active library, and deck permissions. Agent tokens never impersonate a user in
  first-party Convex functions. Account deletion invalidates grants immediately.
- Writes require a verified email and an `active` library. Account deletion
  marks the library `deleting` in the same transaction as the auth user removal,
  so access ends immediately; `deletion.cleanupLibrary` then removes rows and
  files in bounded batches.
- The account-wide Frontier cap (in the account timezone) limits which new
  units the review queue admits. A rating validates the displayed review-unit
  version and current eligibility (locks, archive, due time), but not the cap,
  so an answer to a card already admitted to a session is never discarded
  when the budget runs out mid-session. It runs FSRS at server time, and writes the schedule, the review log,
  and prerequisite lock changes in one mutation. Undo restores the exact saved
  pre-review schedule only while that review is still the unit's latest. Earned
  prerequisite access is permanent and survives lapses, Undo, and authoring changes.
- Edits name the version they started from. The first accepted edit wins; a
  stale save returns a conflict and changes nothing. Creates, ratings, and
  undos take a client request ID so an application-level retry returns the
  first result instead of applying twice.
- Images are validated by their bytes (type sniffing, size), counted against a
  per-library quota, content-addressed, and only served through authenticated
  routes. No storage URL is ever returned to a client.

## Beta limits

`convex/model/limits.ts` and `@armin/core/media` bound each library so every
query and mutation fits Convex's per-function limits (32,000 documents scanned,
4,096 index ranges, 16 MiB read) and every export fits one HTTP response
(100 MiB): 200 decks, 2,000 flashcards, 10,000 review units, 2,000 prerequisite
links per deck, 10 MiB per image, and 80 MiB of images per library. Review
history is unbounded and is read in pages or deleted in batches. Deletion
consequences use review-unit lifetime counts and indexed boundary logs. Moving
a card keeps its history without rewriting it; exports resolve each log to its
unit's current deck. Deleting cards or decks removes active study data atomically
and schedules bounded history cleanup. Graph writes compare the displayed
library revision, so another saved library change can require a graph reload.

## Development

When deploying the unlock-once policy to an existing deployment, run the bounded,
idempotent backfill after pushing the new backend and before resuming study:

```bash
pnpm --filter @armin/backend exec convex run maintenance:grantLegacyPrerequisiteAccess '{}'
```

Each batch processes one flashcard and schedules the next batch. This also bounds
read size when a cloze flashcard has many large review units.
Check the scheduled functions in that deployment until the migration finishes.
It preserves unlocked cards, restores locked cards with surviving review history,
and leaves unreviewed locked cards gated. No lifetime review-log scan is needed.
Run this only against the intended deployment; development checkouts target
their own local deployment. New flashcards record their access state immediately.

Development uses a local Convex deployment per checkout, never a cloud dev
deployment. Run `pnpm dev:setup` from the repository root (with Node 20, 22, or
24; `vp env` selects the pinned 24, and local `"use node"` actions need it) to create it, push, set
`SITE_URL`, `MOBILE_TRUSTED_ORIGINS`, and `BETTER_AUTH_SECRET`, seed the sample
account, and copy its URLs into the web and mobile `.env.local` files. Then
`pnpm dev` runs the local backend and web client together. Email and Google
secrets still need the configuration below. To copy URLs without pushing, run
`pnpm --filter @armin/backend dev:clients`. See
[local development environments](../../docs/dev-worktrees.md).

Individual backend commands from the repository root:

```bash
# Run this checkout's local backend on its allocated ports and watch for changes.
# Requires pnpm dev:setup first.
pnpm --filter @armin/backend dev

# Regenerate convex/_generated without watching (commit the result).
pnpm --filter @armin/backend codegen

# Type check every workspace, including Convex functions (from the root).
pnpm typecheck
```

`convex dev` pushes code on save. Add `--typecheck disable` if you want pushes
to continue while the TypeScript project is temporarily broken, and
`--tail-logs always` to stream function logs.

### Deployment environment variables

Set these on the Convex deployment with `npx convex env set <NAME> <value>` from
`packages/backend` (values are never stored in the repository). For the local
dev deployment, keep `pnpm dev` running while you set them:

| Name                                       | Purpose                                                                                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                       | Session signing secret. Generate with `openssl rand -base64 32`.                                                                                                                      |
| `SITE_URL`                                 | Public web origin, `http://localhost:3000` in development. Used for auth callbacks and email links.                                                                                   |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth web client. Register `${SITE_URL}/api/auth/callback/google` as a redirect URI.                                                                                           |
| `RESEND_API_KEY`                           | Resend key for verification and password-reset email.                                                                                                                                 |
| `EMAIL_FROM`                               | Optional. Defaults to `Armin <onboarding@resend.dev>`, which Resend only delivers to the Resend account's own address.                                                                |
| `MOBILE_TRUSTED_ORIGINS`                   | Optional comma-separated origins for the Expo app. Defaults to `armin://`. The development deployment adds `exp://,exp://**` for Expo Go; never use `exp://` wildcards in production. |
| `OPENAI_APPS_CHALLENGE`                    | Optional. The exact domain-verification token from OpenAI's plugin portal, served at `/.well-known/openai-apps-challenge`. See [plugin publishing](../../plugins/PUBLISHING.md).      |

Without `RESEND_API_KEY`, sign-up, password reset, and verification resends are
disabled and say that email is unavailable; existing verified accounts can still
sign in. Without both Google variables, the app hides Google sign-in.

### Public reviewer account

The disposable public login is `reviewer@armincards.app` / `ArminDemo123!`.
Its data is shared and visible to everyone, and must not contain private material.
The reviewer account must already exist, be verified, and have a provisioned
library. To enable its protection and reset, set `REVIEWER_ACCOUNT_USER_ID` to
its Better Auth user ID on the intended deployment. An unset ID disables the
feature. `REVIEWER_RESET_HOURS` optionally sets an integer interval from 1 to
168, defaulting to 6. The reset job checks every five minutes, so timing is
approximate. Its first run restores the sample library immediately; subsequent
runs are measured from completion. Sign-in sessions and OAuth authorizations
are retained, but authorizations for selected old decks do not gain access to
the replacement deck.

After deploying from `master`, set the variables on production using the
[deployment instructions](../../docs/deploy-cloudflare.md), then run the
operator-only reset and inspect the scheduled functions until it finishes:

```bash
pnpm --filter @armin/backend exec convex env set REVIEWER_ACCOUNT_USER_ID <verified-user-id> --prod
pnpm --filter @armin/backend exec convex run reviewer:reset '{"force":true}' --prod
```

The reset validates the configured user is the verified reviewer email before
erasing data. Never point it at a real user. An interrupted cleanup is retried
by the periodic job. Remove the ID to disable future resets and account
protections.

### QA without an inbox

Real verification and reset links are only delivered to the Resend account's
address while the sender is `onboarding@resend.dev`. For other QA addresses,
Resend rejects the send, but the Resend component still stores the message in
the local development deployment. An operator with CLI access to that deployment can
read the link from the component's `emails` and `content` tables
(`npx convex data --component resend ...`) and open it in the browser. This is
the same link the email carries; there is no verification bypass in the app.
Treat these links as secrets and use dedicated QA accounts.
