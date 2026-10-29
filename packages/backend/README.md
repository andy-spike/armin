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
- `convex/mcp.ts`, `agents.ts`, `agentHttp.ts`, `agentAuthoring.ts` — the
  hosted MCP server (OAuth, tokens, and protocol through `@convex-dev/mcp`),
  app-side connection records, and atomic agent authoring. See
  [AI assistant connections](../../docs/agent-connections.md).
- `convex/account.ts` — viewer, idempotent library provisioning, account
  timezone, and the library revision (kept for clients from before live
  subscriptions; exports use the revision as a snapshot check).
- `convex/decks.ts`, `flashcards.ts`, `graph.ts`, `settings.ts` — authoring,
  browse, prerequisite graph, and scheduling settings.
- `convex/review.ts` — queue, rating previews, rate, bury/unbury, card info, and undo.
- `convex/cram.ts` — practice-only cram selection and `cramLogs`; never
  schedules, locks, or writes review history.
- `convex/stats.ts` — review activity, streaks, retention, due forecast, and
  card-state totals, all scoped to the caller's library.
- `convex/imports.ts` — batched Anki import (see below).
- `convex/media.ts`, `exports.ts`, `exportBuilder.ts` — private images and the
  ZIP export job.
- `convex/deletion.ts`, `maintenance.ts`, `crons.ts` — bounded cleanup jobs.
- `convex/functions.ts` — the `mutation` and `internalMutation` builders every
  mutation uses (lint rejects the raw ones from `_generated/server`).
- `convex/model/` — shared server logic: access checks, queue selection, lock
  propagation, limits, error codes, and the derived Browse summaries.
- `convex/model/flashcards.ts`, `decks.ts`, `prereqs.ts` — every study write
  (create, edit, archive, move, rename, link, unlink) and its cascade. The app's
  mutations, the assistant tools, and imports call these after their own
  ownership, version, and policy checks, so a cascade is fixed in one place.
- `convex/model/usage.ts` — `checkCapacity`, the one beta-limit check every
  write that adds decks or flashcards calls; `adjustReviewUnitCount` enforces
  the review-unit cap as units are written.
- `convex/model/agentWrites.ts` — `runAgentWrite`: request-ID replay and the
  hourly write limit shared by the assistant authoring and import tools.

Client entry points (see `package.json` `exports`):

- `@armin/backend/api` — generated function references. Importing it never
  bundles backend implementation code.
- `@armin/backend/types` — type-only view models for clients.

## Rules every function follows

- First-party ownership comes from the authenticated session and its library mapping
  (`model/access.ts`), never from a caller-supplied account ID. Lookups by ID
  check `libraryId` before returning or changing anything; a foreign ID behaves
  as "not found".
- External MCP calls act through a grant verified by the MCP component and
  created from a verified Armin session at consent. Every read and write
  re-reads the component grant, its resource audience, the active library, and
  the app-side connection record in the same transaction, so a revocation that
  commits first denies the operation. One approved connection can use all nine
  tools on its user's whole library; there are no per-deck, read-only, or edit
  permissions. Agent tokens never impersonate a user in first-party Convex
  functions. Account deletion invalidates grants immediately and schedules their
  bounded removal.
- Writes require a verified email and an `active` library. Account deletion
  marks the library `deleting` in the same transaction as the auth user removal,
  so access ends immediately; `deletion.cleanupLibrary` then removes rows and
  files in bounded batches.
- The account-wide Frontier cap and daily review cap (in the account timezone)
  limit which units the review queue admits. Due reviews enter oldest-first up
  to the remaining review budget; new units then get the smaller of the
  remaining new-unit allowance and the remaining total budget. `null` means no
  daily review limit. A rating validates the displayed review-unit version and
  current eligibility (locks, archive, bury, due time), but not either cap, so
  an answer to a card already admitted to a session is never discarded when a
  budget runs out mid-session. It runs FSRS at server time, and writes the
  schedule, the review log, and prerequisite lock changes in one mutation.
  Burying hides every review unit of a flashcard until the start of the next
  study day; units reappear automatically, and Undo restores the exact prior
  `buriedUntil` values. Undo restores the exact saved pre-review schedule only
  while that review is still the unit's latest. Earned prerequisite access is
  permanent and survives lapses, Undo, and authoring changes.
- Edits name the version they started from. The first accepted edit wins; a
  stale save returns a conflict and changes nothing. Creates, ratings, and
  undos take a client request ID so an application-level retry returns the
  first result instead of applying twice.
- Browse summaries (`flashcardSummaries`) and deck counters (`deckCounters`)
  are derived data, never written directly. Triggers in `model/summaries.ts`
  note each flashcard a mutation touches, and the mutation rebuilds those
  summaries before it commits; each summary change moves its deck's counters by
  the difference. Browse pages through the summary indexes with cursors, and
  deck totals read the counters, so neither reads review units.
- Clients read through live subscriptions. A query that depends on time takes
  a `now` argument that the client moves only when `review.status` says time
  alone next changes a due count (its `refreshAt`), so subscriptions re-run
  for writes and for due times, never on a fixed tick.
- Images are validated by their bytes (type sniffing, size), counted against a
  per-library quota, content-addressed, and only served through authenticated
  routes. No storage URL is ever returned to a client.

## Anki import

Browser import: the web client parses an Anki file, converts it with
`@armin/core/anki`, uploads images through `/upload-image`, and sends the result
to `convex/imports.ts` in batches. Every function uses the first-party session and
checks `libraryId`; imported cards have no prerequisites and are never locked.

| Function                         | Does                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `imports.start`                  | Rejects imports over the plan limits (`QUOTA`, with counts in the message), then creates one deck per Anki deck. One running import per library. |
| `imports.addCards`               | Up to 100 cards and 1,500 review units per call, all-or-nothing. A unit's `schedule` replaces its new-card state; unknown `subKey`s are ignored. |
| `imports.addReviewLogs`          | Up to 1,000 past reviews per call, for cards this import created. History only: it never changes a unit's schedule.                              |
| `imports.finish`                 | Needs every declared card and review to have arrived, then closes the import.                                                                    |
| `imports.cancel`                 | Stops the import, then deletes every deck it made in scheduled jobs, one deck per transaction. Clients call it on any failure.                   |
| `imports.get`, `imports.current` | Status of one import, or of the library's running import (to resume or cancel after a reload).                                                   |

Agent import: `convex/agentImports.ts` runs the staged MCP route. The assistant
downloads and runs the versioned converter kit itself; the backend never receives
the archive. Cards stay in `agentImportCards` while staging. Finalization creates
hidden `decks` (`staging: true`), writes cards in batches, and only then publishes
the decks together. `activeDeckIds`, deck queries, Browse, queues, exports, and
agent reads exclude staging decks. Uploads for one session go through
`POST /agent-imports/{importId}/media` with a scoped token from
`anki_import_start`, never an arbitrary URL. The existing 2,000-card and
10,000-review-unit caps are checked at start, per batch, and at commit.
`agentImports.sweep` expires sessions after 24 hours; `cleanupImport` releases
staging cards and import-only media tracking. See
[assistant Anki import](../../docs/anki-assistant-import.md).

Rules:

- `start` declares `totals`; `addCards` and `addReviewLogs` may not exceed them,
  and the library limits are checked again on every batch because they can change
  while a long import runs. An import carries at most 300,000 past reviews.
- Cards are created through `insertFlashcard` (`model/flashcards.ts`), the same
  chokepoint as `flashcards.create` and agent `save_cards`. A card whose imported
  schedule shows a review gets `prerequisiteAccessGranted`, like an accepted rating.
- Imported review logs store `unitVersionAfter: 0`. Review units start at version
  1, so Undo can never apply to them, and they count toward the Frontier cap like
  any log whose first review was today.
- Every call takes a client `requestId`; a retry returns the first result. A
  request ID cannot be reused for a different operation.
- A `running` import with no progress for an hour is abandoned (a closed tab).
  The `cancel abandoned imports` cron (every 15 minutes) marks it `failed` and
  removes its decks. Import records are kept for 30 days. Starting a new import
  while one is running returns `CONFLICT`; clients can read `imports.current` and
  offer to cancel it.

## Plans and limits

Each library has a `plan` (absent means free). `@armin/core/plans` holds the
plan limits that `model/usage.ts` (`checkCapacity`, `libraryLimits`) enforces:

| Limit                           | Free   | Pro     |
| ------------------------------- | ------ | ------- |
| Flashcards                      | 1,000  | 100,000 |
| Review units                    | 5,000  | 250,000 |
| Decks                           | 50     | 1,000   |
| Images                          | 50 MiB | 80 MiB  |
| Assistant-created cards / month | 300    | 10,000  |
| Assistant writes / hour         | 60     | 600     |

The monthly assistant allowance is per library and counts `save_cards`; staged
Anki imports are bounded only by the library limits. There is no payment
integration yet; set `plan` on the library row to change it.

`convex/model/limits.ts` holds the technical bounds every plan sits under, so
each query and mutation fits Convex's per-function limits (32,000 documents
scanned, 4,096 index ranges, 16 MiB read). Whole-library work never reads every
row: queues and Stats read bounded index ranges (by review state and the fixed
new-card order, `frontierKey`) plus per-deck counters (`deckUnitCounts`,
`model/deckSizes.ts`), and exports page each deck. Deck-wide work (the graph,
lock refresh, cram) reads a whole deck, so every deck holds at most 10,000
flashcards and 15,000 review units on any plan; the deck-size triggers enforce
this for every create, import, and move. A change to the library-wide
prerequisite floor refreshes locks one deck per scheduled transaction. Other
bounds: 2,000 prerequisite links per deck, 10 MiB per image, and one export ZIP
of at most 95 MiB. Review
history is unbounded and is read in pages or deleted in batches. Deletion
consequences use review-unit lifetime counts and indexed boundary logs. Moving
a card keeps its history without rewriting it; exports resolve each log to its
unit's current deck. Deleting a card removes its active study data atomically and schedules bounded
history cleanup. Deleting a deck removes the deck row atomically; Browse, queues,
exports, and card writes exclude rows whose deck is gone. Scheduled cleanup removes
its units, cards, image links, settings, and edges in bounded batches, and removes
history by deleted unit ID so moved cards retain their reviews. Quotas conservatively
include pending cleanup rows until those batches reclaim them. Graph writes compare the displayed
library revision, so another saved library change can require a graph reload.

## Development

Deck web URLs use stable, library-scoped slugs. New decks receive one through
`model/decks.ts`, including assistant-created and imported decks. Duplicate names
receive numeric suffixes; renaming preserves the URL. ID links still resolve and
redirect to the slug. After deploying this change to an existing deployment, run:

```bash
pnpm --filter @armin/backend exec convex run deckSlugs:backfill '{}'
```

The idempotent backfill processes 50 decks per transaction and schedules the next
page. Monitor scheduled functions until it completes. Until backfilled, existing
decks continue using their ID links. Add `--prod` only for the intended production
deployment as part of the normal deployment workflow.

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

When moving an existing deployment from the retired Armin OAuth server to the
MCP component, run this bounded, idempotent cleanup after pushing the new
backend:

```bash
pnpm --filter @armin/backend exec convex run agents:retireLegacyConnections '{}'
```

It pages through pre-migration connections, marks them revoked, and clears their
stored token hashes. Rows, created-content provenance, activity, and retry
records are kept. Those connections must be reconnected; component grants
created after the migration are unaffected. The hourly prune job removes the
retired OAuth tables (`agentClients`, `agentAuthorizations`,
`agentUsedRefreshTokens`) once their rows expire.

Development uses a local Convex deployment per checkout, never a cloud dev
deployment. Run `pnpm dev:setup` from the repository root (with Node 20, 22, or
24; `vp env` selects the pinned 24, and local `"use node"` actions need it) to create it, push, set
`SITE_URL`, `MOBILE_TRUSTED_ORIGINS`, and `BETTER_AUTH_SECRET`, seed the sample
account, and copy its URLs into the web and mobile `.env.local` files. Then
`pnpm dev` runs the local backend and web client together. Email and Google
secrets still need the configuration below. To copy URLs without pushing, run
`pnpm --filter @armin/backend dev:clients`. See
[local development environments](../../docs/dev-worktrees.md).

Local setup also provisions `JWKS` from this deployment's existing Better Auth
signing keys. This lets concurrent authenticated requests verify tokens without
fetching the local backend's own JWKS HTTP endpoint. The auth plugin and verifier
must use the same value. Production continues to use dynamic keys when `JWKS`
is unset; local setup never changes a cloud deployment.

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

## Performance projections and migration

`model/performance.ts` maintains text-free `unitSummaries` and rolling daily
activity in the same transaction as their source writes. Queue selection and
statistics read these compact rows. Review content is a separate authenticated
`review.items` subscription, limited to eight units; queue callers opt in to
`metadataOnly` so older clients can still request complete items. Navigation
uses counters plus `review.status`'s per-deck admission counts.

Activity retains 400 days, longer than the displayed 52-week window. Per-card
activity transfers history on a move and subtracts it immediately on deletion;
per-deck and library totals make reads independent of review-log volume. Undo
and imported logs use the same triggers. Changing timezone starts a new
aggregation generation and rebuilds it in bounded jobs. Stats reports `pending`
until the generation is complete. Rebuild jobs use a fixed date bound for all
pages; never recompute a paginated range's boundary between pages.

After deploying this change to an existing deployment, run the operator-only
migrations **on that same intended deployment**, before releasing the updated
clients:

```bash
pnpm --filter @armin/backend exec convex run performance:backfill '{"cursor":null}'
pnpm --filter @armin/backend exec convex run media:backfillVariants '{"cursor":null}'
```

The plan-limits change adds `frontierKey` to unit summaries. After deploying
it, run the idempotent backfill so existing units take their place in the
new-card order (units without a key are introduced first until then):

```bash
pnpm --filter @armin/backend exec convex run performance:backfillFrontierKeys '{"cursor":null}'
```

Deck counters (`deckUnitCounts`) build themselves on each deck's next write.

The commands above use the checkout's local deployment by default. Production
requires the normal explicit production deployment workflow. Inspect scheduled
functions for completion and confirm libraries have `statsReady: true` before
calling the migration complete. Both backfills can be rerun after interruption;
log generation markers prevent double counting. New libraries and timezone
changes schedule their own activity rebuild.

Private images optionally get a WebP preview bounded to 1280×1280, plus intrinsic
dimensions. Zoom and exports always retain originals. Preview processing runs in
a Node action using the pinned Sharp package, externalized in `convex.json`.
Animated images keep their original display behavior. Images above the decoder's
16-million-pixel bound or unsupported/corrupt inputs fall back to the original.
Previews are retained only when smaller than the original and within the media
quota; their bytes count toward that quota and their blobs follow the original's
cleanup lifecycle. Both original and preview routes require the session.

Local launchers place temporary files under `.convex/tmp`, on the same
filesystem as local storage, so installing external Node packages does not fail
with a cross-filesystem rename. The pinned Sharp version remains distinct from
Expo's transitive version so Convex 1.47's workspace-local external dependency
lookup works with this repo's hoisted pnpm layout. Recheck that lookup when
upgrading Sharp or changing the package layout.
