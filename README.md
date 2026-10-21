# Armin

Armin is a spaced-repetition flashcard app for web and mobile. Cards form a
prerequisite graph, and FSRS schedules reviews based on recall performance.

## Why it exists

Most flashcard apps treat every card as an independent atom of knowledge, meaning all cards always live in the same level of abstraction. In practice,
knowledge is a graph: some things are prerequisites for others. Armin makes that
structure explicit. A card stays **locked** until everything it depends on has been
learned, so you build foundations before tackling what sits on top of them. Once
unlocked, a card stays accessible even if a prerequisite is later forgotten;
FSRS continues scheduling that prerequisite for practice.

## Applications and shared code

- [`apps/web`](apps/web/README.md): TanStack Start web client.
- [`apps/mobile`](apps/mobile/README.md): Expo mobile client for the same backend.
- [`packages/backend`](packages/backend/README.md): Convex backend and Better Auth,
  with account-owned libraries, server-side scheduling, images, and ZIP export.
- [`packages/core`](packages/core): portable study types and rules.

The web app is in development and is not deployed publicly yet. The Electron
desktop app, its local MCP server, and the old sync service have been retired.
Their source and release tooling remain available in Git history.

## Development

Quick start from the repository root, using the pinned Node (24) and pnpm versions:

```bash
pnpm install --frozen-lockfile
pnpm dev:setup  # create a local Convex deployment, push, seed, write client URLs
pnpm dev        # web at http://localhost:3000 + local Convex backend
```

Development runs a **local Convex deployment** on this machine (Convex's
open-source backend, started by `convex dev`); no Convex login or cloud dev
deployment is needed. Production stays on Convex cloud. Setup sets `SITE_URL`,
the Expo trusted origins, and a session secret, and seeds a sample account
(`test@example.com` / `armin1234`). For real email or Google sign-in, set the
variables in [the backend README](packages/backend/README.md#deployment-environment-variables)
on the local deployment. Data lives in `packages/backend/.convex/local/`.

`dev:setup` refreshes only the Convex URL entries in the web and mobile
`.env.local` files, preserving other settings. To refresh those URLs without
pushing backend code, run `pnpm --filter @armin/backend dev:clients`.

Additional commands, each run from the root in its own terminal:

| Command            | Starts                                              |
| ------------------ | --------------------------------------------------- |
| `pnpm dev:mobile`  | Expo Go with a LAN QR code on port 8081             |
| `pnpm dev:android` | Expo Go and opens the Android emulator/device       |
| `pnpm dev:ios`     | Expo Go and opens the iOS simulator, requires macOS |
| `pnpm dev:web`     | Web client only, port 3000                          |
| `pnpm dev:backend` | Local Convex backend and watcher only               |

Keep `pnpm dev` running when using mobile; the local backend only runs while it
does. Mobile URLs use this machine's LAN address, so a phone on the same network
can connect; a phone that cannot reach this machine needs a cloud deployment.
Sign into mobile with the sample account or one created in the web app.
See [mobile setup](apps/mobile/README.md) for Expo Go, emulator, and networking
requirements. Stop each command with Ctrl+C;
Turborepo stops both watchers started by `pnpm dev`.

Make every repository change on a task branch in a T3 Code worktree, then open a
PR against `master`. GitHub requires the PR's `Verify` check to pass with the branch
up to date before merging, including for administrators. Direct pushes, force
pushes, and deletion of `master` are blocked. See
[agent worktree setup](docs/dev-worktrees.md) for isolated development environments.

`master` is the release source. Merging a PR does not currently deploy the app;
production hosting and deployment automation still need to be configured.

## Card-writing skill

Agents need guidance on how to structure flashcard content — how to chunk a topic, what belongs in a single card, or how cards
should depend on each other. The `writing-study-cards` skill provides those
guidelines, distilled from Andy Matuschak's
[How to write good prompts](https://andymatuschak.org/prompts/). Install it so your
agent applies them automatically whenever it generates cards.

The skill lives in [`.agents/skills/writing-study-cards`](.agents/skills/writing-study-cards)
and installs with the [`skills` CLI](https://www.skills.sh/docs):

```bash
# Install into the current project (auto-detects your agent)
npx skills add andy-spike/armin --skill writing-study-cards

# Or install globally so it's available across all projects
npx skills add andy-spike/armin --skill writing-study-cards --global
```

You can target a specific agent (for example Cursor, Claude Code, or Codex) with
`-a`, and preview what's available without installing using `--list`:

```bash
npx skills add andy-spike/armin --list
npx skills add andy-spike/armin --skill writing-study-cards -a cursor
```

The `skills` CLI discovers skills under `.agents/skills/`, so it picks up
`writing-study-cards` directly from this repository.

## Validation

Run `pnpm typecheck`, `pnpm lint`, `pnpm --filter @armin/web build`, and
`pnpm --filter @armin/mobile check:bundle`. Web, backend, and mobile changes use
running-app walkthroughs recorded in [`docs/qa/`](docs/qa/), without new automated
test suites. `pnpm test` remains the workspace task runner for test scripts.

## Contributions

Report bugs and feature requests in [GitHub Issues](https://github.com/andy-spike/armin/issues).
Code pull requests are not being accepted while the domain contracts stabilize.
See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and
[the code of conduct](CODE_OF_CONDUCT.md).
