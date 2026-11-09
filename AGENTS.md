# AGENTS.md

Armin is a spaced-repetition flashcard app. It is a pnpm monorepo on the Vite+ toolchain (`vp`):

- `apps/web`: TanStack Start web client
- `apps/mobile`: Expo mobile client
- `packages/backend`: Convex + Better Auth
- `packages/core`: portable study domain, free of Electron, Node, and database-driver APIs

Each workspace's README has the details. Read one only when the task touches that area.

## Workflow

- Use pnpm, never npm or yarn.
- Work on the branch you were given. Open a PR only when asked, and never push to `master`.
- Run the app with `pnpm dev` (in a new worktree, run `pnpm worktree:setup` first) and open the URL it prints. Test login: `test@example.com` / `armin1234`.
- Commit regenerated `packages/backend/convex/_generated` and `apps/web/src/routeTree.gen.ts`.

## Validate

- `pnpm check` runs format, lint, and typecheck; `pnpm format` fixes formatting.
- Before a PR, also run `pnpm --filter @armin/web build` and `pnpm --filter @armin/mobile check:bundle`.
- Check UI changes in the running app. Don't add test suites.

## Code rules

- UI primitives in `apps/web/src/components/ui/` are shadcn components in their Base UI form. Don't use Radix.
- Use `Tooltip` from `components/ui/tooltip.tsx`, never the `title` attribute. Icon-only buttons get one.
- Dialog action labels stay static; show progress with the `busy` prop on `Button`.
- Don't write return types unless a shared library needs them.
- Backend ownership comes from the session's library. Clients import only `@armin/backend/api` and `@armin/backend/types`.
