# Context Map

Armin is a monorepo. Each context owns its own ubiquitous language (`CONTEXT.md`)
and its own architectural decisions (`docs/adr/`). This map is the index; it holds
no definitions itself.

## Contexts

### Study (desktop and mobile apps)

The local-first study domain: Profiles, Decks, Flashcards, Review units, the
Prerequisite graph, Frontier selection, and FSRS scheduling. This is the original
Armin application and the source of the product's identity.

- Code: `apps/desktop/`, `apps/mobile/`, and `packages/core/`
- Language: `apps/desktop/CONTEXT.md`
- Decisions: `apps/desktop/docs/adr/`

The mobile client uses Expo and React Native. Its development workflow is in
`apps/mobile/README.md`; both clients reuse the portable study code in `@armin/core`.

The mobile app is a second client of this same context: it uses the same Study
language and shared domain, not a glossary of its own.

### Study, web SaaS (in development)

The same Study language, served online: one Account owns one library of Decks,
with server-owned scheduling, account timezone, private images, and export.
It replaces Profiles and local SQLite with Convex documents scoped by library.
Its migration plan is local planning material; the shipped behavior is
documented in the workspace READMEs and `docs/qa/`.

- Code: `apps/web/`, `packages/backend/`, and the Expo smoke path in `apps/mobile/`
- Language: `apps/desktop/CONTEXT.md` (Study), without Profiles
- Research: `docs/research/`

### Sync (cloud service)

The optional paid service that synchronizes Profile records between devices.
It manages Accounts, Subscriptions, Devices, and sync state. Study rules remain
in the clients. Data uses HTTPS and provider-managed encryption at rest; the
service can access its contents.

- Code: `apps/sync-server/`
- Language: `apps/sync-server/CONTEXT.md`
- Decisions: `apps/sync-server/docs/adr/`

## Shared packages

Reusable libraries imported by more than one app live under `packages/`. They
are libraries, not contexts, and do not carry their own glossary unless they grow
domain language of their own.

- `packages/core/` (`@armin/core`) — the platform-agnostic Study domain shared by
  the desktop, web backend, and mobile apps: flashcard types, FSRS scheduling
  rules, scheduling presets, study-day and Frontier rules, and media references.
  The Drizzle schema stays for the desktop app; the scheduler no longer depends
  on it. It speaks the Study context's language (`apps/desktop/CONTEXT.md`).
- `packages/backend/` (`@armin/backend`) — the Convex backend for the web SaaS
  and its client-safe generated API.

## System-wide decisions

Decisions that span contexts — repository structure, tooling, cross-cutting
conventions — live in the root `docs/adr/`.
