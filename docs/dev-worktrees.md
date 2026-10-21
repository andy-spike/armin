# Local development environments

Every checkout, the main one and each T3 Code worktree, runs its own **local
Convex deployment**: the open-source Convex backend that `convex dev` downloads
and runs on this machine. Development never uses Convex cloud deployments;
production stays on Convex cloud. Each checkout also gets a web origin, web
port, Expo port, two Convex ports (API and HTTP actions), and a sample library.

The main checkout uses web port 3000, Expo port 8081, and Convex ports 3210/3211
with origin `http://localhost:3000`. Worktrees get a reserved block of four ports
and an `armin-<id>.localhost` origin.

## Requirements

- Node 20, 22, or 24 on `PATH`. The repository pins 24 in `.nvmrc`. The local
  backend runs `"use node"` actions with that Node and rejects other majors, so
  setup stops early on Node 26. With mise: `mise exec node@24 -- pnpm dev:setup`.
- No Convex login or network access to Convex cloud. Setup creates an anonymous
  local deployment (`CONVEX_AGENT_MODE=anonymous`), so no team, project, or
  account limits are involved. The first run downloads the backend binary into
  `~/.cache/convex`.

## T3 Code setup

The project's **Set up worktree** action runs `pnpm worktree:setup` automatically
when T3 creates a worktree. It installs the pinned dependencies, starts the
checkout's local backend, pushes functions, sets `SITE_URL`,
`MOBILE_TRUSTED_ORIGINS`, and `BETTER_AUTH_SECRET`, writes client URLs, seeds the
sample library, and stops the backend again. **Start dev** runs `pnpm dev`; **Start
mobile** runs `pnpm dev:mobile` in another terminal. In the main checkout, run
`pnpm dev:setup` once instead; it follows the same steps.

These commands must exist in the commit used to create the worktree. T3's action
settings are machine/app settings; another machine must register the same actions.

## Agent workflow

1. Work inside the checkout T3 assigned. Wait for setup to finish. If it failed,
   run `pnpm worktree:setup` there and address its diagnostic.
2. Run `pnpm dev`. The launcher prints this checkout's web URL and deployment
   local Convex URL. Use that exact URL for browser checks. `pnpm dev:web` and
   `pnpm dev:backend` also work individually.
3. Use `test@example.com` with password `armin1234` for the development test
   account. Setup also writes these credentials to `.armin/demo-account.json`.
   Each local deployment has its own account and library with this same login.
   Sign in through the normal app. Each library starts with basic, cloze, and
   typed-answer cards, plus a prerequisite that locks one card. The seed is an
   operator CLI script, with no fixture endpoint in the deployed application.
4. Make changes and run the validation required by `AGENTS.md`. Record app
   walkthroughs under `docs/qa/`. Commit regenerated Convex and route files when
   they change. Keep `.armin/`, `.env.local`, and `.convex/` out of commits.
5. Open the PR against `master`. Bring the PR up to date with `master` and wait
   for the required `Verify` check to pass before merging through GitHub. Direct
   pushes and local Worktrunk merges into `master` are not part of this workflow.
   Retain the task branch and worktree unless cleanup is requested. Stop
   servers with Ctrl+C before removing the worktree. Code merges through Git;
   fixture accounts, data, and environment variables stay in the local deployment.

Setup is repeatable. It reuses the selected deployment and local port allocation;
it does not reset sample data, passwords, edits, or reviews. Existing deployments
created with a random demo login get a separate account with the shared test login
on the next seed run; the original account and its data remain available. `pnpm worktree:seed`
retries an interrupted sample initialization. It does nothing after initialization
has finished, including when you intentionally delete the sample deck.

## Data and cleanup

A checkout's deployment data lives inside the checkout, in
`packages/backend/.convex/local/default/` (SQLite database, file storage, and
admin key). It does not expire. Removing the worktree deletes it, and the next
setup in any checkout frees its port reservation. To reset one checkout's data,
stop `pnpm dev`, then run:

```bash
rm -rf packages/backend/.convex/local .armin/dev.json packages/backend/.env.local
pnpm dev:setup
```

Setup allocates the same ports again and seeds a fresh sample library.

The local backend runs only while `pnpm dev` (or `pnpm dev:backend`) is running.
Direct CLI commands such as `pnpm exec convex env list` or `convex run` from
`packages/backend` need it running too.

Checkouts set up for the old cloud dev deployments are rejected with a message.
In a worktree, start a fresh one. In the main checkout, `pnpm dev:setup` moves the
old cloud selection to `packages/backend/.env.local.cloud-backup` and switches to
a local deployment; cloud data is not copied.

## Isolation details

The selected deployment lives in `packages/backend/.env.local`
(`CONVEX_DEPLOYMENT=anonymous:anonymous-agent`, `CONVEX_URL=http://127.0.0.1:<port>`).
Every checkout uses the same anonymous name, but its state directory is
checkout-local, so deployments never share data. Client URL files are generated
from the backend file. Copying another checkout's `.env.local` or `.armin` is not
supported.

The root launchers check the checkout's state file and that the backend
selection is its own local deployment on its own port before starting services.
Shell-level Convex selection variables must be unset. This prevents accidental
cross-deployment pushes; it is not an OS sandbox.

Port blocks are reserved under Git's common directory with a setup lock. Separate
worktrees reserve different blocks, and allocation also checks for listeners. A
later unrelated process can still take a reserved port; Vite's strict-port check
then fails visibly instead of silently moving the app. Stop that process and
retry. If setup was killed while holding `armin-environments.lock`, verify that no
setup is running before removing that directory from Git's common directory.

Web origins use `armin-<id>.localhost:<port>`. Distinct hostnames isolate browser
cookies and local storage; different ports alone would share auth cookies. Open
the printed hostname, rather than substituting `localhost`. Chromium resolves
`.localhost` to loopback without a hosts-file entry. If another browser or resolver
does not, use Chromium for the walkthrough or configure that hostname to resolve
to `127.0.0.1`.

The local backend listens on all interfaces, so other devices on the LAN can
reach it. Setup writes the mobile URLs with this machine's LAN IPv4 address
(override with `ARMIN_DEV_HOST=<address>`, then rerun
`pnpm --filter @armin/backend dev:clients`). Rerun that command when the
machine's address changes. A physical phone on the same network and the
Android emulator both use that address. If the network blocks LAN traffic,
set `ARMIN_DEV_HOST=127.0.0.1` and `adb reverse` the Expo and both Convex ports
for an emulator or USB-connected Android device. A phone that cannot reach this
machine at all (for example, on cellular data) needs a cloud deployment, which
this workflow does not provision.

Mobile SecureStore keys include only the Convex hostname. Local deployments all
use this machine's address, so switching one device between checkouts' Expo
bundles reuses one stored session slot; sign in again after switching. Every emulator still
shows one Expo app at a time; for concurrent native interaction, assign separate
emulators. The `.localhost` web origin is for the host browser only.

## Email and Google sign-in

The synthetic account is verified by an operator component call during seeding,
so it needs no email service or Google login. Normal application verification
rules remain enabled for other accounts.

To exercise real email flows, set `RESEND_API_KEY` and optionally `EMAIL_FROM`
on the checkout's local deployment with `pnpm exec convex env set` from
`packages/backend` while `pnpm dev` runs. For Google, also set
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` and register the exact
`${SITE_URL}/api/auth/callback/google` redirect URI for the checkout's origin
with Google. Google provider policy may restrict acceptable loopback hostnames.
Setup cannot register OAuth redirect URIs for you.

Setup sets this deployment's `SITE_URL`, Expo trusted origins, and a session secret
when one is absent. It does not copy the main checkout's secrets or user data.
Treat demo credentials and the local admin key as local credentials; report
their file locations rather than pasting their contents into issues or PRs.

## References

- [Convex local deployments](https://docs.convex.dev/cli/local-deployments)
- [Convex agent mode](https://docs.convex.dev/cli/agent-mode)
