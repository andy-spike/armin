# AGENTS.md

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (`ansanabria/armin`) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo. The ubiquitous language lives in `CONTEXT.md` at the repo
root; all architectural decisions live in `docs/adr/`. See `docs/agents/domain.md`.

## Notes

- The project context is described in @README.md . Always read the file when starting a new session.
- This is a single Next.js app at the repo root (no monorepo, no `apps/` or `packages/`). Run everything with `bun run <script>` from the repo root; bun is the package manager (`bun.lock`, never `npm install`).
- Testing philosophy and validation tiers are described in @docs/testing.md . Read it before adding or changing tests.
- Migration workflow is described in @docs/migrations.md . Read it before changing @src/db/schema.ts or files under @drizzle/ . Drizzle is the sole owner of the `public` application schema and migration ledger; do not create Supabase migrations or use either tool's schema-push command.
- Migration names must be descriptive. Pass a snake_case `--name` to Drizzle instead of accepting generated fantasy names.
- Shadcn uses Base UI instead of Radix UI. Use only Base UI, unless the user explictly asks to use the Radix UI API.
- Dialog action buttons keep a static label. Show "running" with the `busy` prop on `Button`, never by swapping the label to a busy verb ("Deleting…"), which flashes during the dialog's close animation. See @docs/adr/0013-dialog-action-labels-stay-static.md .
- Payments run through Polar.sh (ADR 0002), AI features through OpenRouter + Mastra (ADR 0003), and study content goes to the model only per-invocation (ADR 0004). Free tier = all study features; paid plan = AI only (ADR 0005).

## TypeScript styling notes

- Don't use return types unless they are needed for a shared library.
