---
name: setting-up-worktrees
description: Set up, run, reset, and clean up an isolated Armin dev environment in the main checkout or a T3 Code worktree. Use when starting work in a new worktree, when `pnpm worktree:setup` or `pnpm dev` fails, when ports, origins, or sign-in break between checkouts, when mobile can't reach the backend, or after merging a branch.
---

# Setting up Armin worktrees

Every checkout (main or worktree) runs its own local Convex deployment with its own ports, web origin, and sample library. Development never uses Convex cloud. No Convex login is needed.

| Checkout | Web port | Expo | Convex API / HTTP | Origin                                   |
| -------- | -------- | ---- | ----------------- | ---------------------------------------- |
| Main     | 3000     | 8081 | 3210 / 3211       | `http://localhost:3000`                  |
| Worktree | 4100+    | next | next two          | `http://<branch>.armin.localhost:<port>` |

## Set up

1. In a worktree, T3's **Set up worktree** action runs `pnpm worktree:setup`. If it failed, run it yourself and fix the diagnostic. In the main checkout, run `pnpm dev:setup` once.
2. Setup installs dependencies, starts the backend, pushes functions, sets `SITE_URL`, `MOBILE_TRUSTED_ORIGINS`, `BETTER_AUTH_SECRET`, and `CONCEPT_GENERATOR_FAKE`, writes client URLs, seeds the library, and stops the backend. It is repeatable and never resets data, passwords, or reviews. `pnpm worktree:seed` retries an interrupted seed.
3. Run `pnpm dev` (or `pnpm dev:web`, `pnpm dev:backend`, `pnpm dev:mobile`). Open the exact URL it prints, not `localhost`.
4. Sign in with `test@example.com` / `armin1234` (also in `.armin/demo-account.json`). Setup grants it complimentary Pro. To test the free plan:

   ```bash
   pnpm --filter @armin/backend exec convex run billing:setComplimentaryPro '{"email":"test@example.com","enabled":false}'
   ```

   Rerunning setup turns Pro back on.

Keep `.armin/`, `.env.local`, and `.convex/` out of commits. Commit regenerated Convex and route files. `convex run` and `convex env` from `packages/backend` work only while the backend runs.

## Requirements

- Vite+ CLI (`vp`) so Node 24 comes from `.node-version`. The backend accepts only Node 20, 22, or 24; setup stops on 26. Move the Vite+ shims ahead of other version managers on `PATH`.
- The first run downloads the backend binary into `~/.cache/convex`.

## Isolation rules

- `packages/backend/.env.local` selects the deployment (`CONVEX_DEPLOYMENT=anonymous:anonymous-agent`, `CONVEX_URL=http://127.0.0.1:<port>`). Never copy another checkout's `.env.local` or `.armin`. Unset shell-level Convex selection variables.
- **Ports:** blocks of four (4100, 4110, …) are reserved under Git's common directory until the worktree is removed. If a reserved port is taken, stop that process and retry. If setup was killed holding `armin-environments.lock`, confirm no setup runs, then delete that directory from Git's common directory.
- **Origins:** the hostname is the branch without `t3/`, lowercased, non-alphanumerics as hyphens, cut to 63 characters (a detached checkout uses its directory name); collisions get a short ID. T3 renames branches after setup, so launchers recompute the origin at each start. Restart `pnpm dev` and sign in again after a rename. Non-Chromium browsers need `.localhost` mapped to `127.0.0.1`.
- **Mobile:** setup writes mobile URLs with this machine's LAN IPv4 address. Override with `ARMIN_DEV_HOST=<address>` and rerun `pnpm --filter @armin/backend dev:clients`, also after the address changes. If the network blocks LAN traffic, set `ARMIN_DEV_HOST=127.0.0.1` and `adb reverse` the Expo and both Convex ports. SecureStore keys use only the hostname, so sign in again after switching checkouts. Each emulator runs one Expo app at a time.
- **JWKS:** setup copies the Better Auth signing keys into the `JWKS` variable to avoid token-verification stalls. It holds private keys: never commit it or paste it into issues, PRs, or QA artifacts. After rotating keys, remove the variable and rerun setup.

## Optional services

- **Email and Google:** seeding verifies the test account without either. For real email, set `RESEND_API_KEY` (and optionally `EMAIL_FROM`) with `pnpm exec convex env set` from `packages/backend` while `pnpm dev` runs. For Google, also set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` and register `${SITE_URL}/api/auth/callback/google` with Google. Google may reject loopback hostnames.
- **Concept cards:** setup sets `CONCEPT_GENERATOR_FAKE=true` unless already set, so cards fill with numbered sample exercises for free. `false` reports them unavailable. For a real model, set `AI_GATEWAY_API_KEY`, `AI_GATEWAY_MODEL`, and `CONCEPT_GENERATOR_FAKE=false`. Setup copies no secrets or user data between checkouts; report credential file locations, never contents.
- **Polar sandbox payments:** see [references/polar-sandbox.md](references/polar-sandbox.md).

## Reset

Data lives in `packages/backend/.convex/local/default/` and goes with the worktree. To reset one checkout, stop `pnpm dev`, then:

```bash
rm -rf packages/backend/.convex/local .armin/dev.json packages/backend/.env.local
pnpm dev:setup
```

## Clean up after a merge

1. Confirm the changes are in `master` (use the merged PR for squash or rebase).
2. Stop the worktree's dev servers and keep any uncommitted or untracked work.
3. From the main checkout, run `git worktree remove <path>` unless asked to keep it. Keep the branch unless asked to delete it.
4. Check `git worktree list` no longer shows it, and report the result.

Open a PR against `master` only when asked. Never push to `master`.
