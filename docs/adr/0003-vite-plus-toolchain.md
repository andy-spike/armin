# Vite+ is the toolchain for formatting, linting, type checks, and tasks

_Supersedes the Turborepo, ESLint, and Prettier parts of ADR 0002. pnpm
workspaces and `nodeLinker: hoisted` stay._

Armin ran four separate tools: ESLint 8 for linting, Prettier for formatting
(never enforced in CI), `tsc --noEmit` in every workspace through Turborepo, and
Turborepo again for the parallel dev launcher. We replaced them with
[Vite+](https://viteplus.dev) 1.4, one CLI (`vp`) that bundles Oxlint, Oxfmt,
tsgolint, Vite, and a task runner, configured from one root `vite.config.ts`.

Before switching we measured the risks on this repository:

- **Type checks.** `vp check` type checks with tsgolint, which runs on the
  TypeScript 7 (Go) toolchain, while the workspaces install TypeScript 5.9 and
  6.0. All four workspaces passed under TypeScript 7 with no errors, and a
  planted type error in each workspace was reported, so every package's own
  `tsconfig` (including the web `@/` alias) is honoured.
- **Lint parity.** Oxlint with ESLint's previous rule set found one issue that
  ESLint missed, in 0.6s against ESLint's 11s.
- **Web build.** The Cloudflare and TanStack Start plugins build unchanged on
  Vite+'s bundled Vite (8.3), reached through a pnpm catalog override that
  points `vite` at `@voidzero-dev/vite-plus-core`.

Consequences:

- `pnpm check` (`vp check`) formats-checks, lints, and type checks the whole
  workspace in about four seconds; CI's `Verify` job runs it in place of
  separate lint and typecheck steps. `pnpm lint`, `pnpm format`, and
  `pnpm typecheck` remain as shortcuts over `vp`. Workspaces no longer carry a
  `typecheck` script. The Convex CLI still type checks backend functions with
  `tsc` on push, and editors keep each workspace's TypeScript.
- Lint and format settings live only in the root `vite.config.ts`; package-level
  `lint` or `fmt` blocks are not used. Oxlint enforces its correctness rules,
  including React, React Hooks, and jsx-a11y, as errors. `react/refs` and
  `react/set-state-in-effect` reported as warnings until the existing findings
  were refactored; they are now errors, and the two remaining exceptions (the
  Markdown editor's source-mode switch, which needs the mounted TipTap parser)
  carry inline disables with their reason. Rules that conflict with deliberate patterns
  (dialog `autoFocus`, `role="status"`) and React Compiler-only rules are off.
- Oxfmt formats with its defaults (100-column lines), and skips generated Convex
  and route files, `docs/qa` evidence, and vendored skills whose content is
  hashed in `skills-lock.json`.
- `vp env` selects Node from `.node-version`; `mise.toml` and `.nvmrc` are gone.
  `pnpm-workspace.yaml` sets `runtimeOnFail` and `pmOnFail` to `ignore` so pnpm
  doesn't fight it. CI installs through `voidzero-dev/setup-vp`, pinned to a
  release commit.
- `pnpm dev` runs Convex and the web app with `vp run --parallel`. `vp run`
  doesn't pass a signal it receives on to its tasks, so the launcher starts it in
  its own process group and signals the group.
- No commit hooks run; CI is the gate.
- There are no test suites, so the no-op `pnpm test` task was removed.
