# Readable worktree URLs walkthrough (2026-11-09)

Fresh T3 worktree on branch `t3/readable-deterministic-worktree-urls`, desktop
Chromium via agent-browser, sample account `test@example.com`.

1. `pnpm worktree:setup` in the never-set-up worktree took the first free slot:
   web 4100, Expo 4101, Convex 4102/4103, and printed
   `http://readable-deterministic-worktree-urls.armin.localhost:4100`.
2. Renamed the branch to `t3/Rename_Test--Branch` and ran `pnpm dev`. The
   launcher printed the change
   (`… -> http://rename-test-branch.armin.localhost:4100`), and once the backend
   was up it set the deployment's `SITE_URL` to the new origin.
   `convex env get SITE_URL` and `apps/web/.env.local`'s `VITE_SITE_URL` both
   showed `http://rename-test-branch.armin.localhost:4100`.
3. Stopped `pnpm dev`, renamed the branch back, and started it again. The origin
   returned to `http://readable-deterministic-worktree-urls.armin.localhost:4100`
   and `SITE_URL` followed. The page answered HTTP 200.
4. Signed in at that origin with the sample account. Sign-in succeeded and the
   deck list showed the sample library with 3 units due
   ([screenshot](2026-11-09-readable-worktree-urls/signed-in-branch-origin.png)).

Not exercised: a worktree set up under the old hash scheme. Its saved ports are
kept and only its hostname changes on the next `pnpm dev`, by the same code path
as step 2.

## Review fixes

5. Added a temporary worktree on `t3/Readable_Deterministic_Worktree_URLs`,
   which maps to the same name. Each checkout then got its own suffixed label
   (`readable-deterministic-worktree-urls-b175a8` and `…-deadbe`). After the
   temporary worktree was removed, the plain label returned.
6. Started `pnpm --filter @armin/backend dev` with port 4102 held by another
   server. Convex reported the port conflict and the wrapper exited after 7
   seconds with no `SITE_URL` error, instead of polling for 5 minutes.
7. Restarted `pnpm dev`. The page answered HTTP 200 at
   `http://readable-deterministic-worktree-urls.armin.localhost:4100`, and
   `SITE_URL` matched.
