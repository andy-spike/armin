# AGENTS.md

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (`andy-spike/armin`) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context monorepo. `CONTEXT-MAP.md` at the repo root indexes each context's
own `CONTEXT.md` and `docs/adr/` (e.g. the study domain under `packages/core/`).
System-wide decisions live in the root `docs/adr/`. See `docs/agents/domain.md`.

## Agent worktrees

Every repository change, including features, fixes, documentation, and configuration,
must be made on a task branch in a separate worktree managed by T3 Code. Before
editing, verify the current branch and checkout. If the session is on `master` or
in the main checkout, move the task to a T3 Code worktree before making changes.

Open a GitHub PR targeting `master`, the default branch and release source. Merge
through GitHub only after the required `Verify` check passes on an up-to-date PR
and any requested review is resolved. Never push directly to `master`, bypass its
protections, or merge a task into local `master` with Worktrunk. Keep the task
branch and worktree available unless the user requests cleanup. Treat production
deployment as a separate step and report it only when deployment is verified.

Before starting servers, pushing Convex code, or seeding data in a task worktree,
read `docs/dev-worktrees.md`. Use `pnpm worktree:setup` and the root `pnpm dev*`
launchers for the checkout's isolated deployment, URLs, ports, and sample account.

## Notes

- The project context is described in @README.md . Always read the file when starting a new session.
- The repository is a pnpm + Turborepo monorepo. The web client lives in `apps/web/`, the Expo mobile client in `apps/mobile/`, the Convex backend in `packages/backend/`, and the portable study domain in `packages/core/` (`@armin/core`). Keep project scripts in their workspace. Run root `pnpm typecheck`, `pnpm lint`, and `pnpm test` across workspaces.
- Before changing the mobile app's dependencies or native setup, read `apps/mobile/README.md` for the Expo Go workflow and shared-core runtime requirements.
- The web SaaS migration lives in `apps/web` (TanStack Start client) and `packages/backend` (`@armin/backend`, Convex + Better Auth). Read `packages/backend/README.md` before changing backend functions: every function derives ownership from the session's library, and study writes stay in single Convex mutations. Clients import only `@armin/backend/api` and `@armin/backend/types`. Commit regenerated `packages/backend/convex/_generated` and `apps/web/src/routeTree.gen.ts`.
- The web migration adds no new unit, integration, or E2E suites (user decision). Validate web/backend/mobile changes with `pnpm typecheck`, `pnpm lint`, `pnpm --filter @armin/web build`, the mobile bundle check, and a running-app walkthrough; record walkthroughs under `docs/qa/` and never describe an emulated viewport as a real device or browser.
- Use pnpm, never npm or yarn. Don't commit `package-lock.json`.
- Put code in `packages/core/` only when it is free of Electron, Node, and database-driver APIs, so every client can run it.
- Shadcn uses Base UI instead of Radix UI. Use only Base UI, unless the user explictly asks to use the Radix UI API.
- Dialog action buttons keep a static label. Show "running" with the `busy` prop on `Button`, never by swapping the label to a busy verb ("Deleting…"), which flashes during the dialog's close animation. See @packages/core/docs/adr/0016-dialog-action-labels-stay-static.md .

## TypeScript styling notes

- Don't use return types unless they are needed for a shared library.
