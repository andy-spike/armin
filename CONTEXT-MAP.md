# Context map

## Study

The web and mobile clients share decks, flashcards, review units, prerequisites,
Frontier selection, and FSRS scheduling. Accounts own private libraries in Convex.

- Clients: `apps/web/` and `apps/mobile/`.
- Backend: `packages/backend/`.
- Portable domain code: `packages/core/`.
- Study glossary: `packages/core/CONTEXT.md`.
- Original study decisions: `packages/core/docs/adr/`. These include historical
  desktop decisions; Profile and SQLite behavior is retired.
- System decisions: `docs/adr/`. ADRs 0001 and 0002 describe the historical
  repository layout; current workspace structure is documented in the README.
- Current behavior and validation: workspace READMEs and `docs/qa/`.

The desktop application and optional sync service are retired. Web and mobile
use the same Convex backend rather than a separate synchronization service.
