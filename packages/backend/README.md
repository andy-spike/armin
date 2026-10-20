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

- Ownership comes from the authenticated session and its library mapping
  (`model/access.ts`), never from a caller-supplied account ID. Lookups by ID
  check `libraryId` before returning or changing anything; a foreign ID behaves
  as "not found".
- Writes require a verified email and an `active` library. Account deletion
  marks the library `deleting` in the same transaction as the auth user removal,
  so access ends immediately; `deletion.cleanupLibrary` then removes rows and
  files in bounded batches.
- A rating validates the displayed review-unit version and current eligibility
  (locks, archive, due time, the account-wide Frontier cap in the account
  timezone), runs FSRS at server time, and writes the schedule, the review log,
  and prerequisite lock changes in one mutation. Undo restores the exact saved
  pre-review state only while that review is still the unit's latest.
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

Run from the repository root:

```bash
# Configure (first time) and watch the Convex dev deployment. Writes
# packages/backend/.env.local with CONVEX_DEPLOYMENT and the deployment URLs.
pnpm --filter @armin/backend dev

# Regenerate convex/_generated without watching (commit the result).
pnpm --filter @armin/backend codegen

pnpm --filter @armin/backend typecheck
```

`convex dev` pushes code on save. Add `--typecheck disable` if you want pushes
to continue while the TypeScript project is temporarily broken, and
`--tail-logs always` to stream function logs.

### Deployment environment variables

Set these on the Convex deployment with `npx convex env set <NAME> <value>` from
`packages/backend` (values are never stored in the repository):

| Name | Purpose |
| --- | --- |
| `BETTER_AUTH_SECRET` | Session signing secret. Generate with `openssl rand -base64 32`. |
| `SITE_URL` | Public web origin, `http://localhost:3000` in development. Used for auth callbacks and email links. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth web client. Register `${SITE_URL}/api/auth/callback/google` as a redirect URI. |
| `RESEND_API_KEY` | Resend key for verification and password-reset email. |
| `EMAIL_FROM` | Optional. Defaults to `Armin <onboarding@resend.dev>`, which Resend only delivers to the Resend account's own address. |
| `MOBILE_TRUSTED_ORIGINS` | Optional comma-separated origins for the Expo app. Defaults to `armin://`. The development deployment adds `exp://,exp://**` for Expo Go; never use `exp://` wildcards in production. |

### QA without an inbox

Real verification and reset links are only delivered to the Resend account's
address while the sender is `onboarding@resend.dev`. For other QA addresses,
Resend rejects the send, but the Resend component still stores the message in
the development deployment. An operator with CLI access to that deployment can
read the link from the component's `emails` and `content` tables
(`npx convex data --component resend ...`) and open it in the browser. This is
the same link the email carries; there is no verification bypass in the app.
Treat these links as secrets and use dedicated QA accounts.
