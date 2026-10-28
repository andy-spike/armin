# Convex components for server-side Anki import

Researched 2026-10-28 against the official catalog, component repositories, platform docs, and this checkout. This is a recommendation, not an implemented architecture or performance result.

## Recommendation

Add **Workflow** for durable orchestration and **Rate Limiter** for admission control. Use native Convex File Storage, Node actions, and existing import validation/batch mutations. Do not install separate Workpool, Action Retrier, Batch Worker, R2, or a generic upload component for the first implementation.

The existing app registers Better Auth and Resend in `packages/backend/convex/convex.config.ts`. Neither is an importer orchestration API. Resend's transitive internal components should not be repurposed as the application's import queue.

## Catalog comparison

| Candidate                                                      | Relevant capability                                                                                 | Decision for Armin                                                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [Workflow](https://www.convex.dev/components/workflow)         | Durable sequential/parallel steps, event waiting, configurable action retries, status, cancellation | Add: the importer has a prepare-preview-confirm-save lifecycle                                   |
| [Workpool](https://www.convex.dev/components/workpool)         | Background queue with bounded parallelism and retries                                               | No separate installation: Workflow already uses a Workpool internally; configure its parallelism |
| [Action Retrier](https://www.convex.dev/components/retrier)    | Retry individual idempotent actions with backoff                                                    | Redundant with Workflow action-step retries                                                      |
| [Batch Worker](https://www.convex.dev/components/batch-worker) | Self-recovering drain loop over an application-owned work table                                     | Not necessary for a finite ordered import; retain bounded batch mutations within Workflow        |
| [Rate Limiter](https://www.convex.dev/components/rate-limiter) | Transactional token-bucket/fixed-window admission policies                                          | Add at upload/job creation and expensive reprocessing boundaries                                 |
| [Cloudflare R2](https://github.com/convex/r2)                  | External object storage integrated with Convex                                                      | Defer: adds storage credentials and configuration without solving parsing memory                 |
| Native File Storage                                            | Generated direct upload URLs and server-side file storage                                           | Use initially for source archives and staged artifacts                                           |

Workpool's source describes overhead per pool and recommends avoiding excessive pools. It is not a reason to introduce another independent queue beside Workflow's existing queue. [Workpool README](https://github.com/get-convex/workpool)

Batch Worker processes work via mutations; external IO requires dispatching actions or a Workpool anyway. It would make us implement the state machine that Workflow already provides. [Batch Worker catalog](https://www.convex.dev/components/batch-worker)

Rate limits govern how frequently someone starts expensive work. They do not replace storage, card-count, archive-expansion, active-job, or library quota checks. Those remain explicit application invariants. Start conservatively with one active import per library and low global workflow step parallelism; choose numeric rates from expected usage rather than inventing them here. [Rate Limiter catalog](https://www.convex.dev/components/rate-limiter)

## Proposed application contract

Create an authenticated job before upload, storing its library owner, source metadata, expiry, and generation. Attach the uploaded storage ID only through an owner-checked mutation, verify actual stored metadata, and prevent duplicate attachment or reuse. Internal actions derive the destination from this job, never a caller-supplied library ID. Persisted ownership is necessary because background execution must outlive the browser session.

Keep application job state in the app's tables: uploading, preparing, awaiting confirmation, importing, cancelling, completed, failed, expired. Store user-facing progress, warnings, preview summary, file references, workflow IDs, selected decks, and progress mode there. Return an owner-filtered reactive query to the client, not unrestricted component status or raw file URLs.

Use one preparation workflow and one import workflow. Preparation writes bounded staged artifacts and ends at a persisted preview. Confirmation atomically validates ownership, expiry, selected options, and job generation, then starts the import workflow once. This avoids leaving workflow code suspended across a potentially long user decision and future deployments. Workflow supports events if a single workflow is preferred, but long-lived workflow implementations must remain replay-compatible. [Workflow source](https://github.com/get-convex/workflow)

In the import workflow, process images in bounded batches, validate cards against real media IDs, then apply bounded card/history mutations and finish. Pass artifact IDs and cursors between steps. Do not journal the collection, database bytes, image bytes, or entire card arrays. The current Workflow README documents journal constraints and recommends storing large results separately. Retried action side effects must remain idempotent. Explicitly configure transient retries; malformed files and quota failures should terminate. [Workflow source](https://github.com/get-convex/workflow)

## Fit with existing code

`packages/core/anki` remains the portable converter. Move environment-specific reading into backend Node actions rather than putting Node or SQLite dependencies in core. Reuse the file-format logic under `apps/web/src/lib/anki/` after extracting a suitable shared reader boundary.

`packages/backend/convex/imports.ts` already owns validation, declared totals, request-ID batches, progress, cancellation, and deck cleanup. Extract shared internal helpers so background steps use the same rules. Do not call session-dependent public mutations while pretending the scheduled action still has a user session. Preserve image byte validation and library quotas when replacing the browser's HTTP upload path with server-side storage writes.

The existing `imports` table starts at running and tracks materialized decks; extend it or introduce a preparation job table rather than creating decks during preview. Replace the current one-hour no-progress sweep with state-aware expiry/recovery. Awaiting confirmation needs an explicit retention policy, including source/artifact deletion. Recheck quotas at confirmation and during atomic writes; a preview is not a quota reservation.

## Cancellation and cleanup

Workflow cancellation does not interrupt an already executing action. Mark the app job cancelling first; every commit must reject stale generations and terminal/cancelling jobs. Actions must check cancellation between bounded operations. Track newly stored temporary files so a late action cannot recreate orphaned artifacts after cleanup. Finish cleanup only once active work is safely fenced; retain an idempotent sweeper for stragglers. Workflow completion callbacks can schedule bounded cleanup, and completed workflow journals also require explicit cleanup. [Workflow cancellation and cleanup documentation](https://github.com/get-convex/workflow)

## Limits to validate before implementation

Node actions have 512 MB of memory and a ten-minute execution limit. Splitting work into workflow steps does not enlarge an individual action's budget. Our current package reader calls `new SQL.Database(bytes)` and the converter builds additional objects, so memory must be measured using representative large and highly compressed collections. Compatibility of sql.js/WASM and its asset bundling in Convex Node actions also needs a spike. No catalog component removes that requirement. [Actions](https://docs.convex.dev/functions/actions), [platform limits](https://docs.convex.dev/production/state/limits)

Native uploads have no documented file-size ceiling, but the upload POST times out after two minutes. Benchmark slow large uploads before promising the existing 1 GiB browser limit in this architecture. A direct upload avoids mutation argument limits; it does not guarantee acceptable upload or processing performance. [File uploads](https://docs.convex.dev/file-storage/upload-files)

Use native storage first because it is already the app's storage system. R2 is worth reconsidering if measurements show archive bandwidth cost or upload behavior warrants it; generated Convex download URLs are bearer URLs, so keep them private or use the app's authenticated access path. [File serving](https://docs.convex.dev/file-storage/serve-files), [R2 component](https://github.com/convex/r2)

## First implementation checkpoint

Before migrating the UI, prototype a Node action that reads representative basic, modern compressed, media-heavy, and large-database exports and runs the converter. Record peak memory, elapsed time, packaging compatibility, upload behavior, and output parity with the browser importer. If this fits with headroom, proceed with Workflow plus Rate Limiter and native storage. If it does not, retain Convex job ownership and orchestration while revisiting the parser execution environment.
