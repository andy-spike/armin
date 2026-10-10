# Context Map

Armin is a monorepo. Each context owns its own ubiquitous language (`CONTEXT.md`)
and its own architectural decisions (`docs/adr/`). This map is the index; it holds
no definitions itself.

## Contexts

### Study (desktop app)

The local-first study domain: Profiles, Decks, Flashcards, Review units, the
Prerequisite graph, Frontier selection, and FSRS scheduling. This is the original
Armin application and the source of the product's identity.

- Code: `apps/desktop/`
- Language: `apps/desktop/CONTEXT.md`
- Decisions: `apps/desktop/docs/adr/`

The mobile app (`apps/mobile/`, placeholder) is a second client of this same
context: it uses the same Study language and the shared domain in
`packages/core/`, not a glossary of its own.

### Sync (cloud service)

The optional paid backup-and-restore service. It treats a Profile's data as
opaque, end-to-end-encrypted bytes — it never parses the study domain. Its
language is about Accounts, Subscriptions, Devices, and sync state, not Flashcards.

- Code: `apps/sync-server/`
- Language: `apps/sync-server/CONTEXT.md` _(created when its first term is resolved)_
- Decisions: `apps/sync-server/docs/adr/` _(created when its first decision is made)_

## Shared packages

Reusable libraries imported by more than one app live under `packages/`. They
are libraries, not contexts, and do not carry their own glossary unless they grow
domain language of their own.

- `packages/core/` (`@armin/core`) — the platform-agnostic Study domain shared by
  the desktop and mobile apps: database schema, flashcard types, FSRS scheduling
  rules, and scheduling presets. It speaks the Study context's language
  (`apps/desktop/CONTEXT.md`).

## System-wide decisions

Decisions that span contexts — repository structure, tooling, cross-cutting
conventions — live in the root `docs/adr/`.
