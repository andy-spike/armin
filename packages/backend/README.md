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
- `convex/appearance.ts` — the account's color theme choice and custom themes
  (seed colors only, validated by `@armin/core/themes`), in its own table so
  theme changes never re-run scheduling reads.
- `convex/account.ts` — viewer, idempotent library provisioning, and account
  timezone.
- `convex/decks.ts`, `flashcards.ts`, `graph.ts`, `settings.ts` — authoring,
  browse, prerequisite graph, and scheduling settings.
- `convex/review.ts` — queue, rating previews, rate, bury/unbury, card info, and undo.
- `convex/cram.ts` — practice-only cram selection and `cramLogs`; never
  schedules, locks, or writes review history.
- `convex/concepts.ts`, `conceptGeneration.ts`, `model/concepts.ts`,
  `model/generator.ts`, `model/variantAllowance.ts` — concept cards' variant
  pools, their generation job, and the monthly variant allowance (see
  [Concept cards](#concept-cards)).
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
- Images and audio are validated by their bytes (type sniffing, size), counted
  against one per-library pool shared by images and audio
  (`model/mediaQuota.ts`; `media.usage` reports the split for the account page), content-addressed,
  and only served through authenticated routes. No storage URL is ever returned
  to a client. Exports include audio unless the caller passes
  `includeAudio: false`, for a smaller file.
- Exports are assembled in the browser. `exportBuilder.build` stores a ZIP with
  only the manifest and JSON data; the manifest lists every media file with its
  SHA-256 checksum, which is its file name. The web app
  (`apps/web/src/lib/library-export.ts`) downloads that ZIP, fetches each media
  file through the authenticated `/media/*` route, checks it, and writes the
  finished ZIP (`zip-writer.ts`, ZIP64 past 4 GiB), streaming it to disk where
  the browser allows. A media file deleted mid-export fails the export rather
  than leaving the backup incomplete. No server
  function holds a library's media, so exports have no media size limit.

## Anki import

Browser import: the web client parses an Anki file, converts it with
`@armin/core/anki`, uploads images through `/upload-image`, and sends the result
to `convex/imports.ts` in batches. Every function uses the first-party session and
checks `libraryId`; imported cards have no prerequisites and are never locked.

| Function                         | Does                                                                                                                                                                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `imports.start`                  | Rejects imports over the plan limits (`QUOTA`, with counts in the message), then creates one deck per Anki deck, with any deck settings from its Anki preset. One running import per library.                                                       |
| `imports.addCards`               | Up to 100 cards and 1,500 review units per call, all-or-nothing. A unit's `schedule` replaces its new-card state and `buried` hides it until the next study day; a card's `frontierKey` keeps Anki's new-card order. Unknown `subKey`s are ignored. |
| `imports.addReviewLogs`          | Up to 1,000 past reviews per call, for cards this import created. History only: it never changes a unit's schedule.                                                                                                                                 |
| `imports.finish`                 | Needs every declared card and review to have arrived, then closes the import.                                                                                                                                                                       |
| `imports.cancel`                 | Stops the import, then deletes every deck it made in scheduled jobs, one deck per transaction. Clients call it on any failure.                                                                                                                      |
| `imports.get`, `imports.current` | Status of one import, or of the library's running import (to resume or cancel after a reload).                                                                                                                                                      |

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

## Concept cards

A concept card (`type: "concept"`, ADR 0023) holds a **template**: a brief and
one worked example, text and KaTeX only (`@armin/core/flashcard-types` rejects
image and audio references). It is created through `insertFlashcard` like every
card, so plan and deck capacity apply, and it generates one review unit with
the fixed `subKey` `concept`. Assistants and imports can't create or edit
concept cards (`validateFlashcardInput` refuses the type unless the caller opts
in), and a card can't change to or from the concept type.

- **Variant pool.** `conceptVariants` rows (library-scoped, at most 500 per
  card) hold each exercise and worked solution, a status (`active` or
  `flagged`), when a review last showed it, an origin, and a version. The
  card's `conceptPool` records the latest generation job: `generating`,
  `ready`, `failed` with a reason, or `allowanceUsed` when no job could start
  (see the allowance below). A job stuck generating for 10 minutes counts as
  failed so it can be retried.
- **Generation.** Creating a concept card schedules
  `conceptGeneration.generate`, an action that asks the generator module for a
  batch of 10 variants, avoiding the pool's recent exercises, and stores the
  valid ones with `concepts.storeVariants`. Jobs are numbered; only the card's
  latest job may store variants or fail the pool. Any failure sets `failed`
  with a reason, and `concepts.retryGeneration` starts a new job.
- **Variant allowance** (`model/variantAllowance.ts`). Generated variants count
  against the library's monthly `conceptVariantsPerMonth`, kept per UTC month
  (`usageMonth`, the assistant allowance's key) in `conceptVariantUsage` as
  `used` and `reserved`. `requestGeneration`, in the mutation that schedules a
  job, reserves the batch (up to the remaining allowance) before the action can
  call the model, and records it on the pool as `reserved`. `storeVariants`
  charges only the variants it stores and releases the rest in the same
  transaction; a failed job releases everything, as does a job superseded by
  Retry or one whose card was deleted. Convex mutations are serializable, so
  concurrent jobs in one library can't reserve past the limit. A job whose
  action dies without reporting back keeps its batch (at most 10) reserved
  until its card is retried. With nothing left, no job is scheduled and the
  pool becomes `allowanceUsed`: no Retry, and reviews keep reusing variants.
  Once the allowance has room again (a new UTC month or a larger plan), the
  pool offers Retry, and any new generation request starts normally; the
  stored status changes with the next job. `concepts.allowance` reports the
  month's usage for the account page. Self-hosted instances have no allowance
  and keep no usage rows.
- **Generator module** (`model/generator.ts`) is the only code that asks a model
  for variants. A provider turns a template plus exercises to avoid into
  candidate variants; the module validates each against the core variant schema
  and drops invalid or image-bearing ones. `selectProvider` picks one from the
  deployment variables:
  - **fake**, when `CONCEPT_GENERATOR_FAKE=true`: deterministic numbered
    exercises after a short delay, at no cost. It wins over the gateway, so a
    local deployment spends no tokens unless the fake is turned off. It can't
    run on Convex cloud or a self-hosted instance: it requires the
    deployment's own URL to be a loopback address.
  - **gateway**, when `AI_GATEWAY_API_KEY` and `AI_GATEWAY_MODEL` are both
    set: one call through [TanStack AI](https://tanstack.com/ai/latest/) and
    its Vercel AI Gateway adapter (`createVercelGatewayText(model, key)`,
    Responses API). `chat()`'s `outputSchema` asks for
    `{ variants: [{ exercise, solution }] }` as JSON schema output; each
    variant is still validated on its own. The prompt holds the brief, the
    worked example, and the exercises to avoid, and asks for text and KaTeX
    only. The OpenAI client's own retries are off: 429 and 5xx are retried
    in the action after 2, 4, and 8 seconds, everything else (401 included)
    fails at once. The pool then shows a general reason (busy, unavailable,
    or not working on this server) with Retry, and the reservation is
    released; logs record only the status code, never the provider's message
    or the key. The model call needs Node's streams (in the default runtime
    the streamed response fails to close), so `conceptGeneration.ts` is a
    `"use node"` action; TanStack AI is imported lazily, so queries and
    mutations that check availability never load it.

  With neither, generation is off: `concepts.availability` reports "Concept
  cards aren't available on this server yet.", the card editor shows the
  Concept type disabled with that reason, `flashcards.create` refuses a new
  concept card, and Retry on an existing card fails its pool with the reason
  without reserving allowance.

- **Assignment.** The unit's `variantId` names the assigned variant, and its
  front and back hold that variant's exercise and solution, so `review.items`,
  the review screens, and Undo need no separate content path. Until a variant
  is assigned, the never-reviewed unit waits on the pending schedule, by the
  same rule as a locked card's (`waitingSchedule` in `model/study.ts`), so
  review, Frontier counts, rating, and cram skip it. The first stored batch
  assigns a variant and, in the same patch, moves the unit to New unless
  prerequisites lock the card. Template edits leave the assignment alone.
- **Review.** `review.rate` writes the concept's part in its one transaction:
  it marks the shown variant seen (`lastShownAt`), assigns the next one (a
  random unseen active variant, otherwise the active variant shown longest
  ago, so review never blocks), and writes it with the new schedule and the
  version bump; a rating against the previous version is stale. Randomness
  uses `Math.random`, which Convex seeds per mutation: deterministic for one
  transaction, different between reviews. The review log's `beforeVariant`
  keeps the shown variant and its previous `lastShownAt`; `review.undo`
  restores both with the schedule, or is stale if that variant has since been
  removed or set aside. Concept units otherwise count like any unit in deck
  totals, Frontier selection, the daily cap, and Stats.

## Plans and limits

Each library has a `plan` (absent means free). `@armin/core/plans` holds the
plan limits that `model/usage.ts` (`checkCapacity`, `libraryLimits`) enforces:

| Limit                           | Free  | Pro     |
| ------------------------------- | ----- | ------- |
| Flashcards                      | 1,000 | 100,000 |
| Review units                    | 5,000 | 250,000 |
| Decks                           | 50    | 1,000   |
| Images and audio (shared pool)  | 1 GiB | 5 GiB   |
| Assistant-created cards / month | 300   | 10,000  |
| Assistant writes / hour         | 60    | 600     |
| Concept card variants / month   | 0     | 2,000   |

The monthly assistant allowance is per library and counts `save_cards`; staged
Anki imports are bounded only by the library limits. The monthly variant
allowance counts stored concept card variants (see
[Concept cards](#concept-cards)); self-hosted instances skip it. Pro is sold through
Polar (see [Billing](#billing-polar)); every limit check reads only
`libraries.plan`.

### Billing (Polar)

`convex/billing.ts` sells Pro through [Polar](https://polar.sh), the merchant
of record, with `@polar-sh/sdk` 1.x (API version `2026-10`) called directly; no
Convex component. Polar charges the card, handles tax, invoices, refunds, and
dunning, and pays out.

- **Identity.** Checkout sets Polar's `external_customer_id` to the Better Auth
  user ID, so Polar's customer state (`customers.getStateExternal`) answers
  whether a user has Pro in one call.
- **Checkout.** `billing.createCheckout({ interval })` returns a hosted
  checkout URL for the monthly or yearly product; Polar returns the buyer to
  `/settings?tab=billing&checkout=success`. That marker isn't proof of
  payment: the page requests a sync (`billing.refresh`) and announces Pro only
  once the synced plan is Pro, with Retry if Polar hasn't confirmed it after
  30 seconds. Checkout refuses when Polar already shows an active Pro
  subscription.
- **Sync job.** `POST /polar/events` verifies the signature (both Polar's
  legacy and Standard Webhooks secrets) and, for `subscription.*` and
  `customer.state_changed`, raises the user's `billing.requested`. One runner
  per user (`billing.runSync`, holding a lease) reads Polar's customer state
  and applies it with the request number it read for (`applied`), deriving
  `libraries.plan` in the same transaction, and reads again while newer
  requests arrived. The stored state therefore comes from a read that began
  after the latest webhook, whatever the order of webhooks and retries. A
  failed pass keeps the lease and retries with backoff (30 s doubling, at most
  hourly); `failures` and `lastError` on the row show why. Unknown event types
  are acknowledged and ignored.
- **Plan rule.** Pro while the subscription is in Polar's active list (active,
  trialing, or past due during payment retries), including after a
  cancellation until the paid period ends. Free afterwards; nothing is deleted.
- **Portal.** `billing.createPortalSession` opens Polar's customer portal for
  cancelling, switching monthly/yearly, cards, and invoices.
- **Account deletion** marks the user's `billing` row `deleted`, in the same
  transaction as the user removal. The job revokes every active subscription
  and retries until Polar shows none. The row is a permanent tombstone keyed by
  the Better Auth user ID, so a checkout left open and paid after deletion is
  revoked when its webhook arrives. That first charge is not refunded
  automatically; refund it from Polar if the customer asks.
- **Complimentary Pro.** An operator can give an account Pro without a
  subscription: `pnpm --filter @armin/backend exec convex run
  billing:setComplimentaryPro '{"email":"you@example.com","enabled":true}' --prod`
  (`false` removes it). The account must have signed in once. It sets
  `libraries.complimentaryPro`, which overrides the synced `plan` and is never
  changed by the Polar sync; checkout is refused while it is set.
- **Excluded.** Self-hosted instances (`SELF_HOSTED=true`) and the public
  reviewer account never see billing, and a deployment without the Polar
  variables below has billing off.

Local testing uses a Polar **sandbox** organization shared across worktrees.
Machine-local credentials are loaded by `pnpm worktree:setup`; `pnpm dev` starts
or reuses a shared Polar CLI webhook relay automatically. See
[Polar sandbox payments](../../docs/dev-worktrees.md#polar-sandbox-payments) for
one-time setup, worktree overrides, relay lifecycle, and test buyer guidance.

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
bounds: 2,000 prerequisite links per deck, 10 MiB per uploaded file, and 95 MiB
of card data in the server-built part of an export. Review
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
redirect to the slug.

Development uses a local Convex deployment per checkout, never a cloud dev
deployment. Run `pnpm dev:setup` from the repository root (with Node 20, 22, or
24; `vp env` selects the pinned 24, and local `"use node"` actions need it) to create it, push, set
`SITE_URL`, `MOBILE_TRUSTED_ORIGINS`, `BETTER_AUTH_SECRET`, and
`CONCEPT_GENERATOR_FAKE`, seed the sample account, and copy its URLs into the web and mobile `.env.local` files. Then
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

| Name                                                    | Purpose                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BETTER_AUTH_SECRET`                                    | Session signing secret. Generate with `openssl rand -base64 32`.                                                                                                                                                                                                                                 |
| `SITE_URL`                                              | Public web origin, `http://localhost:3000` in development. Used for auth callbacks and email links.                                                                                                                                                                                              |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`              | Google OAuth web client. Register `${SITE_URL}/api/auth/callback/google` as a redirect URI.                                                                                                                                                                                                      |
| `RESEND_API_KEY`                                        | Resend key for verification and password-reset email.                                                                                                                                                                                                                                            |
| `EMAIL_FROM`                                            | Optional. Defaults to `Armin <onboarding@resend.dev>`, which Resend only delivers to the Resend account's own address.                                                                                                                                                                           |
| `MOBILE_TRUSTED_ORIGINS`                                | Optional comma-separated origins for the Expo app. Defaults to `armin://`. The development deployment adds `exp://,exp://**` for Expo Go; never use `exp://` wildcards in production.                                                                                                            |
| `POLAR_ORGANIZATION_TOKEN`                              | Polar organization access token (sandbox and production tokens differ). Scopes: `checkouts:write`, `customers:read`, `customers:write`, `customer_sessions:write`, `subscriptions:read`, `subscriptions:write`. Billing is off without it.                                                       |
| `POLAR_WEBHOOK_SECRET`                                  | Signing secret of the Polar webhook endpoint (`<site>/polar/events`), or of `polar webhook listen` locally. Billing is off without it.                                                                                                                                                           |
| `POLAR_SERVER`                                          | `production` or `sandbox` (default).                                                                                                                                                                                                                                                             |
| `POLAR_PRODUCT_PRO_MONTHLY`, `POLAR_PRODUCT_PRO_YEARLY` | Polar product IDs of the monthly and yearly Pro subscriptions. Billing is off unless both are set.                                                                                                                                                                                               |
| `CONCEPT_GENERATOR_FAKE`                                | Development only. `true` makes concept card generation use the generator's deterministic fake provider. It takes effect only on a local deployment (a loopback `CONVEX_CLOUD_URL`) that isn't self-hosted; anywhere else it is ignored. It wins over the gateway variables. Local setup sets it. |
| `AI_GATEWAY_API_KEY`                                    | Vercel AI Gateway API key for concept card generation. Secret: set it only on the deployment, never in the repository or logs.                                                                                                                                                                   |
| `AI_GATEWAY_MODEL`                                      | Gateway model ID for concept card generation, in `creator/model` form (such as `openai/gpt-5-mini`). Generation uses the gateway only when this and `AI_GATEWAY_API_KEY` are both set; with neither them nor the fake, concept cards are unavailable. Not chosen yet for armincards.app (#102).  |
| `OPENAI_APPS_CHALLENGE`                                 | Optional. The exact domain-verification token from OpenAI's plugin portal, served at `/.well-known/openai-apps-challenge`. See [plugin publishing](../../plugins/PUBLISHING.md).                                                                                                                 |

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
`review.items` subscription, limited to eight units; queues return metadata
only. Navigation
uses counters plus `review.status`'s per-deck admission counts.

Activity retains 400 days, longer than the displayed 52-week window. Per-card
activity transfers history on a move and subtracts it immediately on deletion;
per-deck and library totals make reads independent of review-log volume. Undo
and imported logs use the same triggers. Changing timezone starts a new
aggregation generation and rebuilds it in bounded jobs. Stats reports `pending`
until the generation is complete. Rebuild jobs use a fixed date bound for all
pages; never recompute a paginated range's boundary between pages.

Deck counters (`deckUnitCounts`) build themselves on each deck's next write.
New libraries and timezone changes schedule their own activity rebuild.

The web app shrinks images in the browser before upload
(`apps/web/src/lib/shrink-image.ts`): the longest side is at most 1600 px,
photos become WebP at quality 80, screenshots and diagrams lossless WebP, EXIF
data is dropped, and GIF and SVG pass through unchanged. Audio becomes mono Opus
at 32 kbps in an Ogg file with silence trimmed from both ends
(`shrink-audio.ts`, using WebCodecs; browsers without an Opus `AudioEncoder`
upload the original). Files already at or below the target quality, or that
would shrink by less than 10%, upload unchanged. The library stores that one
copy, and the quota counts only it. The web app accepts files up to 25 MB before
shrinking; the server's 10 MiB per-file limit applies to what arrives.
Uploads that don't come through the browser, such as assistant imports, are
stored as sent.

The server records each image's intrinsic dimensions in a Node action using the
pinned Sharp package, externalized in `convex.json`. Images above the decoder's
16-million-pixel bound or unsupported/corrupt inputs get no dimensions. Images
are served as stored; there are no server previews. A WebP preview an older
image still has is no longer served, but its bytes stay counted and are deleted
with the image. Media files are named
by their content hash, so the media routes let the browser cache them privately
for a year. Every media route requires the session.

Local launchers place temporary files under `.convex/tmp`, on the same
filesystem as local storage, so installing external Node packages does not fail
with a cross-filesystem rename. In a deeply nested checkout, where a Unix socket
path under `.convex/tmp` would exceed the operating system's limit, they use a
short symlink in the system temp directory that points back to it. The pinned Sharp version remains distinct from
Expo's transitive version so Convex 1.47's workspace-local external dependency
lookup works with this repo's hoisted pnpm layout. Recheck that lookup when
upgrading Sharp or changing the package layout.
