# Armin Build Plan: Hosted Next.js App Router SaaS

Status: **Approved. Ready for an executor agent.** This worktree (`armin.refactor-next-js-app`)
exists for the rebuild. The previous Electron source was purged; the end state is a
**single Next.js app at the repo root** — no monorepo, no npm workspaces, no
`apps/` or `packages/` dirs. Package manager: **bun** (bun.lock; never `npm install`).
The study domain, its vocabulary (`CONTEXT.md`), and its decisions (`docs/adr/`)
survive as the specification to rebuild against.

Read first, in this order: `README.md`, `CONTEXT.md`, `PRODUCT.md`, `DESIGN.md`,
`docs/testing.md`, `docs/migrations.md`, and the ADRs in `docs/adr/` (0008
subKey identity, 0012 deck-bound graphs, 0013 dialog labels, 0014 media,
0015/0016 keybindings are the most build-relevant).

---

## 1. Goal

Rebuild Armin — previously a local-first Electron desktop app — as a **hosted
multi-user SaaS** on Next.js App Router. The study domain (decks, flashcards,
review units, prerequisite graph, FSRS scheduling, frontier, browse, cram,
settings, keybindings, media, Anki import, export/restore) survives. What dies:
Electron (process/window/IPC/preload/media-protocol), the Profile concept, the
external MCP protocol, SQLite (replaced by Postgres), and the npm-workspaces
monorepo. This is a product repositioning: the product is now a SaaS with a free
tier and a paid AI plan.

## 2. Locked decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Hosted multi-user SaaS on **Vercel + Supabase (managed Postgres, object storage, auth)**. Supabase provides the Postgres database, flashcard-media storage, and user auth; Vercel hosts the Next.js app | Serverless-friendly, zero ops; rely on Supabase's managed capabilities to build fast (ADR 0017) |
| D2 | **User = one study space.** Profile dies. No profile picker, no profile switching, no per-profile DBs | Domain simplification; one User owns exactly one Study Space |
| D3 | Data store: **Postgres via `drizzle-orm` + `pg`**; better-sqlite3 removed everywhere | SaaS-appropriate storage; domain services survive |
| D4 | Auth: **Supabase Auth** (email + password primary, Google/GitHub OAuth as convenience sign-in, session cookies via the SSR client) | Managed auth; no self-hosted auth tables to maintain (ADR 0017) |
| D5 | UI ↔ backend: **REST route handlers + TanStack Query** client-side; RSC only for shell/layout/fonts | Clean client contract, minimal churn |
| D6 | **External MCP protocol dropped.** No `/mcp` route, no stdio server, no MCP settings UI, no API keys | Dead concept |
| D7 | All study features survive: decks/browse/review/cram/settings routes, keybindings (per-User overrides), prerequisite graph canvas, media (Supabase Storage), Anki import, export/restore | Full feature carryover |
| D8 | **Monorepo removed.** The repo is a single Next.js app at the **repo root** (no npm workspaces, no `apps/`, no `packages/`) | Already done by the purge |
| D9 | **No data bridge** — SaaS starts fresh | No legacy users to migrate |
| D10 | Epoch-ms integer timestamps preserved as **BIGINT** in Postgres | Zero semantic churn on FSRS due-date math |
| D11 | **bun** is the package manager: `bun.lock` committed, `bun install`, `bun run`, `bunx`. No npm anywhere (root, CI, or Vercel) | Faster installs, single lockfile |
| D12 | **Payments via Polar.sh.** Stripe is unavailable in Colombia where the owner is based. Two offerings: a **free tier** (all study features, no feature gating, bounded only by a media-storage quota) and one **paid plan at $5/month** that adds **AI features only**. No free trial; the free tier is the whole onboarding. (ADR 0002, 0005) | Owner's call; pricing reflects the free tier being genuinely complete |
| D13 | **AI via OpenRouter (LLM gateway) + Mastra (agents framework).** Three AI features: **card generation** (draft a flashcard or whole deck), **AI explanation** (explain this on demand), **card improvement** (suggest concrete edits). Metered by a monthly **AI allowance** per Subscription (per operation, not per token); no unlimited-AI promise. AI is strictly paid-only. (ADR 0003) | Model flexibility, bounded cost |
| D14 | **Study content goes to the LLM only per-invocation** — as the explicit input of an AI feature the User runs; never wholesale, never for training. Privacy promise in docs. (ADR 0004) | Privacy stance, shapes the AI integration |

## 3. Target architecture

```
<repo root>  # the Next.js app; no apps/, no packages/, no workspaces
├── package.json                # the app's own package.json (scripts at root)
├── bun.lock                    # bun lockfile
├── next.config.ts
├── drizzle.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── src/
│   ├── app/
│   │   ├── layout.tsx            # root: fonts, metadata, theme-init script
│   │   ├── page.tsx              # /        → DecksPage
│   │   ├── browse/page.tsx       # /browse
│   │   ├── deck/[deckId]/page.tsx            → DeckPage
│   │   ├── deck/[deckId]/graph/page.tsx      → DeckGraphPage
│   │   ├── deck/[deckId]/review/page.tsx     → ReviewPage
│   │   ├── review/page.tsx       # /review
│   │   ├── cram/page.tsx         # /cram
│   │   ├── settings/page.tsx     # /settings
│   │   ├── (auth)/sign-in/page.tsx
│   │   ├── (auth)/sign-up/page.tsx
│   │   ├── (billing)/page.tsx    # subscription/plan status
│   │   ├── (study)/layout.tsx    # providers (Query/Theme/Toast/Keybindings) + auth guard
│   │   └── api/                  # route handlers (see §5)
│   ├── lib/
│   │   ├── db.ts                 # Postgres pool + drizzle instance
│   │   ├── auth.ts               # Supabase Auth server client (session cookies, getUser)
│   │   ├── api.ts                # typed client
│   │   ├── query.ts              # TanStack Query keys
│   │   ├── session.ts            # getUser() → userId guard for handlers
│   │   ├── services/             # domain services
│   │   ├── shared/               # shared types + zod schemas
│   │   ├── media/                # Supabase Storage upload/signed-URL + media-ref helpers
│   │   ├── billing/              # Polar.sh client + webhook handling + entitlement checks
│   │   └── ai/                   # OpenRouter + Mastra integrations (per ADR 0003/0004)
│   ├── components/               # UI components
│   ├── keybindings/              # keybinding registry/dispatcher (ADR 0015/0016)
│   ├── theme/
│   ├── styles/                   # flexoki CSS
│   ├── db/
│   │   ├── schema.ts             # Postgres schema
│   │   ├── users.ts              # users row keyed to auth.users.id (Study Space + billing)
│   │   └── migrations/           # drizzle-kit generated SQL
│   ├── test/db.ts                # PG test helper
│   └── e2e/                      # Playwright web specs
├── public/                       # favicon, theme-init.js
├── CONTEXT.md                    # ubiquitous language
├── README.md, PRODUCT.md, DESIGN.md, docs/, AGENTS.md, LICENSE  # survive
```

## 4. Data model & domain changes

- **Profile → User + Study Space.** A `User` (auth + billing entity) owns exactly
  one `Study Space` holding all decks, flashcards, schedule, settings, and media.
  `ServiceContext = { userId: string; db }`. No `profiles.json`, no per-profile
  dirs. Restore imports into the signed-in User's Study Space.
- **Everything in `CONTEXT.md` is the vocabulary**: User, Study Space,
  Subscription, Plan, AI allowance, Deck, Flashcard, Flashcard media, Review
  unit, Prerequisite, Dependent flashcard, Prerequisite graph, Frontier,
  Secured, Locked flashcard, Archived flashcard. Use these names exactly.
- **Services** (`src/lib/services/`), all async (Postgres is async):
  `decks`, `flashcards`, `flashcard-types`, `review`, `scheduler`, `due-sort`,
  `cram`, `browse`, `graph`, `prerequisite-state`, `media`, `settings`,
  `anki/import`, `anki/template`, `anki/html`, `export`, `restore`,
  `backup-format`, `shuffle`. Their behavior is specified by the ADRs
  (0006 all-units secured, 0007 archived-inert, 0008 subKey identity,
  0009 creation chokepoint, 0010 archive vs delete, 0011 image occlusion,
  0012 deck-bound graphs, 0014 content-addressed media).
- **Schema** (`src/db/schema.ts`):
  - `pgTable`; `text` PKs; `bigint` epoch-ms (D10); `jsonb` for flashcard
    content, graph layout, settings
  - all rows scoped by `userId` referencing `auth.users.id`; Supabase Auth's
    `auth` schema is managed — our `users` row carries the Study Space + billing linkage
  - `subscriptions` table keyed to Polar.sh customer/subscription IDs + plan +
    status; `ai_usage` (monthly AI allowance ledger)
  - first migration generated with `--name=account_initial_schema` per
    `docs/migrations.md` conventions

## 5. REST API contract

Every handler: Supabase SSR `createServerClient(...).auth.getUser()` → 401 if absent → build
`ServiceContext { userId, db }` → check entitlement where needed → call service.
No RSC/`force-static` on these routes.

### Study routes (from the old IPC catalog)

| Endpoint | Method | Body / query |
|---|---|---|
| `/api/decks` | GET/POST | `{ name, description? }` |
| `/api/decks/[id]` | GET/PATCH/DELETE | `{ name?, description? }` |
| `/api/decks/[deckId]/flashcards` | GET | — |
| `/api/flashcards?all=1` | GET | — |
| `/api/flashcards/browse` | GET | `offset, limit, sort, state?, deckId?, tags?` |
| `/api/flashcards/tags` | GET | — |
| `/api/decks/[deckId]/tags` | GET | — |
| `/api/flashcards/[id]` | GET/PATCH/DELETE | `{ type?, content?, tags? }` |
| `/api/flashcards/[id]/delete-consequences` | GET | — |
| `/api/flashcards/[id]/move-consequences` | GET | — |
| `/api/flashcards/[id]/archive` | POST | `{ archived: boolean }` |
| `/api/flashcards/[id]/move` | POST | `{ targetDeckId }` |
| `/api/import/anki/analyze` | POST | multipart `{ file, fileName }` |
| `/api/import/anki/commit` | POST | `{ importId, deckName, keepScheduling, deckStrategy }` |
| `/api/import/deck-with-flashcards` | POST | `{ name, description?, flashcards[] }` |
| `/api/data/export` | POST | returns zip download |
| `/api/data/restore` | POST | multipart zip |
| `/api/media` | POST | multipart `{ file, fileName?, mime? }` → `{ ref }` |
| `/api/media/[ref]` | GET | 302 → signed URL (Supabase Storage) |
| `/api/review/queue?deckId=` | GET | — |
| `/api/review/queue` | GET | — |
| `/api/review/preview/[reviewUnitId]` | GET | — |
| `/api/review/rate` | POST | `{ reviewUnitId, rating }` |
| `/api/review/undo` | POST | `{ reviewUnitId }` |
| `/api/cram/pool` | POST | `{ deckIds?, tags?, combine }` |
| `/api/decks/[deckId]/graph` | GET | — |
| `/api/graph/prereq` | POST/DELETE | `{ prereqId, dependentId }` |
| `/api/decks/[deckId]/graph/layout` | PUT | `{ placements[] }` |
| `/api/settings` | GET/PATCH | settings patch |
| `/api/decks/[deckId]/settings` | GET/PATCH | deck settings patch |

### Billing routes (D12)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/billing/checkout` | POST | create Polar.sh checkout session for the paid plan |
| `/api/billing/portal` | POST | open the Polar.sh customer portal |
| `/api/billing/status` | GET | current Plan + Subscription state + AI allowance remaining |
| `/api/billing/webhook` | POST | Polar.sh events → update Subscription / entitlements |

### AI routes (D13/D14)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/ai/generate-cards` | POST | draft flashcards / a deck from a prompt or source |
| `/api/ai/explain` | POST | on-demand explanation of a card's content |
| `/api/ai/improve-card` | POST | suggestions for editing an existing flashcard |

Each AI handler: check the User has an active paid Subscription **and** AI
allowance remaining → run the Mastra/OpenRouter workflow with only the invoked
content (D14) → debit the AI allowance. Return `402`-style errors for missing
entitlement or exhausted allowance.

Error convention: handlers return `{ error: string }` with non-2xx status;
`lib/api.ts` throws for non-2xx.

## 6. Execution phases

Commit after each phase. Phase gates must pass before moving on.

### Phase 0 — Scaffold the Next.js app at the repo root

1. Scaffold into the repo root:
   `bunx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-bun --yes` (latest stable Next; move conflicting root files aside temporarily and restore them afterwards).
2. Add runtime deps with `bun add`: `@base-ui/react`,
   `@dagrejs/dagre`, `@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono`,
   `@fontsource-variable/source-serif-4`, `@tanstack/react-query`,
   `@tanstack/react-virtual`, `@tiptap/*` (core, extension-image, extension-placeholder,
   markdown, pm, react, starter-kit), `@xyflow/react`, `@supabase/supabase-js`,
   `@supabase/ssr`, `class-variance-authority`, `clsx`, `drizzle-orm`, `fflate`,
   `fzstd`, `lucide-react`, `pg`, `react-markdown`, `remark-gfm`, `tailwind-merge`,
   `ts-fsrs`, `tw-animate-css`, `zod`, `@polar-sh/sdk` (or Polar's checkout/webhook
   package),
   `@mastra/core` (or the Mastra packages the AI features need), plus the
   OpenRouter SDK/HTTP client. Dev deps: `drizzle-kit`, `vitest`, `@types/pg`, `@playwright/test`.
3. Port `DESIGN.md` tokens into `src/styles/` (flexoki CSS); port the fontsource
   imports; add `public/theme-init.js` + favicon.
4. `vitest.config.ts` (environment node, `src/lib/services/**/*.test.ts` include,
   per `docs/testing.md`).
5. App `package.json` scripts ARE the repo scripts: `dev`, `build`, `start`,
   `typecheck`, `lint`, `test`, `test:e2e`, `db:generate`, `db:migrate`.
   Run `bun install` so `bun.lock` exists.
6. **Gate**: `bun run dev` renders the shell; `bun run typecheck` green.

### Phase 1 — Postgres data layer + async services

1. `src/db/schema.ts` per §4 (all `userId`, `jsonb`, epoch-ms `bigint`), plus
   `users` table keyed to `auth.users.id`, and billing/AI-usage tables (Supabase
   Auth's `auth` schema stays managed).
2. `drizzle.config.ts` (postgres dialect); first migration:
   `bun run db:generate --name=account_initial_schema`. Review the SQL.
3. `src/lib/db.ts`: `pg` Pool + drizzle; `DATABASE_URL` from env.
4. Implement every service in §4 in `src/lib/services/`, honoring the ADR
   contracts. `ServiceContext = { userId: string; db }`.
5. `src/test/db.ts`: fresh schema per suite against `DATABASE_URL_TEST`.
   `docs/testing.md` discipline applies.
6. **Gate**: `bun run test` green. Postgres for dev/tests: a **Supabase** project
   (dashboard or `supabase` CLI). Use the pooler connection string for
   `DATABASE_URL`; create a separate database for `DATABASE_URL_TEST` (direct
   connection) so test-suite schema resets don't touch dev data.

### Phase 2 — Supabase Auth

1. `src/lib/auth.ts` (Supabase SSR server client): email/password **and**
   Google/GitHub OAuth, session cookie via `@supabase/ssr` (D4).
2. `(auth)/sign-in` + `(auth)/sign-up` client pages (Base UI components, Flexoki styles).
3. Auth guard: `(study)/layout.tsx` checks session server-side; `app/api/**`
   handlers use `lib/session.ts`.
4. **Gate**: signup (email + OAuth) → session cookie → `(study)` pages accessible;
   unauthenticated `/api/*` returns 401.

### Phase 3 — Route handlers + client API

1. Implement all study endpoints from §5. Multipart endpoints use
   `request.formData()`. Export returns the zip as a `Response`; restore writes
   into the User's Study Space.
2. `lib/api.ts` typed client + `lib/query.ts`.
3. `(study)/layout.tsx` client component with the provider stack
   (QueryClientProvider, ThemeProvider, ToastProvider, KeybindingsProvider).
4. **Gate**: an authenticated browser session can list/create decks via the API.

### Phase 4 — UI port

Route mapping (all client components, `"use client"` at the top):

| Route | File |
|---|---|
| `/` | `src/app/page.tsx` |
| `/browse` | `src/app/browse/page.tsx` |
| `/deck/[deckId]` | `src/app/deck/[deckId]/page.tsx` |
| `/deck/[deckId]/graph` | `src/app/deck/[deckId]/graph/page.tsx` |
| `/deck/[deckId]/review` | `src/app/deck/[deckId]/review/page.tsx` |
| `/review` | `src/app/review/page.tsx` |
| `/cram` | `src/app/cram/page.tsx` |
| `/settings` | `src/app/settings/page.tsx` |
| `/settings/billing` | `src/app/settings/billing/page.tsx` |

1. Build `components/` per `DESIGN.md` (Base UI, Flexoki, keyboard-first).
   Keybindings per ADR 0015/0016; dialogs keep static action labels (ADR 0013).
2. Implement review, cram, browse, graph canvas, settings, keybindings UI.
3. Graph worker via `new Worker(new URL("./graph-layout.worker.ts", import.meta.url))`.
4. **Gate**: full manual walkthrough — decks CRUD, browse filters, review
   rate/undo, cram, graph edge add/remove + layout, settings save, keybindings.
   `bun run lint` green.

### Phase 5 — Media, import, export, restore

1. `media.ts` → Supabase Storage: `storage.from(bucket).upload()` under
   content-hashed keys (`{userId}/{sha256}` — keeps ADR 0014 content-addressing);
   `GET /api/media/[ref]` 302s to a signed URL (private bucket, never public).
2. Anki import via native file input → `/api/import/anki/analyze` + `/commit`.
3. Export: browser download of the zip; Restore: file input → upload → import
   into the User's Study Space.
4. **Gate**: image attaches to a flashcard and renders (incl. image occlusion);
   Anki `.apkg` import works; export → restore roundtrip in a second account.

### Phase 6 — Billing (Polar.sh)

1. `lib/billing/`: Polar.sh client; `POST /api/billing/checkout` creates a
   checkout session; `POST /api/billing/webhook` handles subscription lifecycle
   events (created/updated/canceled) and writes the `subscriptions` row.
2. `(billing)`/`settings/billing` UI: current Plan, upgrade button, allowance meter,
   customer portal link.
3. Entitlement helper: `isPaid(userId)` + `aiAllowanceRemaining(userId)`.
4. **Gate**: sandbox checkout → webhook flips the User to paid; allowance meter
   reflects debits; cancel lapses entitlement.

### Phase 7 — AI features (OpenRouter + Mastra)

1. `lib/ai/`: Mastra workflows for the three features (ADR 0003):
   generate-cards, explain, improve-card. Content scoping per ADR 0004 (only the
   invoked card/deck content in the prompt). Zod-validated inputs/outputs.
2. AI routes from §5 with entitlement + allowance checks and debits.
3. Card generation drafts → User edits → saves through the creation chokepoint
   (ADR 0009).
4. **Gate**: each feature runs against OpenRouter in dev; allowance decrements;
   a free User gets a clear upgrade prompt.

### Phase 8 — Tests

1. Unit: all service suites green. AI features tested with a stubbed
   OpenRouter seam (per `docs/testing.md`).
2. E2E: `playwright.config.ts` for `next start`; seed a test account; port the
   critical journeys (signup → create deck → create flashcard → review session →
   graph edge → settings), plus a billing upgrade flow against a sandbox.
3. **Gate**: `bun run test && bun run test:e2e && bun run typecheck && bun run lint` green.

### Phase 9 — Deploy

1. Vercel env: **Supabase** Postgres `DATABASE_URL` (pooler), `SUPABASE_URL`,
   `SUPABASE_ANON_KEY` (or `SERVICE_ROLE_KEY` server-side), storage bucket name,
   Polar.sh API key + webhook secret, OpenRouter API key. `db:migrate` wired into
   the deploy path (idempotent, once per environment).
   Set the Vercel project's **Install Command to `bun install`** (D11).
2. Polar.sh: configure the product ($5/mo) and the webhook endpoint.
3. **Gate**: `bun run typecheck && bun run lint && bun run test && bun run test:e2e`; clean `git status`; production deploy smoke test.

## 7. Hazards & gotchas (executor checklist)

- **Drizzle dialect**: `pgTable`, `bigint` epoch-ms, `jsonb`, boolean stays. Do
  not silently change column semantics (D10).
- **Next 15/16**: server components receive `params`/`searchParams` as Promises;
  client pages use `useParams()`/`useSearchParams()` (sync). Route handlers are
  dynamic by default — do not mark data routes static.
- **No `window` at module scope** in any client component (SSR). `theme-init.js`
  stays in `public/` and loads in `<head>` before hydration.
- **Workers**: `new Worker(new URL(...))` — do not import the worker module
  statically.
- **Vercel**: no native modules remain; `pg` is fine serverless. Bump `maxDuration`
  on heavy routes (anki import, AI generation) if needed. Migrations must be
  idempotent and run before traffic.
- **Supabase**: `auth` schema is managed — never migrate or edit it. Scope every
  study row by `userId` (`auth.users.id`). Serve media through signed URLs from a
  private bucket; use the direct connection for migrations/tests and the pooler
  for the app.
- **bun everywhere**: commit `bun.lock`; never `npm install` (D11).
- **AI cost control**: every AI route must check entitlement and allowance **in
  one place**; never debit after generating. Keep the OpenRouter seam mockable
  (D14, `docs/testing.md`).
- **Polar webhooks**: verify the webhook signature; make subscription updates
  idempotent (Polar may retry).
- **`zod` v4** stays.
- **Keybindings**: per-User overrides (ADR 0016); settings UI stores a diff, not
  a snapshot.
- **Do not hand-edit generated migrations** unless required; pass `--name`
  (snake_case) every time per `docs/migrations.md`.

## 8. Acceptance criteria (definition of done)

1. `bun run typecheck && bun run lint` green at repo root; `bun run test` green; `bun run test:e2e` green.
2. Fresh signup (email and OAuth) can: create decks, create flashcards (basic,
   cloze, image occlusion), attach media, wire prerequisite edges on the canvas,
   review a session with rate/undo, cram, browse with filters, change settings
   and keybindings.
3. Free tier: every study feature works with no gating; a media-storage quota is
   enforced. Paid plan ($5/mo via Polar.sh): AI features work, AI allowance
   meters and debits correctly; a canceled subscription lapses entitlements.
4. Anki `.apkg` import works; export downloads a zip; restore in a second
   account round-trips.
5. AI sends only the invoked content to the model (D14); a free User sees an
   upgrade prompt instead of AI.
6. Unauthenticated access to any `/api/*` or `(study)` route redirects/401s.
7. No `electron`, `better-sqlite3`, `window.armin`, or `arminShell` references
   remain; the repo root is the Next.js app with no npm workspaces (D8).
8. `bun.lock` is the only lockfile; every command runs via `bun run` (D11).
9. Deploy live on Vercel with Supabase (Postgres + storage + auth) + Polar.sh + OpenRouter wired.

## 9. Out of scope

- Data migration from existing desktop profiles (D9 — fresh start).
- External MCP protocol, API keys, agent integrations (D6).
- Offline/PWA support, sync between devices, multiple study spaces per User,
  teams/orgs/seats/shared study spaces.
- An "unlimited AI" promise, AI on the free tier, or a free trial (D12/D13).
- Renderer unit tests, numeric coverage targets (per `docs/testing.md`).
