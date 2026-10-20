> Historical document. The desktop app and old sync service were retired on
> 2026-10-20. Paths below describe the repository at the time of writing;
> consult README.md for the current web and mobile workspace layout.

# The monorepo uses pnpm workspaces with Turborepo and a shared core package

_Supersedes ADR 0001 (npm workspaces)._

Armin is growing from one desktop app into three deployables: the desktop app, a
mobile app, and a cloud sync server. Desktop and mobile must apply the same study
rules — the same schema, flashcard types, FSRS scheduling, and prerequisite
security — so that progress synced between them means the same thing on both.
That shared domain now lives in a Just-in-Time internal package, `@armin/core`
(`packages/core`), which exports TypeScript source that each app's bundler
compiles. Desktop imports it as `@armin/core/<module>`.

We moved from npm workspaces to **pnpm workspaces with Turborepo**. With several
workspaces, pnpm's strict dependency declarations stop one app from silently
relying on another's dependencies, and Turborepo runs `typecheck` and `test`
across every workspace in dependency order with caching.

ADR 0001 rejected pnpm because its symlinked `node_modules` breaks Electron's
native-module rebuild and packaging. We keep that working with
`nodeLinker: hoisted`, which gives pnpm the same flat `node_modules` layout npm
produced; React Native tooling needs the same setting. The lockfile was converted
with `pnpm import`, so every dependency kept its pinned version. One gap needed
a manual fix: npm nested vite 8 under vitest while Electron Forge keeps the desktop
build on vite 5, and pnpm resolves vitest's vite peer from the desktop app.
`.pnpmfile.cjs` turns that peer into vitest's own pinned dependency.

Consequences:

- Commands run through pnpm: `pnpm typecheck`, `pnpm lint`, and `pnpm test` from
  the root, and `pnpm --filter ./apps/desktop <script>` for desktop scripts.
  `publish` is a built-in pnpm command, so the desktop release script must be run
  as `pnpm --filter ./apps/desktop run publish`.
- Desktop lifecycle hooks such as `pretest` still rebuild better-sqlite3 for the
  right runtime; `enablePrePostScripts` keeps them running under pnpm.
- `@armin/core` holds only platform-agnostic code. Services that read or write a
  Profile database still live in `apps/desktop`, because they are typed against
  the better-sqlite3 Drizzle driver. Move them into core when a second client
  needs them.
- The schema moved to `packages/core/src/schema.ts`; the generated migrations
  stay in `apps/desktop/drizzle/` until the mobile app needs them.
- `apps/mobile` and `apps/sync-server` are README-only placeholders until their
  stacks are chosen. They get a `package.json` only when they have real
  dependencies: pnpm leaves a dependency-free project out of the lockfile, and
  `pnpm install --frozen-lockfile` then fails on the missing entry.
- Turborepo's managed `AGENTS.md` block is disabled (`agentGuidance: false`) so
  agent instructions stay hand-maintained.
