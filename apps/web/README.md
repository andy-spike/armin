# @armin/web

The Armin web app: TanStack Start with React, Base UI, and the desktop app's
ported interface, backed by the Convex deployment in `packages/backend`. It is
online-only. Every read and write goes through authenticated Convex functions;
the Start server only renders the document shell and serves these same-origin
routes:

- `/api/auth/*` — proxies Better Auth to Convex, so the session cookie is
  first-party.
- `/media/<sha256>.<ext>` — private images. The route exchanges the session
  cookie for a Convex token and forwards to the backend's authenticated media
  route, which checks the image belongs to the caller's library.
- `POST /media/upload` — forwards authenticated image bytes to Convex for validation
  and storage. Clients cannot attach an arbitrary storage ID.
- `/api/export/<id>` — downloads a finished library export the same way.

Study screens render on the client (`src/start.ts` disables SSR by default)
because they depend on the live Convex connection and browser-only editors.
The root and the signed-in frame opt back in, so the server sends the sidebar
and the opened page's loading skeleton, and the browser fills in the page.

## Develop

From the repository root, run `pnpm dev:setup` once, then `pnpm dev` to start
the web client and local Convex backend together. Setup creates this
checkout's local Convex deployment and copies its URLs into both clients while
preserving other local settings.

For separate terminals, run `pnpm dev:setup` first, then:

```bash
# 1. In one terminal, run the local backend and push on save.
pnpm --filter @armin/backend dev

# 2. In another, run the web app on http://localhost:3000.
pnpm --filter @armin/web dev
```

The main checkout uses port 3000 with strict-port checking. Agent worktrees get
an allocated port and `.localhost` hostname from `pnpm worktree:setup`; their
backend `SITE_URL` matches that origin. Open the exact URL printed by `pnpm dev`.
See [worktree environments](../../docs/dev-worktrees.md) for cookie isolation and
Google OAuth redirect registration.

## Build and run the production bundle

```bash
pnpm --filter @armin/web build   # client + SSR bundles in apps/web/dist/
pnpm --filter @armin/web start   # serves dist/ with `vite preview` on port 3000
```

The build emits `dist/client` and a fetch-handler server entry at
`dist/server/server.js`. `start` uses the TanStack Start Vite plugin's preview
server, which runs that entry locally. It is for checking a production build,
not a hosting setup: choose a deployment target (and its Start/Nitro adapter)
when the host is selected.

## Checks

```bash
pnpm check
pnpm --filter @armin/web build
```

This migration deliberately adds no unit, integration, or E2E suites for the
web app. Verify behavior by running the app; see the walkthrough record in
[`docs/qa/`](../../docs/qa/).
