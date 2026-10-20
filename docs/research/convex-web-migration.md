> Historical document. The desktop app and old sync service were retired on
> 2026-10-20. Paths below describe the repository at the time of writing;
> consult README.md for the current web and mobile workspace layout.

# Armin web migration with Convex

Researched on 2026-10-19 against the current checkout and primary documentation. This is a planning note. No application code, dependencies, cloud resources, or credentials were changed. Recommendations and inferred implementation approaches are marked as such; runtime compatibility has not been demonstrated.

## Confirmed product constraints

The user selected TanStack Start, Better Auth, and Convex. The web app launches first, with Expo mobile compatibility checked throughout. Both clients require a connection and an account. The backend owns study operations and saved state. Each account owns one library with multiple decks and an explicit account timezone, initially detected at signup.

Launch includes deck/card management, existing card types, tags and browsing, prerequisite graph editing, scheduled reviews with undo, study settings, images, and a portable ZIP export containing structured data, schedules, review history, settings, and images. Reviews, browsing, and editing must work on phones; graph editing may require a larger screen. Google and email/password sign-in, email verification, password reset, verified account linking, and self-service deletion are required. Registration is open for a free beta. Finish with staging and a verified public production deployment.

Defer MCP, payments, Anki import, cram, profiles, user-facing restore, sharing, offline sync, and desktop-data migration. Remove Electron after web launch checks pass. The user explicitly rejects adding unit, integration, or E2E test suites now. Validate with agent-driven browser walkthroughs and recorded results, plus lint, typechecking, builds, and mobile runtime smoke checks. The launch browser target covers modern Chrome/Edge, Firefox, Safari, Android Chrome, and iPhone Safari. Walkthrough records must distinguish real browser/device coverage from emulated viewport coverage.

## What the repository already provides

- [README](../../README.md) describes the existing local-first desktop product. It will need rewriting after implementation.
- [Shared schema](../../packages/core/src/schema.ts) defines SQLite tables through Drizzle, including authored flashcards, generated review units, prerequisite edges, review logs, and settings. It is not a Convex schema.
- [Shared scheduler](../../packages/core/src/scheduler.ts) wraps `ts-fsrs`, currently version 5.4.1 in the installed package. Its types depend on the Drizzle schema and its boundary uses `Date` objects. [Card content definitions](../../packages/core/src/flashcard-types.ts) are useful portable domain code.
- [Review service](../../apps/desktop/src/main/services/review.ts) combines SQLite queries with scheduling, daily limits, logging, undo, and prerequisite changes. It derives the study day from the machine's local timezone. Rating writes the schedule and log in a SQLite transaction, then refreshes prerequisite state afterward. The Convex port must preserve the rule and improve that transaction boundary.
- [Prerequisite service](../../apps/desktop/src/main/services/prerequisite-state.ts) stores derived lock state and refreshes generated review units. These operations belong with the mutation that changes their inputs.
- [Current export](../../apps/desktop/src/main/services/export.ts) depends on Electron, SQLite snapshots, and local media paths. Reuse its portable rendering ideas, not its desktop backup format as the SaaS data model.
- [Mobile README](../../apps/mobile/README.md) documents the Expo Go starter. There are no native study workflows to preserve yet.
- [Cloudflare auth](../../apps/sync-server/src/auth.ts) is Google-only Better Auth on D1. The old sync server and [protocol package](../../packages/sync-contract/src/protocol.ts) target a different architecture. Retire them after extracting any useful validation and domain requirements.

Recommendation: separate portable content and scheduling interfaces from persistence first. Define the Convex model natively. Preserve the authored-card/generated-review-unit distinction and the existing card types rather than copying SQL tables mechanically.

## Supported integration and package boundary

Convex publishes a Better Auth component with a specific TanStack Start guide. Better Auth runs with the component adapter in Convex. Start proxies `/api/auth/*`, uses authenticated SSR helpers, and wraps the client in `ConvexBetterAuthProvider`. The documented helpers include `convexBetterAuthReactStart`, `getToken`, and authenticated query/mutation/action calls. Vite SSR needs the documented component bundling configuration. The guide currently requires Convex 1.25.0 or newer and pins Better Auth to `~1.6.15`; follow the integration's compatible versions, not an independent latest-version upgrade. Its getting-started example disables verification and must be changed for Armin. [Convex TanStack Start guide](https://labs.convex.dev/better-auth/framework-guides/tanstack-start)

Recommendation: use a shared backend workspace that owns `convex/`, schema, functions, and generated references. Web and mobile import public API references/types through a small package entry point. Keep server-only dependencies out of client imports. Convex generates a typed `api` object from backend functions; a parallel hand-written HTTP study API and the old sync contract are unnecessary. [Generated API](https://docs.convex.dev/generated-api/api)

Use Convex's supported document values at the transport/persistence boundary. Convert numeric epoch timestamps to `Date` only inside the portable FSRS wrapper; do not return `Date` instances through Convex. Keep content validators, FSRS field interfaces, and scheduling parameter interfaces independent of Drizzle. [Convex data types](https://docs.convex.dev/database/types)

## Study operations and concurrency

Convex mutations provide atomic database changes with serializable optimistic concurrency control and automatic retry. An action that calls several mutations does not combine them into one transaction. [OCC and atomicity](https://docs.convex.dev/database/advanced/occ), [Actions](https://docs.convex.dev/functions/actions)

Recommendation: one rating mutation should authenticate, establish library ownership, validate the expected review/card/settings state, enforce the account-local daily limit, compute FSRS, write the review log and new schedule, refresh affected prerequisite locks, and persist its result together. Undo should similarly validate the exact latest applicable review and restore its consequences atomically. Graph edits should validate ownership, deck boundaries, and cycles before updating edges and lock state. Large graph changes need measured bounds so this work fits a transaction.

Serializable retry alone does not implement the user's first-accepted-change policy. A second mutation could rerun against updated state and still apply. Recommendation: add explicit expected versions to authored-card edits, graph edits, review submissions, and undo. On retry, compare the client's expected version again and return a stale-state result when it no longer matches. Review submissions must check the version of the actual reviewed item and any other state that invalidates that decision. Use stable request IDs for application-level retries/new invocations, in addition to transport deduplication. Define the result of repeating a request ID before performing version checks.

The client should preserve unsaved text, display a conflict, and allow deliberate reload/retry. A reactive update must never silently overwrite an open form. Capture a base version when opening the form. For a review currently on screen, invalidate its action when relevant content or schedule changes, rather than silently replacing the prompt under the user's answer.

Convex's React client uses subscriptions over a WebSocket, updates query results after changes, reconnects, and retries an outstanding mutation with server-side deduplication of that invocation. This gives cross-tab freshness without a custom collaboration system. [Convex React](https://docs.convex.dev/client/react/overview)

The user subsequently confirmed built-in reactivity in interview question 28, superseding the earlier refresh-only proposal. No collaborative editor or presence feature is implied. Recommendation: disable new study/edit submissions when disconnected, show pending operations honestly, and avoid presenting success until the server confirms. Once a request is sent, a dropped connection can leave its outcome uncertain until reconnection; do not encourage submitting a replacement operation while the first is pending. This is connection recovery, not offline product support.

## FSRS in the Convex runtime

Queries and mutations use Convex's deterministic JavaScript runtime. Function-local `Date.now()` stays fixed during execution, and Convex supplies seeded `Math.random()`. Import-time clock/random values are frozen at deployment and must not drive current study behavior. Node.js execution is available for actions, not database mutations. [Convex runtimes](https://docs.convex.dev/functions/runtimes)

The installed `ts-fsrs` implementation derives its default fuzz seed from review time and current scheduling state, and includes an alternative card-ID seed strategy. The scheduler accepts explicit review time. Its installed module also extends `Date.prototype`. Primary implementation: [ts-fsrs seed strategy](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/fsrs/src/strategies/seed.ts), with installed build evidence in `node_modules/ts-fsrs/dist/index.mjs`.

Inference: the algorithm should be usable inside a mutation with explicit time and no Node dependencies, but this has not been verified in Convex. Make an early deployed development smoke check exercise import, preview, rating with fuzz enabled, and undo before porting the whole study service. Do not move authoritative FSRS calculation into a Node action merely to bypass an import problem, since that would split calculation from the atomic state transition. Resolve compatibility at the library boundary first. Rebuild the scheduler per call or use immutable configuration; do not share a mutable scheduler instance between invocations.

Recommendation: calculate each account's day boundary from the saved IANA timezone. Replace server-local midnight logic. Use the server clock for accepted review time. Also decide how the queue advances when time passes without another data write, because a subscription is not itself a clock; refresh/requery on an appropriate timer, navigation, focus, and before accepting study actions.

## Authentication, email, and deletion

Better Auth supports requiring email verification and a `sendResetPassword` callback. Email verification delivery must also be configured. Revoking existing sessions on password reset is configurable and not the default. [Email/password guide](https://better-auth.com/docs/authentication/email-password)

Better Auth supports linked credentials and OAuth identities. Its account-linking rules distinguish verified provider email from forced trusted-provider linking. It also supports adding a password through a recovery/server flow and verified account deletion. [Users and accounts](https://better-auth.com/docs/concepts/users-accounts)

Recommendation: use one stable auth-user-to-library mapping. Require verified email in backend authorization, not only a route guard. Link only after the required verified identity checks, preserve the library ID across methods, and do not use an unverified trusted-provider shortcut. Check these flows against the component-compatible Better Auth version, since generic Better Auth documentation may describe newer APIs.

The Convex component provides transactional triggers for auth table create/update/delete operations. A trigger shares the triggering database operation's transaction, but a whole Better Auth endpoint may perform multiple operations, so the endpoint is not necessarily one transaction. [Component triggers](https://labs.convex.dev/better-auth/features/triggers)

Recommendation: provision the one library idempotently through the auth integration. For deletion, revoke access immediately and process study rows, exports, and blobs through a durable, bounded cleanup job if a library cannot fit in one transaction. Record cleanup completion and prevent a partially deleting library from accepting new writes. Confirm the final auth-record removal order against component hooks in the implementation spike.

Convex has an official Resend component for durable queued email delivery. Better Auth's callbacks can also call a transactional email provider through an appropriate backend action path. [Convex Resend component](https://www.convex.dev/components/resend)

Recommendation: Resend is a plausible default, not a selected vendor. Setup still needs a verified sending domain, API credentials, public callback URLs, and staging/production delivery checks. No secrets are required for this plan.

## Images and ZIP export

Convex file URLs are bearer URLs. Anyone holding one can fetch the bytes, without another app authorization check; revocation requires deleting/replacing the file. The docs recommend an authenticated HTTP action when every request must enforce access, and an alternative signed-URL storage system when expiring URLs are required. Convex HTTP action responses are currently limited to 100 MiB. [Serving files](https://docs.convex.dev/file-storage/serve-files)

Recommendation: keep Convex file storage and serve private media through an authenticated path. For the web, a same-origin Start route can authenticate via the integration and proxy an authorized backend response without exposing a durable direct URL. Verify the session/token handoff, cache headers, and image download behavior early. Mobile can later attach its credentials when fetching media. An unguessable storage ID is not an ownership check. Authenticated per-request access is the planning default for personal study content.

Convex supports upload URLs generated by a mutation. They expire after one hour; that expiry describes uploads, not image download URLs. [Upload guide](https://docs.convex.dev/file-storage/upload-files)

Recommendation: authorize upload issuance and attachment separately. Store ownership and metadata, validate actual MIME/size, reserve quota, clean unattached blobs, and sanitize rich content. Use configurable free-beta limits. Private export downloads need the same ownership and authentication treatment.

An end-user library export is an application feature. It must not expose a deployment backup containing other accounts or auth records. Recommendation: build a versioned ZIP manifest with stable library IDs, structured records, UTC timestamps, timezone/settings, history, prerequisite edges, and referenced image bytes. Include checksums and human-readable instructions. Do not include password hashes, session tokens, or provider credentials. Restoration remains deferred.

Convex transactions and function return values have limits, so avoid returning the entire ZIP through a normal mutation. Current docs list a 16 MiB query/mutation read bound and function-return bound, plus bounded document scans and writes. [Platform limits](https://docs.convex.dev/production/state/limits)

Recommendation: use an authenticated export job and a bounded assembly/download approach. For small beta libraries, a bounded consistent data query plus image fetching may suffice; large libraries need paginated processing with an explicit consistency strategy. A library revision checked before/after collection with retry on changes is one possible initial design, not a built-in Convex guarantee. Decide quotas alongside the export design.

## Operations, backups, and hosting

Convex backups capture a consistent table snapshot and can include file storage. Their download format includes table JSONL plus `_storage` metadata and blobs when selected. They exclude deployment code, environment variables, and pending scheduled functions. Restoring replaces table data, while existing blobs are not automatically deleted. Periodic dashboard backups currently require Pro; manual backups are retained for seven days, and Free/Starter has a two-backup-per-deployment limit. [Backup and restore](https://docs.convex.dev/database/backup-restore)

Recommendation: document and perform an operator recovery exercise in a disposable deployment, including images and Better Auth component data. Verify the installed component's backup coverage explicitly before claiming full recovery. Keep source/configuration in Git and retain a private inventory of required secrets. Select either paid periodic backups or a deliberate export schedule with retained copies outside the deployment; free-tier BaaS does not remove this operational choice. This operator procedure is separate from deferred user-facing restoration.

TanStack Start has documented deployments for Cloudflare Workers, Netlify, Railway, Vercel, and Node/Docker. Convex hosts backend functions and data; it does not replace the Start frontend/server host. [TanStack hosting guide source](https://raw.githubusercontent.com/TanStack/router/main/docs/start/framework/react/guide/hosting.md), [Convex frontend hosting](https://docs.convex.dev/production/hosting)

Recommendation: choose a managed Start host during implementation after checking current limits and costs. Keep study operations in Convex. Start's server handles rendering, auth proxying, and limited transport-specific work. Separate staging and production backend deployments, auth callback allowlists, secrets, sender configuration, and hosting environments. Check error visibility, usage alerts, and quota behavior before public launch. No cost estimate is asserted by this note.

## Mobile compatibility without a second launch project

Convex supports React Native clients. The component's Expo guide uses `@better-auth/expo`, secure session storage, Convex client auth integration, an app URL scheme, trusted origins, and Convex-site OAuth callback URLs. [Convex React Native](https://docs.convex.dev/client/react-native), [Convex Better Auth Expo guide](https://labs.convex.dev/better-auth/framework-guides/expo)

Better Auth's Expo guide documents secure cookie storage, deep links, development `exp://` origins, and browser-based social sign-in. Custom authenticated requests need explicit session credentials. Development origin wildcards must not carry into production. [Better Auth Expo guide](https://better-auth.com/docs/integrations/expo)

Recommendation: keep shared domain code and generated API imports compiling on Expo. At the foundation milestone, exercise sign-in, authenticated library access, and one server-owned study transition from a minimal mobile screen; add private image fetch to the media milestone. Confirm Google redirects on an actual device or emulator. Expo Go is a current repository workflow, not proof every future auth/native dependency works there; switch to a development build if required by the chosen flow. Do not promise full mobile authoring or store release in the web milestone.

## Planning follow-through

1. Built-in subscriptions with protected drafts/reviews were confirmed in question 28.
2. Hosting and email vendors remain engineering selections during setup, with current costs checked rather than an assumed free-tier guarantee.
3. The migration plan proposes an empty-library create-card path. Sample decks and a separate marketing-site project are outside the proposed scope.
4. The migration plan proposes undo for the exact latest applicable review state with an explicit version check, returning a stale-state conflict when another action invalidates it.

The fixed stack is sufficient to plan the migration. The next useful implementation milestone is a narrow deployed path covering signup, one library, one card, rating/undo, and an Expo authenticated read. That establishes the runtime and auth boundaries before migrating the rest of the interface. Acceptance should use recorded agent browser/device walkthroughs and static/build checks, respecting the user's decision to defer automated test suites.
