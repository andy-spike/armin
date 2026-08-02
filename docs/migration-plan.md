# Armin Migration Plan: Electron → Hosted Next.js App Router SaaS

Status: **Approved. Ready for an executor agent.** This worktree (`armin.refactor-next-js-app`)
exists for this refactor. The end state is a **single Next.js app at the repo root** —
no monorepo, no npm workspaces, no `apps/` or `packages/` dirs. The Electron app
(`apps/desktop`) is kept only as in-repo reference during the port and is
**deleted in Phase 7**. Package manager: **bun** (bun.lock; never `npm install`).

Read first, in this order: `README.md`, `CONTEXT-MAP.md`, `apps/desktop/CONTEXT.md`,
`PRODUCT.md`, `apps/desktop/docs/testing.md`, `apps/desktop/docs/migrations.md`,
and the ADRs in `apps/desktop/docs/adr/` (0015, 0017, 0018, 0019 are the most
relevant). The executor must also follow `docs/adr/0001-monorepo-with-npm-workspaces.md`
and keep migration/testing discipline (drizzle `--name`, descriptive test names).

---

## 1. Goal

Turn Armin — today a local-first Electron desktop app — into a **hosted multi-user
SaaS** built on Next.js App Router. The study domain (decks, flashcards, review
units, prerequisite graph, FSRS scheduling, frontier, browse, cram, settings,
keybindings, media, Anki import, export/restore) survives. What dies: Electron
(process/window/IPC/preload/media-protocol), the Profile concept, the profile
picker and window chrome, the external MCP protocol, SQLite (replaced by
Postgres), and the npm-workspaces monorepo (replaced by a single Next.js app at
the repo root). This is a product repositioning: README/PRODUCT.md "local-first,
never a SaaS" claims are superseded by this plan and updated in Phase 7.

## 2. Locked decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Hosted multi-user SaaS on **Vercel + Neon (managed Postgres) + Vercel Blob**. Neon CLI is already installed and authenticated on the dev machine — use it to create/manage databases rather than a local Docker Postgres | Owner's call; serverless-friendly, zero ops; Neon CLI ready to use (`neonctl`) |
| D2 | **Account = one study space**. Profile dies. No profile picker, no profile switching, no per-profile DBs, no `--armin-profile-id` | Domain simplification chosen in review |
| D3 | Data store: **Postgres via `drizzle-orm` + `pg`**; better-sqlite3 removed everywhere | SaaS-appropriate storage; services survive |
| D4 | Auth: **Better Auth** (email + password, Postgres adapter, session cookies) | Chosen provider; self-contained, MIT |
| D5 | UI ↔ backend: **REST route handlers + TanStack Query** client-side; RSC only for shell/layout/fonts | Minimizes renderer churn (~85 `window.armin` call sites become `api.*`) |
| D6 | **External MCP protocol dropped.** No `/mcp` route, no stdio server, no MCP settings UI, no API keys. MCP tools simply cease to exist | Chosen by owner |
| D7 | All other features survive: decks/browse/review/cram/settings routes, keybindings (per-account overrides), prerequisite graph canvas, media (Vercel Blob), Anki import, export/restore | Chosen by owner |
| D8 | **Monorepo removed.** The repo becomes a single Next.js app at the **repo root** (no npm workspaces, no `apps/`, no `packages/`). `apps/desktop`, `apps/sync-server`, `packages/sync-contract` deleted at the end (Phase 7) — kept only as in-repo reference during the port | Chosen by owner |
| D9 | **No data bridge** — SaaS starts fresh | Chosen by owner |
| D10 | Existing epoch-ms integer timestamps preserved as **BIGINT** in Postgres | Zero semantic churn on FSRS due-date math |
| D11 | **bun** is the package manager: `bun.lock` committed, `bun install`, `bun run`, `bunx`. No `package-lock.json`, no npm anywhere (root or CI/Vercel) | Chosen by owner; faster installs, single lockfile |

## 3. Target architecture

```
<repo root>  # the Next.js app; no apps/, no packages/, no workspaces
├── package.json                # the app's own package.json (scripts at root)
├── bun.lock                    # bun lockfile (package-lock.json deleted)
├── next.config.ts              # serverExternalPackages: [] (nothing native remains)
├── drizzle.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── src/
│   ├── app/
│   │   ├── layout.tsx            # root: fonts, metadata, theme-init script
│   │   ├── page.tsx              # /        → DecksPage (decks.tsx)
│   │   ├── browse/page.tsx       # /browse  → BrowsePage
│   │   ├── deck/[deckId]/page.tsx          → DeckPage
│   │   ├── deck/[deckId]/graph/page.tsx    → DeckGraphPage
│   │   ├── deck/[deckId]/review/page.tsx   → ReviewPage
│   │   ├── review/page.tsx       # /review  → ReviewsPage
│   │   ├── cram/page.tsx         # /cram    → CramPage
│   │   ├── settings/page.tsx     # /settings→ SettingsPage
│   │   ├── (auth)/sign-in/page.tsx
│   │   ├── (auth)/sign-up/page.tsx
│   │   ├── (study)/layout.tsx    # providers (Query/Theme/Toast/Keybindings) + auth guard
│   │   └── api/                  # route handlers (see §5)
│   ├── lib/
│   │   ├── db.ts                 # Postgres pool + drizzle instance
│   │   ├── auth.ts               # Better Auth server config
│   │   ├── api.ts                # typed client: window.armin shape → fetch
│   │   ├── query.ts              # port of renderer/lib/armin-query.ts (keys unchanged)
│   │   ├── session.ts            # getSession() → accountId guard for handlers
│   │   ├── services/             # ported async services (see §4)
│   │   ├── shared/               # port of shared/armin-api.ts + browse.ts + flashcard-types.ts
│   │   └── media/                # Vercel Blob put/head + media-ref helpers
│   ├── components/               # port of renderer/components/** (minus Electron bits)
│   ├── keybindings/              # port of renderer/keybindings/**
│   ├── theme/                    # port of renderer/theme/**
│   ├── styles/                   # port of index.css + flexoki CSS
│   ├── db/
│   │   ├── schema.ts             # Postgres schema (port of main/db/schema.ts)
│   │   ├── better-auth.ts        # user/session/account tables
│   │   └── migrations/           # drizzle-kit generated SQL
│   ├── test/db.ts                # PG test helper (port of main/test/db.ts)
│   └── e2e/                      # Playwright web specs
├── public/                       # favicon, theme-init.js
├── CONTEXT.md                    # study context language (moved from apps/desktop/CONTEXT.md)
├── README.md, PRODUCT.md, DESIGN.md, docs/, AGENTS.md, CLAUDE.md, LICENSE  # survive
```

## 4. Data model & domain changes

- **Profile → Account.** `ServiceContext` becomes `{ accountId: string; db }`.
  All `profileId` columns become `accountId` (FK to the Better Auth `user` table).
  `profiles.json`, `src/main/profiles/`, `user-data.ts`, `app-settings.ts` are
  deleted. `restoreProfileFromZip` imports into the signed-in account instead of
  creating a Profile dir.
- **Everything else in `apps/desktop/CONTEXT.md` survives verbatim**: Deck,
  Flashcard, Review unit, Prerequisite, Prerequisite graph, Frontier, Secured,
  Locked, Archived. Keybindings "per-profile overrides" (ADR 0019) become
  per-account overrides — ADR language updated in Phase 7.
- **Ports (service module → `src/lib/services/`)**, all made `async`
  (Postgres is async; better-sqlite3 was sync):
  - `decks.ts`, `flashcards.ts`, `flashcard-types.ts`, `review.ts`,
    `scheduler.ts`, `due-sort.ts`, `cram.ts`, `browse.ts`, `graph.ts`,
    `prerequisite-state.ts`, `media.ts`, `settings.ts`,
    `anki/import.ts`, `anki/template.ts`, `anki/html.ts`, `export.ts`,
    `restore.ts`, `backup-format.ts`, `shuffle.ts`
  - Deleted: `profiles.ts`, `mcp.ts`, `app-settings.ts`, `context.ts`
    (replaced by `lib/session.ts` + `ServiceContext` in `lib/services/context.ts`)
- **Schema port (`main/db/schema.ts` → `src/db/schema.ts`)**:
  - `sqliteTable` → `pgTable`; `integer(...)` PKs → `text` PKs as today
  - `integer({ mode: "timestamp" })` → `bigint` epoch-ms (D10)
  - `json` columns → `jsonb` (flashcard content, graph layout, settings)
  - all `profileId` FKs → `accountId`; add Better Auth `user/session/account` tables
  - first migration generated with `--name=account_initial_schema` per
    `apps/desktop/docs/migrations.md` conventions

## 5. REST API contract

Every handler: `auth.api.getSession({ headers })` → 401 if absent → build
`ServiceContext { accountId, db }` → call service. No RSC/`force-static` on
these routes. Response payloads reuse the existing shared types from
`shared/armin-api.ts` unchanged (clients depend on the same shapes).

| Old IPC command (catalog) | HTTP endpoint | Method | Body / query |
|---|---|---|---|
| `decks.list` | `/api/decks` | GET | — |
| `decks.get` | `/api/decks/[id]` | GET | — |
| `decks.create` | `/api/decks` | POST | `{ name, description? }` |
| `decks.update` | `/api/decks/[id]` | PATCH | `{ name?, description? }` |
| `decks.delete` | `/api/decks/[id]` | DELETE | — |
| `flashcards.list` | `/api/decks/[deckId]/flashcards` | GET | — |
| `flashcards.listAll` | `/api/flashcards?all=1` | GET | — |
| `flashcards.browse` | `/api/flashcards/browse` | GET | `offset, limit, sort, state?, deckId?, tags?` |
| `flashcards.listTags` | `/api/flashcards/tags` | GET | — |
| `flashcards.listDeckTags` | `/api/decks/[deckId]/tags` | GET | — |
| `flashcards.get` | `/api/flashcards/[id]` | GET | — |
| `flashcards.deleteConsequences` | `/api/flashcards/[id]/delete-consequences` | GET | — |
| `flashcards.moveConsequences` | `/api/flashcards/[id]/move-consequences` | GET | — |
| `flashcards.create` | `/api/flashcards` | POST | `{ deckId, type, content, tags? }` |
| `flashcards.update` | `/api/flashcards/[id]` | PATCH | `{ type?, content?, tags? }` |
| `flashcards.delete` | `/api/flashcards/[id]` | DELETE | — |
| `flashcards.archive` | `/api/flashcards/[id]/archive` | POST | `{ archived: boolean }` |
| `flashcards.move` | `/api/flashcards/[id]/move` | POST | `{ targetDeckId }` |
| `import.analyzeAnki` | `/api/import/anki/analyze` | POST | multipart `{ file, fileName }` |
| `import.commitAnki` | `/api/import/anki/commit` | POST | `{ importId, deckName, keepScheduling, deckStrategy }` |
| `import.createDeckWithFlashcards` | `/api/import/deck-with-flashcards` | POST | `{ name, description?, flashcards[] }` |
| `data.export` | `/api/data/export` | POST | returns zip download |
| `data.restore` | `/api/data/restore` | POST | multipart zip |
| `media.importImage` | `/api/media` | POST | multipart `{ file, fileName?, mime? }` → `{ ref }` |
| `media.url` | `GET /api/media/[ref]` | GET | 302 → Blob URL (or proxy) |
| `review.queue` | `/api/review/queue?deckId=` | GET | — |
| `review.queueAll` | `/api/review/queue` | GET | — |
| `review.preview` | `/api/review/preview/[reviewUnitId]` | GET | — |
| `review.rate` | `/api/review/rate` | POST | `{ reviewUnitId, rating }` |
| `review.undo` | `/api/review/undo` | POST | `{ reviewUnitId }` |
| `cram.pool` | `/api/cram/pool` | POST | `{ deckIds?, tags?, combine }` |
| `graph.getDeck` | `/api/decks/[deckId]/graph` | GET | — |
| `graph.addPrereq` | `/api/graph/prereq` | POST | `{ prereqId, dependentId }` |
| `graph.removePrereq` | `/api/graph/prereq?prereqId=&dependentId=` | DELETE | — |
| `graph.saveLayout` | `/api/decks/[deckId]/graph/layout` | PUT | `{ placements[] }` |
| `settings.get` | `/api/settings` | GET | — |
| `settings.update` | `/api/settings` | PATCH | settings patch (unchanged zod shape) |
| `settings.getDeck` | `/api/decks/[deckId]/settings` | GET | — |
| `settings.updateDeck` | `/api/decks/[deckId]/settings` | PATCH | deck settings patch |
| ~~profiles.*~~ | — | — | dropped (D2) |
| ~~mcp.*~~ | — | — | dropped (D6) |
| ~~shell.*~~ | — | — | dropped (Electron) |

`lib/api.ts` mirrors the old `ArminApi` interface (minus `profiles`, `mcp`,
`shell`, `onDataChanged`) so route components swap `window.armin.x(...)` for
`api.x(...)` with no other changes. Error convention: handlers return
`{ error: string }` with non-2xx status; `api.ts` throws for non-2xx.

## 6. Execution phases

Commit after each phase. Phase gates must pass before moving on.

### Phase 0 — Scaffold the Next.js app at the repo root

1. Clear the monorepo scaffolding: delete root `package.json`, `package-lock.json`,
   `tsconfig.base.json`, and the root `node_modules/` (the desktop app under
   `apps/desktop` keeps its own `package.json`/source for reference — it no
   longer needs to install or run). Then scaffold into the repo root:
   `bunx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-bun --yes` (latest stable Next; the executor may need to move conflicting root files aside temporarily — e.g. `README.md` — and restore them afterwards).
2. Add runtime deps with `bun add` (versions mirror `apps/desktop/package.json`):
   `@base-ui/react`,
   `@dagrejs/dagre`, `@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono`,
   `@fontsource-variable/source-serif-4`, `@tanstack/react-query`,
   `@tanstack/react-virtual`, `@tiptap/*` (core, extension-image, extension-placeholder,
   markdown, pm, react, starter-kit), `@xyflow/react`, `@vercel/blob`,
   `class-variance-authority`, `clsx`, `drizzle-orm`, `fflate`, `fzstd`, `lucide-react`,
   `pg`, `react-markdown`, `remark-gfm`, `tailwind-merge`, `ts-fsrs`, `tw-animate-css`,
   `zod`, `better-auth`. Dev deps with `bun add -d`: `drizzle-kit`, `vitest`, `@types/pg`, `@playwright/test`.
3. Port `renderer/styles/` (flexoki CSS, `index.css`) and the three fontsource
   imports into `src/styles/`; delete boilerplate CSS from the scaffold. Port
   `public/theme-init.js` + favicon. Verify the flexoki design tokens work
   (`DESIGN.md` colors).
4. `vitest.config.ts` (environment node, `src/lib/services/**/*.test.ts` include,
   matching the desktop's service-test boundary per `testing.md`).
5. App `package.json` scripts ARE the repo scripts: `dev`, `build`, `start`,
   `typecheck` (`tsc --noEmit`), `lint`, `test` (`vitest run`), `test:e2e`
   (`playwright test`), `db:generate` (`drizzle-kit generate`), `db:migrate`
   (`drizzle-kit migrate`). Run `bun install` so `bun.lock` exists.
6. **Gate**: `bun run dev` renders the shell; `bun run typecheck` green.

### Phase 1 — Postgres data layer + async services

1. `src/db/schema.ts`: port per §4 (all `accountId`, `jsonb`, epoch-ms `bigint`),
   plus Better Auth `user/session/account` tables.
2. `drizzle.config.ts` (postgres dialect) and generate first migration:
   `bun run db:generate --name=account_initial_schema`.
   Review the SQL. Add `db:migrate` script (`drizzle-kit migrate`).
3. `src/lib/db.ts`: `pg` Pool + drizzle; `DATABASE_URL` from env.
4. Port every service in §4 from `apps/desktop/src/main/services/` to
   `src/lib/services/`, converting sync → async (the compiler will surface every
   call site). Keep module boundaries, exported names, and domain logic identical.
   `ServiceContext = { accountId: string; db }`.
5. Port `main/test/db.ts` → `src/test/db.ts`: create a fresh schema per suite
   (drop + migrate or truncate between tests) against `DATABASE_URL_TEST`.
   `testing.md` discipline applies: no new tests beyond porting; descriptive names.
6. Delete `mcp.ts`, `profiles.ts`, `app-settings.ts` ports (they don't move).
7. **Gate**: `bun run test` green (all ported suites).
   Local Postgres for dev/tests: use **Neon** via the already-authenticated CLI —
   `neonctl projects create --name armin-dev` (or reuse the main project), then
   `neonctl connection-string --project-id <id> --database dev` for `DATABASE_URL`
   and a separate `DATABASE_URL_TEST` database for vitest (see `src/test/db.ts`).
   Do not stand up a local Docker Postgres.

### Phase 2 — Better Auth

1. `src/lib/auth.ts` (Better Auth + Drizzle adapter), email/password, session cookie.
2. `(auth)/sign-in` + `(auth)/sign-up` client pages (Base UI components, Flexoki styles).
3. Auth guard: `(study)/layout.tsx` checks session server-side; `app/api/**`
   handlers use `lib/session.ts` helper.
4. **Gate**: signup → session cookie → `(study)` pages accessible; unauthenticated
   requests to `/api/*` return 401.

### Phase 3 — Route handlers + client API

1. Implement all endpoints from §5, reusing the zod schemas from
   `shared/ipc-command-catalog.ts` (they port into `lib/shared/`).
   Multipart endpoints use `request.formData()`. Export returns the zip as a
   `Response` with `Content-Disposition`; restore writes into the account.
2. `lib/api.ts` typed client + `lib/query.ts` (port `armin-query.ts` unchanged).
3. `App.tsx` → `(study)/layout.tsx` client component with the same provider stack
   (QueryClientProvider, ThemeProvider, ToastProvider, KeybindingsProvider), minus
   the `onDataChanged` effect (mutation-driven invalidation replaces it).
4. **Gate**: an authenticated browser session can list/create decks via the API.

### Phase 4 — UI port

Route mapping (TanStack hash route → App Router file, all client components,
`"use client"` at the top):

| Old route | New file |
|---|---|
| `/` (DecksPage) | `src/app/page.tsx` |
| `/browse` | `src/app/browse/page.tsx` |
| `/deck/$deckId` | `src/app/deck/[deckId]/page.tsx` |
| `/deck/$deckId/graph` | `src/app/deck/[deckId]/graph/page.tsx` |
| `/deck/$deckId/review` | `src/app/deck/[deckId]/review/page.tsx` |
| `/review` | `src/app/review/page.tsx` |
| `/cram` | `src/app/cram/page.tsx` |
| `/settings` | `src/app/settings/page.tsx` |

1. Port `renderer/components/**` (all 30+, incl. `ui/`, `prerequisite-graph/`) and
   `renderer/routes/**` as `"use client"` pages. `deckId` comes from
   `useParams()` (Next 16: `params` is a Promise in server components, but
   client components use `useParams()` which is sync — use that).
2. Sweep the ~85 `window.armin.*` call sites: `window.armin.x(...)` → `api.x(...)`.
   Delete `window.d.ts` (armin/arminShell globals), `disable-spellcheck.ts`.
3. Replace TanStack Router navigation with `next/link` + `next/navigation`
   (`useRouter`, `useSearchParams` for browse filters/params).
4. Delete Electron-only components: `window-controls.tsx`, `profile-picker*.tsx`,
   `profile-switcher.tsx`, `mcp-settings.tsx` (and its settings tab). `App.tsx`
   `onDataChanged` logic removed (D5/D6).
5. Keybindings provider: `settings.get` via `api`; drop the `hasBackend` guard.
6. Graph worker: keep `graph-layout.worker.ts` via the
   `new Worker(new URL("./graph-layout.worker.ts", import.meta.url))` pattern;
   it works under webpack/turbopack.
7. **Gate**: full manual walkthrough — decks CRUD, browse filters, review
   rate/undo, cram, graph edge add/remove + layout, settings save, keybindings.
   `bun run lint` green.

### Phase 5 — Media, import, export, restore

1. `media.ts` → Vercel Blob: `put()` under content-hashed keys
   (`{accountId}/{sha256}` — keeps ADR 0017 content-addressing), store the key in
   the media row; `GET /api/media/[ref]` resolves to the Blob URL (302) and stays
   the canonical URL used by `markdown-image.ts` / `markdown-editor.tsx`.
2. `import-deck-dialog.tsx`: native file input replaces the Electron dialog
   (bytes already flow through the API as `Uint8Array`).
3. Export: browser download of the zip; Restore: file input → upload → import
   into the account (port `restore.ts` to `accountId` target).
4. **Gate**: image attaches to a flashcard and renders (incl. image-occlusion);
   Anki `.apkg` import works; export → restore roundtrip in a second account.

### Phase 6 — Tests

1. Unit: all ported service tests green (Phase 1). No renderer unit tests
   (per `testing.md`).
2. E2E: new `playwright.config.ts` for `next start`; seed a test account via the
   API (or Better Auth test hooks); port the critical journeys from
   `e2e/core-workflows.spec.ts` (create deck → create flashcard → review session →
   graph edge → settings), deleting `e2e/helpers/electron.ts`. Sparse per
   `testing.md` — the boundary these prove is now HTTP API + browser UI.
3. **Gate**: `bun run test && bun run test:e2e && bun run typecheck && bun run lint` green.

### Phase 7 — Cleanup, docs, deploy

1. Delete `apps/desktop`, `apps/sync-server`, `packages/sync-contract` — the
   monorepo is gone; the repo root is the Next.js app (D8). Delete any leftover
   npm artifacts (`package-lock.json`, `overrides`/`allowScripts`); the only
   lockfile is `bun.lock`.
2. Repo conventions: update `AGENTS.md` (drop the `--workspace apps/desktop`
   notes; single app, bun commands), fold or delete `tsconfig.base.json` and
   `CONTEXT-MAP.md` (single context now), delete the now-obsolete
   `docs/adr/0001-monorepo-with-npm-workspaces.md` (or mark it superseded by the
   new ADR).
3. Docs: rewrite `README.md` (installation → hosted web app; drop local-first
   claims), update `PRODUCT.md` (drop "never a SaaS"), move the study context
   language to root `CONTEXT.md` (Account, Study Space; the rest of the study
   language carries over), record the migration as `docs/adr/0002-electron-to-hosted-nextjs-saas.md`
   covering D1–D11, delete the MCP content (`mcp-server.md`) from the README.
4. Vercel: **Neon** Postgres env `DATABASE_URL` (create the database with the
   installed `neonctl` CLI if not already provisioned), `BLOB_READ_WRITE_TOKEN`
   from Vercel Blob, `db:migrate` wired into the deploy path (build command or
   predeploy step — verify migrations run once per environment, idempotently).
   Set the Vercel project's **Install Command to `bun install`** and Framework
   Preset to Next.js (D11).
5. **Gate**: full repo: `bun run typecheck && bun run lint && bun run test && bun run test:e2e`; clean `git status`; production deploy smoke test.

## 7. Hazards & gotchas (executor checklist)

- **Async port is the biggest mechanical risk**: better-sqlite3 is synchronous;
  every service function and every caller becomes `await`-based. The ported
  service tests (Phase 1) are the safety net — run them early and often.
- **Drizzle dialect**: `.sqliteTable` → `.pgTable`; `integer({mode:"timestamp"})`
  → `bigint`; `json` → `jsonb`; boolean stays. Do not silently change column
  semantics (D10).
- **Next 15/16**: server components receive `params`/`searchParams` as Promises;
  client pages use `useParams()`/`useSearchParams()` (sync). Route handlers are
  dynamic by default — do not mark data routes static.
- **No `window` at module scope** in any client component (SSR). `theme-init.js`
  stays in `public/` and loads in `<head>` before hydration (as in the desktop).
- **Workers**: `new Worker(new URL(...))` — do not import the worker module
  statically (it would be bundled into the main chunk).
- **Vercel**: no native modules remain (better-sqlite3 fully removed — D3);
  `pg` is fine serverless. Bump `maxDuration` on heavy routes (anki import) if
  needed. Migrations must be idempotent and run before traffic (Phase 7 step 4).
  Use the Neon CLI (`neonctl`, already installed + authenticated) for any
  database provisioning — never a Docker Postgres.
- **bun everywhere**: commit `bun.lock`; never introduce `package-lock.json` or
  `npm install` (D11). `bun run <script> --flag` forwards flags without `--`.
  Vitest and Playwright run fine under bun. On Vercel, set Install Command to
  `bun install` (Phase 7 step 4).
- **`zod` v4** stays (`zod/v4` import exists only in deleted MCP code).
- **`data.restore` semantics change**: restore targets the signed-in account;
  it never creates profiles or dirs. Update its tests accordingly.
- **Keybindings**: "per-profile overrides" (ADR 0019) → per-account; the
  settings UI label changes, data model is just `accountId`.
- **Do not hand-edit generated migrations** unless required; pass `--name`
  (snake_case) every time per `migrations.md`.

## 8. Acceptance criteria (definition of done)

1. `bun run typecheck && bun run lint` green at repo root; `bun run test` green; `bun run test:e2e` green.
2. Fresh signup can: create decks, create flashcards (basic, cloze, image occlusion),
   attach media, wire prerequisite edges on the canvas, review a session with
   rate/undo, cram, browse with filters, change settings and keybindings.
3. Anki `.apkg` import works; export downloads a zip; restore in a second
   account round-trips (deck + flashcard + review-history counts match).
4. Unauthenticated access to any `/api/*` or `(study)` route redirects/401s.
5. No `electron`, `better-sqlite3`, `window.armin`, or `arminShell` references
   remain anywhere; `apps/desktop` and sync placeholders deleted; the repo root
   is the Next.js app with no npm workspaces (D8).
6. `bun.lock` is the only lockfile; every command in the repo runs via
   `bun run` (D11).
7. Docs updated (README, PRODUCT.md, root `CONTEXT.md`, `docs/adr/0002`),
   deploy live on Vercel with Neon Postgres + Blob wired and `bun install`
   configured.

## 9. Out of scope

- Data migration from existing desktop profiles (D9 — fresh start).
- External MCP protocol, API keys, agent integrations (D6).
- Offline/PWA support, sync between devices, billing/subscriptions.
- Restoring the desktop packaging (AppImage/exe/zip) story.
- Renderer unit tests, numeric coverage targets (per `testing.md`).
