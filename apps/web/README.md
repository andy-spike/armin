# @armin/web

The Armin web app: TanStack Start, React, and Base UI, backed by the Convex deployment in `packages/backend`. It is online-only: every read and write goes through authenticated Convex functions. The Start server renders the document shell and serves these same-origin routes:

- `/api/auth/*`: proxies Better Auth to Convex, so the session cookie is first-party.
- `/media/<sha256>.<ext>`: private images. Exchanges the session cookie for a Convex token and forwards to the backend's media route, which checks the image belongs to the caller's library.
- `POST /media/upload`: forwards authenticated image bytes to Convex for validation and storage.
- `/api/export/<id>`: downloads a finished library export.

Study screens render on the client (`src/start.ts` disables SSR by default). The root and signed-in frame opt back in, so the server sends the sidebar and loading skeleton.

## Develop

From the repository root, run `pnpm dev:setup` once, then `pnpm dev` to start the web client and local Convex backend. Or use two terminals after setup:

```bash
pnpm --filter @armin/backend dev   # local backend, pushes on save
pnpm --filter @armin/web dev       # http://localhost:3000
```

The main checkout uses port 3000. Agent worktrees get an allocated port and `.localhost` hostname from `pnpm worktree:setup`; open the exact URL `pnpm dev` prints. See the `setting-up-worktrees` skill.

## Build and deploy

```bash
pnpm --filter @armin/web build   # bundles in apps/web/dist/
pnpm --filter @armin/web start   # serves dist/ on port 3000
```

Production deploys to Cloudflare Workers; see the `deploying-to-cloudflare` skill.

## Checks

Run `pnpm check` and `pnpm --filter @armin/web build`. There are no test suites; verify by running the app.
