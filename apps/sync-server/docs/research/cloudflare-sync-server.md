# Cloudflare options for Armin's sync server

Researched on 2026-10-12 against Cloudflare's official documentation. This is a proposal, not an architectural decision or an implemented server.

## Fit with Armin

The [context map](../../../../CONTEXT-MAP.md) defines Sync as an optional paid service that synchronizes Profile records between devices. Study rules remain in the clients. The service can access record contents. The existing [server README](../../README.md) describes the proposed stack; no server is implemented. The old monorepo ADR mentions `packages/sync-contract`, but that directory does not currently exist.

The agreed direction is a TypeScript Worker for sync requests, D1 for Accounts, current records, record versions, and a change log, and private R2 storage for Flashcard media. Clients keep their local databases and work offline. This replaces the earlier whole-Profile snapshot proposal. The first deliverable is a tested server for a small beta, including review progress; client integration follows separately. Authentication and protocol details remain open. Follow [the implementation scope](../implementation-scope.md) for decisions from the design interview.

## Products and responsibilities

| Product                | Proposed responsibility                                                                               | When to add it                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Workers                | Authenticate requests, enforce subscriptions and quotas, authorize object access, expose the protocol | First scaffold                      |
| D1                     | Accounts, devices, subscriptions, current records, record versions, change log, mutation IDs          | First storage slice                 |
| R2 Standard            | Flashcard media                                                                                       | First storage slice                 |
| SQLite Durable Objects | Per-account coordination and live device notifications                                                | When a concrete protocol needs them |
| Queues                 | Retention cleanup and other retryable background jobs                                                 | After those jobs exist              |
| Workers KV             | Cache data that tolerates stale reads                                                                 | No current need                     |

Workers can access these services through configured bindings. Binding declarations and per-environment configuration belong in Wrangler configuration. [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).

R2's direct binding and S3 operations have strong read-after-write consistency. Concurrent overwrites of one object key use the last completed writer, so strong consistency alone does not protect an older device from overwriting a newer media object. Cached public-domain access can return stale objects. Keep media private and use immutable object keys. [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/).

The Worker can initially stream uploads and downloads through its R2 binding and enforce create-only writes to media objects. For larger payloads, it can issue short-lived presigned PUT and GET URLs after authorizing a specific object. Presigned URLs are reusable until expiration, so an upload URL is not a one-time commit token. Direct uploads should target staging objects, with the server finalizing a separate immutable object before accepting a record that references it. Browser clients also require bucket CORS configuration. [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).

## D1 versus per-account Durable Objects

D1 is a good first fit for ordinary account, record, and change-log queries. Each database processes queries one at a time; indexes matter for both performance and rows-read billing. A paid D1 database has a 10 GB maximum and a free database has a 500 MB maximum. Store structured records in D1 and media files in R2 rather than database BLOB columns. [D1 FAQ](https://developers.cloudflare.com/d1/reference/faq/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

A SQLite Durable Object per account is an alternative when requests need coordinated account-specific state or persistent WebSocket connections. It provides strongly consistent storage and a named instance that different devices can reach. It could store current records and sync state, while clients continue to apply study rules. Separate objects scale across accounts; one account's object is single-threaded. [Durable Objects overview](https://developers.cloudflare.com/durable-objects/), [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/).

SQLite-backed Durable Objects are available on Workers Free today. Advice that all Durable Objects require a paid plan is outdated. They add separate request, duration, and storage billing, so I would defer them until coordination or live notifications justify the extra component. [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

KV is unsuitable for the authoritative record versions or authoritative subscription state. Reads are eventually consistent and changes can take 60 seconds or more to appear elsewhere. It also has a one-write-per-second limit on a given key. [How KV works](https://developers.cloudflare.com/kv/concepts/how-kv-works/), [KV writes](https://developers.cloudflare.com/kv/api/write-key-value-pairs/).

## Suggested record sync protocol

This is an application design proposal, not a Cloudflare-provided sync feature:

1. A client saves a local edit and its pending change in one local transaction. Each change has a unique mutation ID and the record version it was based on.
2. The authenticated Worker checks Account and Profile ownership and accepts changes only when their base record versions match. Repeated mutation IDs return the previous result without applying the edit twice.
3. The server saves the current record, its new version, mutation result, and a change-log entry together. Accepted changes receive server sequence numbers.
4. Clients download changes after their saved sync position. They apply each batch and save the new position together locally, while preserving pending edits to records that conflict.
5. A new device downloads a consistent set of current records and its corresponding sync position before downloading later changes.

D1 supports transactional statement batches. Conditional updates protect record versions, and the mutation result must agree with the saved record and change-log entry. A version mismatch that changes zero rows is not a SQL error; transaction logic must handle it explicitly. [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/), [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/).

Changes to different Flashcards can sync independently. Competing edits to the same record produce a conflict. Preserve the pending local edit for user resolution rather than silently overwriting it. Related record edits need atomic groups where required, and prerequisite links must retain the graph's invariants.

Retain deletion records so offline devices learn about deleted data. The beta retains change-log entries and deletion records. Expiring entries and resetting older sync positions are deferred. Use server sequence numbers, not device clocks, to track downloaded changes.

The first release includes Flashcard content and review progress for one synced Profile per Account. Clients apply study rules and calculate schedules. The server keeps the first accepted schedule and rejects conflicting review updates; clients preserve their pending reviews for later resolution. Review identity, progress representation, and undo behavior still need to be settled.

Upload media before accepting records that reference it. R2 and D1 do not share a transaction, so retry failed uploads and clean up abandoned objects without deleting media still referenced by records or pending uploads.

Clients can sync at startup, when connectivity returns, and shortly after local edits. Periodic pulls while the app is active can discover changes made by other devices. The first version does not need WebSockets, Durable Objects, Queues, or a general-purpose automatic merge system.

## Authentication and data access

Use Better Auth with D1 for Google sign-in and sessions, running alongside sync routes in the Worker. This replaces the earlier managed-provider/JWT-verification proposal. Use Better Auth's session lookup to establish identity and authorize every record and media request. The proposed server uses native D1 support and normal cookie sessions, with local session fixtures for integration tests. Native client login integration follows separately. [Better Auth D1 support](https://better-auth.com/blog/1-5), [session management](https://better-auth.com/docs/concepts/session-management), [test utilities](https://better-auth.com/docs/plugins/test-utils).

Registration is open to Google users. The first beta has no allowlist, invitations, or billing. All Profile settings synchronize, including keyboard shortcuts and per-Deck study overrides.

Use HTTPS for client requests and keep the R2 bucket private. R2 and D1 automatically encrypt stored data with keys managed by Cloudflare. This protects stored data while allowing the service to access its contents. [R2 data security](https://developers.cloudflare.com/r2/reference/data-security/), [D1 data security](https://developers.cloudflare.com/d1/reference/data-security/).

Clients do not need a separate Profile encryption key, device key transfer, or encryption recovery secret. A new device can download its current Profile records after Account authentication. Account recovery follows the chosen authentication provider. Authorize each sync and media request against its owning Account and Profile, and keep record contents out of logs.

## Minimal scaffold

Add a private `apps/sync-server/package.json` with Wrangler, TypeScript, and workspace scripts for `dev`, `deploy`, `typecheck`, `lint`, `test`, binding type generation, and local/remote D1 migration application. Add `wrangler.jsonc`, a Worker entry point, a health route, auth adapter, separate development and production resources, and a README with pnpm commands. Create `packages/sync-contract` when there are real shared request/response schemas, without importing client code.

Use `wrangler types` for runtime and binding types tied to the compatibility configuration. [Workers TypeScript](https://developers.cloudflare.com/workers/languages/typescript/).

Local `wrangler dev` runs Workers and local storage; local secrets belong in an ignored `.dev.vars`. Apply D1 migrations locally before applying them remotely. [Local development](https://developers.cloudflare.com/workers/local-development/), [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/).

Current testing documentation recommends the Workers Vitest integration for unit tests and `createTestHarness()` for integration tests. The current Durable Objects example uses `@cloudflare/vitest-plugin`; do not copy old package/version instructions without checking. Test Account and Profile isolation, change round-trips, duplicate mutation retries, conflicting edits, deletion propagation, sync pagination, bootstrap consistency, and atomic record/change-log writes. [Workers testing](https://developers.cloudflare.com/workers/testing/), [Durable Objects testing](https://developers.cloudflare.com/durable-objects/examples/testing-with-durable-objects/).

## Cost and limits to plan around

Workers Free includes 100,000 requests daily and 10 ms CPU per request. Workers Paid starts at $5 monthly and includes 10 million requests and 30 million CPU milliseconds. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

D1 Free includes 5 million rows read and 100,000 rows written daily, and 5 GB total storage across databases. Paid includes 25 billion monthly row reads, 50 million row writes, and 5 GB storage; additional storage is $0.75 per GB-month. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

R2 Standard includes 10 GB-month storage, 1 million Class A operations, and 10 million Class B operations monthly. Beyond that, storage is $0.015 per GB-month, writes/list operations are $4.50 per million, and reads are $0.36 per million. Internet egress is free. Media size and retention determine R2 storage usage; estimate these before setting subscription quotas. [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

Queues is appropriate for retryable cleanup later, but delivery is at least once. Consumers must tolerate duplicates; the database change log should remain authoritative. [Queues delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/).
