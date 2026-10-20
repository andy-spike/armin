# Agent worktree environments

Each T3 Code worktree gets a Convex cloud dev deployment, a deploy key scoped to
that deployment, a web origin, a web port, an Expo port, and a synthetic library.
The main checkout keeps its existing development deployment and port 3000.

## T3 Code setup

The project's **Set up worktree** action runs `pnpm worktree:setup` automatically
when T3 creates a worktree. It installs the pinned dependencies, provisions the
backend, initializes the sample library, and exits. **Start dev** runs `pnpm dev`
when you want to inspect the app. **Start mobile** runs `pnpm dev:mobile` in another
terminal. Long-running servers are deliberately separate from setup.

These commands must exist in the commit used to create the worktree. Merge this
setup into `master` before creating new task branches from it. T3's action settings
are machine/app settings; another machine must register the same actions. A fresh
machine also needs the pinned Node/pnpm versions and `pnpm --filter @armin/backend
exec convex login` once. Cloud provisioning requires network access and permission
to create development deployments in `andy-spike:armin`.

## Agent workflow

1. Work inside the checkout T3 assigned. Wait for setup to finish. If it failed,
   run `pnpm worktree:setup` there and address its diagnostic.
2. Run `pnpm dev`. The launcher prints this checkout's web URL and deployment
   reference. Use that exact URL for browser checks. `pnpm dev:web` and
   `pnpm dev:backend` also work individually.
3. Read `.armin/demo-account.json` locally for the synthetic email and password.
   Sign in through the normal app. Each library starts with basic, cloze, and
   typed-answer cards, plus a prerequisite that locks one card. The seed is an
   operator CLI script, with no fixture endpoint in the deployed application.
4. Make changes and run the validation required by `AGENTS.md`. Record app
   walkthroughs under `docs/qa/`. Commit regenerated Convex and route files when
   they change. Keep `.armin/`, `.env.local`, and `.convex/` out of commits.
5. Open the PR against `master`. After checks and review, merge normally. Stop
   servers with Ctrl+C before removing the worktree. Code merges through Git;
   fixture accounts, data, environment variables, and keys stay in the deployment.

Setup is repeatable. It reuses the selected deployment and local port allocation;
it does not reset sample data, passwords, edits, or reviews. `pnpm worktree:seed`
retries an interrupted sample initialization. It does nothing after initialization
has finished, including when you intentionally delete the sample deck.

Deployments expire five days after creation, including their data. Rerunning setup
does not extend that lifetime. For a longer task, extend the deployment lifetime
in Convex before expiry, or start a new worktree and environment. Removing a Git
worktree does not immediately delete its cloud deployment. Expiration bounds
retention without requiring agents to clean up cloud resources after a merge.
Cloud dev usage is subject to the team's Convex limits and billing.

## Isolation details

The deployment reference contains a hash of the absolute checkout path. The
selected deployment and scoped deploy key live only in
`packages/backend/.env.local`. Client URL files are generated from it. Setup
refuses a pre-existing backend selection without its matching ownership record;
copying another checkout's `.env.local` is not a supported bootstrap path.

The root launchers check the worktree's ownership record, selected deployment,
and scoped key before starting services. Shell-level Convex selection variables
must be unset. Direct CLI commands run from `packages/backend` use its scoped
key. This prevents accidental cross-deployment pushes with those commands; it
is not an OS sandbox for agents that already have your machine's credentials.

Port pairs are reserved under Git's common directory with a setup lock. Separate
worktrees reserve different pairs, and allocation also checks for listeners. A
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

Mobile SecureStore keys include the Convex hostname, so switching Expo bundles
does not replace another deployment's stored session. Existing installs need to
sign in once after this storage-prefix change. Every emulator still shows
one Expo app at a time. For concurrent native interaction, assign separate
emulators. On a physical phone, Metro needs LAN access to the printed Expo port;
the `.localhost` web origin is for the host browser only. Use the mobile README's
Expo Go and `adb reverse` instructions, substituting this worktree's Expo port.

## Email and Google sign-in

The synthetic account is verified by an operator component call during seeding,
so it needs no email service or Google login. Normal application verification
rules remain enabled for other accounts.

New cloud deployments inherit Convex project environment-variable defaults. To
exercise real email flows, configure development defaults for `RESEND_API_KEY`
and optionally `EMAIL_FROM`, or set them only on the current agent deployment.
For Google, also configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` and
register the exact `${SITE_URL}/api/auth/callback/google` redirect URI for the
worktree origin with Google. Google provider policy may restrict acceptable
loopback hostnames; use a separately configured development origin if necessary.
Setup cannot register OAuth redirect URIs for you.

Setup sets this deployment's `SITE_URL`, Expo trusted origins, and a session secret
when one is absent. It does not copy the main checkout's secrets or user data.
Treat demo credentials and deploy keys as local credentials; report their file
locations rather than pasting their contents into issues or PRs.

## References

- [Convex agent mode and T3 worktree setup](https://docs.convex.dev/cli/agent-mode#worktree-setups)
- [Convex deployment-scoped keys](https://docs.convex.dev/cli/deploy-key-types)
- [Convex project environment defaults](https://docs.convex.dev/cli/reference/env)
