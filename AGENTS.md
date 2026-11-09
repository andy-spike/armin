# AGENTS.md

Armin is a spaced-repetition flashcard app. It's a pnpm monorepo with `apps/web` (TanStack Start), `apps/mobile` (Expo), `packages/backend` (Convex + Better Auth), and `packages/core` (shared study logic, no Node or database APIs). Read a workspace's README only when the task needs it. `packages/core/CONTEXT.md` defines the domain terms.

- Use pnpm. Run the app with `pnpm dev` and sign in as `test@example.com` / `armin1234`.
- Run `pnpm check` before finishing. Don't add test suites.
- Work on the branch you were given. Never push to `master`, and open a PR only when asked.
- UI: use the shadcn Base UI primitives in `apps/web/src/components/ui/` (no Radix), and use `Tooltip` instead of `title`. Don't write return types.
- Backend: ownership comes from the session's library. Clients import only `@armin/backend/api` and `@armin/backend/types`.
- If your change makes a doc wrong, fix the doc in the same change.
