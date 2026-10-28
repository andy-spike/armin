# AGENTS.md

## Start here

Read @README.md first. The repo is a pnpm monorepo on the Vite+ toolchain (`vp`):

- `apps/web` — TanStack Start web client
- `apps/mobile` — Expo mobile client
- `packages/backend` — Convex + Better Auth (`@armin/backend`)
- `packages/core` — portable study domain (`@armin/core`)

Never use npm or yarn, and don't commit `package-lock.json`.

## Git workflow

- Work on the branch and checkout the user names.
- Open a PR only when the user explicitly asks for one; otherwise leave the work in the checkout.
- Never push directly to `master`. A PR must be up to date and pass the required `Verify` check before merging through GitHub.
- Keep task branches and worktrees unless the user requests cleanup. Report deployment only when it is verified.
- In a worktree, read @docs/dev-worktrees.md before starting servers, pushing Convex code, or seeding data, and use `pnpm worktree:setup` plus the root `pnpm dev*` launchers.

## Validate

- `pnpm check` — format, lint, and typecheck across all workspaces. `pnpm format` fixes formatting. Lint and format settings live only in the root `vite.config.ts`; keep scripts in their workspace.
- For web, backend, or mobile changes also run `pnpm --filter @armin/web build`, the mobile bundle check, and a running-app walkthrough recorded under `docs/qa/`. Never describe an emulated viewport as a real device or browser.
- Add no new unit, integration, or E2E suites (user decision).

## Code rules

- Put code in `packages/core/` only when it is free of Electron, Node, and database-driver APIs.
- Components use Base UI, never Radix UI, unless the user explicitly asks for the Radix API.
- Dialog actions keep a static label; show progress with the `busy` prop on `Button`, never a busy verb like "Deleting…". See @packages/core/docs/adr/0016-dialog-action-labels-stay-static.md.
- Don't use return types unless a shared library needs them.
- Backend: read @packages/backend/README.md first. Ownership derives from the session's library, study writes stay in single Convex mutations, and clients import only `@armin/backend/api` and `@armin/backend/types`. Commit regenerated `packages/backend/convex/_generated` and `apps/web/src/routeTree.gen.ts`.
- Mobile: read @apps/mobile/README.md before changing dependencies or native setup.

## Docs and issues

- `CONTEXT-MAP.md` indexes each context's `CONTEXT.md` and `docs/adr/`; system-wide decisions live in the root `docs/adr/`.
- Issues are tracked in GitHub Issues (`andy-spike/armin`) via the `gh` CLI. Triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/`.
