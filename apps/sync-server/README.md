# Armin sync server

Placeholder for the optional cloud service that keeps Profile records in sync
between desktop and mobile. Both apps keep local data and work offline.

The proposed stack is Cloudflare Workers for sync requests, D1 for Accounts,
current records, record versions, and a change log, and private R2 storage for
Flashcard media. Clients save pending changes locally, send them when connected,
and download accepted changes after their last saved sync position.

The first implementation is a working server for a small beta, proven with
tests; client integration follows separately. It includes Flashcard content and
review progress. Each Account syncs one Profile. Better Auth runs Google sign-in
and sessions in the Worker, with its authentication data in D1.
Clients calculate schedules; the server rejects conflicting review updates and
keeps the first accepted schedule. Content edits use the same conflict rule.
All Profile settings sync, including keyboard shortcuts. Google registration
is open, with no billing. The completed scope and proposed engineering defaults are in
[the implementation scope](docs/implementation-scope.md), awaiting final
confirmation before implementation.
See [the Cloudflare proposal](docs/research/cloudflare-sync-server.md).

Clients send data over HTTPS. Storage uses provider-managed encryption at rest,
and the service can access its contents. A new device downloads its Account's
current records without a separate Profile encryption key. Study rules remain
in the desktop and mobile apps.

Joining an Account with existing data creates a new local Profile. Deck
prerequisite graphs have their own versions, and review undo is a version-checked
operation that restores the schedule and removes the latest review together.

When the protocol takes shape, put shared request/response schemas in a package
under `packages/` rather than importing client code here.

The deliverable is a locally runnable, tested server and deployment configuration.
Live Google setup, Cloudflare deployment, and client integration follow separately.
The initial upload includes one selected local Profile. Change and deletion
entries are retained for the beta, without automatic cleanup.

This folder has no `package.json` yet, so it is not a workspace project. Add one
with the chosen stack's dependencies to register it with pnpm and Turborepo.
