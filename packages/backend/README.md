# @armin/backend

The Convex backend for Armin: the account-scoped study database, Better Auth, server-owned FSRS scheduling, private image storage, and library export. `apps/web` and `apps/mobile` call the same functions through the generated API.

## What lives where

- `convex/schema.ts`: tables. Every study row carries `libraryId`; each Better Auth user has one library.
- `convex/auth.ts`, `auth.config.ts`, `http.ts`: Better Auth with the Convex adapter, Resend email, Google sign-in, and the authenticated `/media/*`, `/export/*`, and raw-byte image upload routes.
- `convex/mcp.ts`, `agents.ts`, `agentHttp.ts`, `agentAuthoring.ts`: the hosted MCP server (OAuth, tokens, and protocol through `@convex-dev/mcp`), connection records, and atomic agent authoring.
- `convex/decks.ts`, `flashcards.ts`, `graph.ts`, `settings.ts`: authoring, browse, prerequisite graph, scheduling settings.
- `convex/review.ts`, `cram.ts`, `stats.ts`: queue, rating, undo, practice-only cram (never schedules or writes history), and statistics.
- `convex/concepts.ts`, `conceptGeneration.ts`: concept cards (see [Concept cards](#concept-cards)).
- `convex/imports.ts`, `agentImports.ts`: Anki import (see [Anki import](#anki-import)).
- `convex/media.ts`, `exports.ts`, `exportBuilder.ts`: private images and the ZIP export job.
- `convex/billing.ts`: Polar billing (see [Billing](#billing-polar)).
- `convex/deletion.ts`, `maintenance.ts`, `crons.ts`: bounded cleanup jobs.
- `convex/functions.ts`: the `mutation` and `internalMutation` builders every mutation uses. Lint rejects the raw ones from `_generated/server`.
- `convex/model/`: shared server logic. `flashcards.ts`, `decks.ts`, and `prereqs.ts` hold every study write and its cascade; `usage.ts` holds the plan-limit checks; `agentWrites.ts` holds request-ID replay and assistant rate limits.

Clients import only `@armin/backend/api` (generated function references, no backend code) and `@armin/backend/types` (type-only view models).

## Rules every function follows

- **Ownership.** First-party ownership comes from the authenticated session and its library (`model/access.ts`), never from a caller-supplied account ID. A foreign ID behaves as "not found".
- **MCP access.** Assistants act through a grant the MCP component verifies and Armin creates at consent. Every call re-checks the grant, audience, scopes, active library, and connection in one transaction, so a revocation denies the next operation. Tools are grouped into `armin:read`, `armin:write`, `armin:import`, and `armin:study`; there are no per-deck permissions. Agent tokens never impersonate a user in first-party functions.
- **Writes** need a verified email and an `active` library. Account deletion marks the library `deleting` in the same transaction as the user removal; `deletion.cleanupLibrary` then removes rows and files in bounded batches.
- **Daily caps.** The Frontier cap and daily review cap (in the account timezone) limit which units the queue admits; `null` means no review limit. Rating checks the unit's version and eligibility but not the caps, so an answer to an admitted card is never discarded.
- **Rating** runs FSRS at server time and writes the schedule, review log, and lock changes in one mutation. Earned prerequisite access is permanent and survives lapses, Undo, and authoring changes.
- **Versions and retries.** Edits name the version they started from; the first accepted edit wins and a stale save returns a conflict. Creates, ratings, and undos take a client request ID, so a retry returns the first result.
- **Derived data.** `flashcardSummaries` and `deckCounters` are never written directly. Triggers in `model/summaries.ts` rebuild them before the mutation commits, so Browse and deck totals never read review units.
- **Live queries.** A time-dependent query takes a `now` argument that the client moves only when `review.status` reports a due count changing (`refreshAt`), so queries never re-run on a fixed tick.
- **Media.** Images and audio are validated by bytes, counted against one per-library pool (`media.usage` reports the split), content-addressed, and served only through authenticated routes. No storage URL reaches a client.
- **Export.** `exportBuilder.build` stores a ZIP with the manifest and JSON data. The manifest lists each media file by SHA-256. The web app (`apps/web/src/lib/library-export.ts`) fetches each file through `/media/*`, verifies it, and writes the final ZIP (ZIP64 past 4 GiB). A media file deleted mid-export fails the export. A watchdog fails a build that stops without reporting, and it can be restarted.

## Anki import

**Browser import.** The web client parses the file, converts it with `@armin/core/anki`, uploads images through `/upload-image`, and sends the result to `convex/imports.ts` in batches. Imported cards have no prerequisites and are never locked.

- `imports.start` rejects imports over plan limits (`QUOTA`) and creates one deck per deck part with its Anki preset settings. One running import per library; a second returns `CONFLICT`.
- `imports.addCards` takes up to 100 cards and 1,500 review units per call, all-or-nothing.
- `imports.addReviewLogs` takes up to 1,000 past reviews per call. History only; it never changes a schedule. An import carries at most 300,000 reviews; the converter keeps the newest.
- `imports.finish` closes the import once every declared card and review has arrived. `imports.cancel` deletes its decks; clients call it on any failure.
- Every call takes a `requestId`; a retry returns the first result.
- Imported review logs can't be undone. A `running` import with no progress for an hour is marked `failed` and its decks removed by a cron. Import records are kept for 30 days.

**Agent import.** `convex/agentImports.ts` runs the staged MCP route. The assistant downloads and runs the converter kit itself; the backend never receives the archive. Cards stay in `agentImportCards` while staging, then finalization writes them into hidden decks (`staging: true`) and publishes the decks together. Uploads go through `POST /agent-imports/{importId}/media` with a scoped token from `anki_import_start`. Plan limits are checked at start, per batch, and at commit. Sessions expire after 24 hours.

## Concept cards

A concept card (`type: "concept"`) holds a **template**: a brief and one worked example, text and KaTeX only. It has one review unit, and the model writes exercise variants from the template. Assistants and imports can't create or edit concept cards, and a card can't change to or from the concept type.

- **Variants.** `conceptVariants` rows (at most 500 per card) hold each exercise and solution, with a status (`active` or `flagged`). The card's `conceptPool` records the latest generation job: `generating`, `ready`, `failed` with a reason, or `allowanceUsed`.
- **Generation.** Creating a card schedules `conceptGeneration.generate`, which asks `model/generator.ts` for 10 variants and stores the valid ones. Only the card's latest job may store variants. A watchdog fails a job that doesn't finish within 10 minutes. `concepts.retryGeneration` starts a new job.
- **Allowance.** Stored variants count against the plan's monthly `conceptVariantsPerMonth` (per UTC month, in `conceptVariantUsage`). A job reserves its batch before calling the model and releases what it doesn't store. With nothing left, the pool becomes `allowanceUsed` and reviews keep reusing variants. Self-hosted instances have no allowance.
- **Providers.** `selectProvider` picks one from deployment variables. `CONCEPT_GENERATOR_FAKE=true` uses deterministic exercises and works only on a local deployment. Otherwise, when `AI_GATEWAY_API_KEY` and `AI_GATEWAY_MODEL` are both set, it calls the model through the Vercel AI Gateway (TanStack AI). The action retries 429 and 5xx after 2, 4, and 8 seconds; any other failure fails at once. Logs record only the status code. With neither provider, generation is off, `concepts.availability` says so, and the editor disables the Concept type.
- **Review.** `review.rate` marks the shown variant seen and assigns the next in the same transaction: a random unseen active variant, otherwise the one shown longest ago. Undo restores the schedule and the previous variant, unless that variant was since deleted or flagged.
- **Curation.** Learners can edit, delete, flag, and unflag variants (`concepts.editVariant`, `deleteVariant`, `unflagVariant`, `flagShownVariant`). Deleting or flagging the only active variant is refused with `CONFLICT`. A change that leaves fewer than 3 unseen variants triggers a refill.
- **Pro only.** Creating, editing, and generating concept cards need Pro (`QUOTA` otherwise); complimentary Pro and self-hosted instances qualify. A library that leaves Pro keeps its concept cards, but they are withheld from queues, due counts, and cram until Pro returns. Delete, archive, move, and prerequisite links stay available.
- **Cram and export.** Cram shows a random recent active variant without writing concept state. Exports carry the template in `data/flashcards.json` and every variant in `data/concept-variants.json`.

## Plans and limits

Each library has a `plan` (absent means free). `@armin/core/plans` holds the limits that `model/usage.ts` enforces:

| Limit                           | Free  | Pro     |
| ------------------------------- | ----- | ------- |
| Flashcards                      | 1,000 | 100,000 |
| Review units                    | 5,000 | 250,000 |
| Decks                           | 50    | 1,000   |
| Images and audio (shared pool)  | 1 GiB | 5 GiB   |
| Assistant-created cards / month | 300   | 10,000  |
| Assistant writes / hour         | 60    | 600     |
| Assistant reads / hour          | 2,000 | 6,000   |
| Concept card variants / month   | 0     | 2,000   |

The monthly assistant allowance counts `save_cards`; staged Anki imports are bounded only by the library limits.

Every deck holds at most 10,000 flashcards and 15,000 review units on any plan, because deck-wide work (graph, lock refresh, cram) reads a whole deck. The converter splits an oversized Anki deck into parts. Other bounds: 100 tags of 200 characters per flashcard, 2,000 prerequisite links per deck, and 10 MiB per uploaded file. These keep every function inside Convex's per-function limits.

Deleting a deck or card removes it atomically and schedules cleanup of its units, links, and history in batches. Quotas count pending cleanup rows until those batches finish.

### Billing (Polar)

`convex/billing.ts` sells Pro through [Polar](https://polar.sh), the merchant of record, using `@polar-sh/sdk` directly. Polar handles payment, tax, invoices, refunds, and payouts.

- **Identity.** Checkout sets Polar's `external_customer_id` to the Better Auth user ID.
- **Checkout.** `billing.createCheckout({ interval })` returns a hosted checkout URL. The return page isn't proof of payment: it requests a sync (`billing.refresh`) and announces Pro only once the synced plan is Pro. Checkout refuses when Polar already shows an active Pro subscription.
- **Sync.** `POST /polar/events` verifies the signature and, for `subscription.*` and `customer.state_changed`, queues a sync that reads Polar's customer state and derives `libraries.plan`. Failed syncs retry with backoff; `failures` and `lastError` on the `billing` row show why.
- **Plan rule.** Pro while the subscription is active, trialing, or past due during payment retries, including after cancellation until the paid period ends. Free afterwards; nothing is deleted.
- **Portal.** `billing.createPortalSession` opens Polar's customer portal.
- **Account deletion** revokes every active subscription and leaves a tombstone, so a checkout paid after deletion is revoked when its webhook arrives. That first charge isn't refunded automatically; refund it from Polar on request.
- **Complimentary Pro.** An operator can give a signed-in account Pro without a subscription. `enabled: false` removes it. It overrides the synced plan and blocks checkout.

  ```bash
  pnpm --filter @armin/backend exec convex run billing:setComplimentaryPro '{"email":"you@example.com","enabled":true}' --prod
  ```

- **Excluded.** Self-hosted instances and the public reviewer account never see billing. A deployment without the Polar variables below has billing off.

Local testing uses a Polar **sandbox** organization shared across worktrees. See the `setting-up-worktrees` skill.

## Development

Development uses a local Convex deployment per checkout, never a cloud dev deployment. From the repository root, run `pnpm dev:setup` (Node 20, 22, or 24; `vp env` selects the pinned 24, which local `"use node"` actions need). It creates the deployment, pushes, sets `SITE_URL`, `MOBILE_TRUSTED_ORIGINS`, `BETTER_AUTH_SECRET`, `JWKS`, and `CONCEPT_GENERATOR_FAKE`, seeds the sample account, and copies the URLs into the web and mobile `.env.local` files. Then `pnpm dev` runs the backend and web client together. Email and Google secrets still need the configuration below. See the `setting-up-worktrees` skill.

`JWKS` comes from the deployment's existing Better Auth signing keys, so concurrent authenticated requests don't fetch the backend's own JWKS endpoint. Production uses dynamic keys when `JWKS` is unset.

```bash
pnpm --filter @armin/backend dev           # run this checkout's backend, push on save
pnpm --filter @armin/backend dev:clients   # copy URLs to .env.local without pushing
pnpm --filter @armin/backend codegen       # regenerate convex/_generated (commit the result)
pnpm typecheck                             # type check every workspace
```

`convex dev` accepts `--typecheck disable` to keep pushing while TypeScript is broken, and `--tail-logs always` to stream function logs.

Deck web URLs use stable, library-scoped slugs, set through `model/decks.ts`. Duplicate names get numeric suffixes, renaming keeps the URL, and ID links redirect to the slug.

### Deployment environment variables

Set these on the Convex deployment with `npx convex env set <NAME> <value>` from `packages/backend`. Values never go in the repository. For the local deployment, keep `pnpm dev` running while you set them.

| Name                                                    | Purpose                                                                                                                                                                                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                                    | Session signing secret. Generate with `openssl rand -base64 32`.                                                                                                                                                                    |
| `SITE_URL`                                              | Public web origin, `http://localhost:3000` in development. Used for auth callbacks and email links.                                                                                                                                 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`              | Google OAuth web client. Register `${SITE_URL}/api/auth/callback/google` as a redirect URI. Without both, the app hides Google sign-in.                                                                                             |
| `RESEND_API_KEY`                                        | Resend key for verification and password-reset email. Without it, sign-up and password reset are disabled; verified accounts can still sign in.                                                                                     |
| `EMAIL_FROM`                                            | Optional. Defaults to `Armin <onboarding@resend.dev>`, which Resend delivers only to the Resend account's own address.                                                                                                              |
| `MOBILE_TRUSTED_ORIGINS`                                | Optional comma-separated origins for the Expo app. Defaults to `armin://`. Development adds `exp://,exp://**` for Expo Go; never use `exp://` wildcards in production.                                                              |
| `POLAR_ORGANIZATION_TOKEN`                              | Polar organization access token (sandbox and production differ). Scopes: `checkouts:write`, `customers:read`, `customers:write`, `customer_sessions:write`, `subscriptions:read`, `subscriptions:write`. Billing is off without it. |
| `POLAR_WEBHOOK_SECRET`                                  | Signing secret of the Polar webhook endpoint (`<site>/polar/events`), or of `polar webhook listen` locally. Billing is off without it.                                                                                              |
| `POLAR_SERVER`                                          | `production` or `sandbox` (default).                                                                                                                                                                                                |
| `POLAR_PRODUCT_PRO_MONTHLY`, `POLAR_PRODUCT_PRO_YEARLY` | Polar product IDs of the Pro subscriptions. Billing is off unless both are set.                                                                                                                                                     |
| `CONCEPT_GENERATOR_FAKE`                                | Development only. `true` uses the deterministic fake generator; ignored unless the deployment is local and not self-hosted. Local setup sets it.                                                                                    |
| `AI_GATEWAY_API_KEY`                                    | Vercel AI Gateway key for concept generation. Secret.                                                                                                                                                                               |
| `AI_GATEWAY_MODEL`                                      | Gateway model ID in `creator/model` form. Generation needs this and `AI_GATEWAY_API_KEY`. armincards.app uses `anthropic/claude-haiku-5.5`.                                                                                         |
| `OPENAI_APPS_CHALLENGE`                                 | Optional. The domain-verification token from OpenAI's plugin portal, served at `/.well-known/openai-apps-challenge`. See [plugin publishing](../../plugins/PUBLISHING.md).                                                          |

### Public reviewer account

The disposable public login is `reviewer@armincards.app` / `ArminDemo123!`. Its data is shared and visible to everyone, so it must not hold private material. The account must already exist, be verified, and have a provisioned library.

Set `REVIEWER_ACCOUNT_USER_ID` to its Better Auth user ID to enable its protection and reset; unset disables both. `REVIEWER_RESET_HOURS` optionally sets the interval, 1 to 168 (default 6). The job checks every five minutes, so timing is approximate. Sessions and OAuth authorizations survive a reset.

After deploying from `master`, set the variable on production as described in the `deploying-to-cloudflare` skill, then run the reset and watch the scheduled functions until it finishes:

```bash
pnpm --filter @armin/backend exec convex env set REVIEWER_ACCOUNT_USER_ID <verified-user-id> --prod
pnpm --filter @armin/backend exec convex run reviewer:reset '{"force":true}' --prod
```

The reset checks that the configured user has the reviewer email before erasing data. Never point it at a real user.

### QA without an inbox

While the sender is `onboarding@resend.dev`, Resend delivers links only to the Resend account's address. The Resend component still stores each message in the local deployment. Read the link from its `emails` and `content` tables (`npx convex data --component resend ...`) and open it in the browser. Treat these links as secrets and use dedicated QA accounts.

## Performance

`model/performance.ts` maintains text-free `unitSummaries` and rolling daily activity (400 days) in the same transaction as their source writes. Queues and Stats read these compact rows; review content is a separate `review.items` subscription limited to eight units. Changing timezone starts a new aggregation generation, rebuilt in bounded jobs, and Stats reports `pending` until it completes. Rebuild jobs use one fixed date bound for all pages; never recompute a paginated range's boundary between pages.

### Media shrinking

The web app shrinks images in the browser before upload (`apps/web/src/lib/shrink-image.ts`): longest side at most 1600 px, photos as WebP at quality 80, screenshots and diagrams as lossless WebP, EXIF dropped, GIF and SVG unchanged. Audio becomes mono 32 kbps Opus in Ogg with silence trimmed (`shrink-audio.ts`; browsers without an Opus encoder upload the original). Files that would shrink by less than 10% upload unchanged. The web app accepts files up to 25 MB before shrinking; the server's 10 MiB limit applies to what arrives. Uploads that bypass the browser, such as assistant imports, are stored as sent.

A Node action records each image's dimensions with the pinned Sharp package, externalized in `convex.json`. Images above 16 million pixels, or unsupported or corrupt, get none. Images are served as stored, with private browser caching for a year.

Keep the pinned Sharp version distinct from Expo's transitive version, so Convex's workspace-local external dependency lookup works with this repo's hoisted pnpm layout. Recheck that lookup when upgrading Sharp or changing the package layout.
