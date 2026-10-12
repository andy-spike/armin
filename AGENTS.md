# AGENTS.md

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (`andy-spike/armin`) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context monorepo. `CONTEXT-MAP.md` at the repo root indexes each context's
own `CONTEXT.md` and `docs/adr/` (e.g. the study domain under `apps/desktop/`).
System-wide decisions live in the root `docs/adr/`. See `docs/agents/domain.md`.

## Notes

- The project context is described in @README.md . Always read the file when starting a new session.
- The repository is a pnpm + Turborepo monorepo (see `docs/adr/0002-pnpm-workspaces-with-turborepo.md`). The desktop app lives in `apps/desktop/`, the Expo mobile app in `apps/mobile/`, the shared platform-agnostic study domain in `packages/core/` (`@armin/core`), and `apps/sync-server/` is a placeholder. Keep project-specific scripts in each workspace package; from the repo root, run `pnpm typecheck`, `pnpm lint`, and `pnpm test` for every workspace, and `pnpm --filter ./apps/desktop <script>` for desktop scripts. Run the desktop release script as `pnpm --filter ./apps/desktop run publish`: bare `publish` is a built-in pnpm command.
- Before changing the mobile app's dependencies or native setup, read `apps/mobile/README.md` for the Expo Go workflow and shared-core runtime requirements.
- Use pnpm, never npm or yarn. Don't commit `package-lock.json`.
- Put code in `packages/core/` only when it is free of Electron, Node, and database-driver APIs, so every client can run it.
- Testing philosophy and validation tiers are described in @apps/desktop/docs/testing.md . Read it before adding or changing tests.
- Migration workflow is described in @apps/desktop/docs/migrations.md . Read it before changing @packages/core/src/schema.ts or files under @apps/desktop/drizzle/ .
- Migration names must be descriptive. Pass a snake_case `--name` to Drizzle instead of accepting generated fantasy names.
- Shadcn uses Base UI instead of Radix UI. Use only Base UI, unless the user explictly asks to use the Radix UI API.
- Dialog action buttons keep a static label. Show "running" with the `busy` prop on `Button`, never by swapping the label to a busy verb ("Deleting…"), which flashes during the dialog's close animation. See @apps/desktop/docs/adr/0016-dialog-action-labels-stay-static.md .

## TypeScript styling notes

- Don't use return types unless they are needed for a shared library.
