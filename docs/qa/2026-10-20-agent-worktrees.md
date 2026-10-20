# Agent worktree environment verification

Verified on Linux with pnpm 12.4.1 and the pinned Convex 1.47.0 CLI. Two temporary
linked Git worktrees used independent frozen-lockfile dependency installations.
No production deployment or primary development data was copied or changed.

## Provisioning and persistence

- Worktree one selected `andy-spike:armin:dev/t3code/7e81b1bdfd`, cloud deployment
  `benevolent-nightingale-816`, web port 31474, and Expo port 31475.
- Worktree two selected `andy-spike:armin:dev/t3code/66389a2b84`, cloud deployment
  `superb-kangaroo-986`, web port 28324, and Expo port 28325.
- Both deployments were created with a five-day expiration and a saved,
  deployment-scoped dev key. No deploy key or demo password appears in this record.
- Both received their own `SITE_URL`, Expo trusted origins, session secret,
  generated client URL files, verified synthetic account, four sample cards,
  and one prerequisite edge. No new backend fixture endpoint was added.
- The full root `pnpm worktree:setup` command completed, including dependency
  installation. Repeated setup reused the deployment and ports and skipped
  reseeding. An extra deck created after setup remained after the next setup.
- Main-checkout worktree setup refused to provision. An inherited shell
  `CONVEX_DEPLOYMENT` caused the worktree launcher to refuse to start.

The first validation attempt shared dependencies through a symlink. pnpm rejected
that task-state directory, and a running Convex bundler stalled while the symlink
was replaced. Validation was repeated with real independent installs; both
backend pushes then completed. Shared `node_modules` is not part of the workflow.

## Web and data isolation

Both Vite servers ran concurrently with different ports and `.localhost`
hostnames. T3's Chromium preview opened the worktree origins. Sign-in through the
normal auth endpoint returned HTTP 200, and the rendered deck list showed the
sample library, four cards, and three due reviews.

Two tabs in the same browser profile signed into their respective demo accounts.
Signing out of worktree one left worktree two's session signed in. This verifies
cookie separation across the distinct hostnames.

Using authenticated Convex clients, deck counts started at `[1, 1]`. Creating an
isolation marker deck in worktree one changed the counts to `[2, 1]`. The counts
remained `[2, 1]` after repeating setup in worktree one.

## Android

Used T3's Device panel and agent-device on the Android 16 Pixel 7 emulator
`Armin_Pixel_7_API_36`, serial `emulator-5554`, running Expo Go. The root mobile
launcher selected port 28325; `adb reverse` forwarded that same port. Signed in
through the native form using the worktree two demo account. The native screen
showed its sample deck, four flashcards, three due reviews, and the first review
prompt. This was an Android emulator, not a physical phone. iOS simulators are
unavailable on this Linux host.

## Checks and cleanup

- `pnpm lint`: passed.
- `pnpm typecheck`: all seven workspace tasks passed.
- `pnpm --filter @armin/web build`: passed.
- `pnpm --filter ./apps/mobile check:bundle`: Android and iOS bundles passed.
- `git diff --check` and Node syntax checks for provisioning scripts: passed.
- Sending SIGTERM to the dev launchers stopped their child servers; all test
  ports were confirmed closed before removing the temporary checkouts.
- Temporary worktrees and their local credentials were removed after verification.
  Their cloud deployments retain the requested five-day expiration.
- T3 project actions were saved: automatic **Set up worktree**, manual **Start
  dev**, and manual **Start mobile**. Automatic invocation from a newly created
  T3 thread was not exercised; the full command was exercised in Git worktrees.
  The repository changes must be committed into a worktree's base before its
  creation hook can use them.

Google OAuth and real email delivery were not exercised. The synthetic account
requires neither integration. New deployments had no email or Google project
defaults; see `docs/dev-worktrees.md` for configuring those optional flows.
