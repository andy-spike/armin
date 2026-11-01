# Self-hosting on a public Azure VM

Date: 2026-11-01
Checkout: `t3/self-hosting-plan` at `2bd5b28`
Environment: Azure VM `Standard_B2als_v2` (2 vCPU, 4 GiB RAM, 30 GB SSD) in
Chile Central, Ubuntu 24.04 LTS, Docker Engine 29.9.2 and Compose 5.6.1 from
Docker's official apt repository. Public IP with ports 80/443 open to the
internet. Hostnames came from `sslip.io` (`cards.57-156-63-250.sslip.io` plus
`api.` and `actions.`), which resolve to the embedded IP. Headless Chromium
through agent-browser on a workstation, over the public internet.

This run covers what the [2026-10-29 local run](2026-10-29-self-hosting.md)
could not: real DNS, Let's Encrypt certificates, standard ports, and a
non-rootless Docker host. The branch isn't on GitHub yet, so step 2 cloned
from a `git bundle` of the branch instead of `github.com/andy-spike/armin`.
Every other step followed `docs/self-hosting.md` as written.

## Steps

1. DNS check from the guide: `getent hosts` printed the server IP for all
   three names.
2. `./selfhost/setup.sh` in an SSH terminal, answering the domain and email
   prompts. Built, deployed, and printed the address. Exit 0 in 3 min 55 s.
   Run without a terminal, it stops with "ARMIN_DOMAIN is required" instead
   of prompting, as intended.
3. All three hostnames served Let's Encrypt certificates (issuers YE1/YE2,
   valid to 2027-01-30). `/.well-known/oauth-protected-resource` named
   `https://actions.<domain>/mcp`.
4. Sign-in page with the **Self-hosted** badge
   ([sign-in](2026-11-01-self-hosting-azure/01-signin.png)). Sign-up showed
   "Create the owner account" and signed straight in with no email step
   ([decks](2026-11-01-self-hosting-azure/03-after-signup.png)).
5. Created a deck and a basic card with a PNG uploaded into the back
   ([deck](2026-11-01-self-hosting-azure/05-deck-with-card.png)). Review
   loaded the private image (64×64) and rated Good
   ([answer](2026-11-01-self-hosting-azure/06-review-answer.png)).
6. A signed-out browser saw "Sign-up is closed"
   ([closed](2026-11-01-self-hosting-azure/08-second-signup.png)). Direct
   `POST /api/auth/sign-up/email` to both the web and actions hosts returned
   403 `SIGN_UP_CLOSED`.
7. `./selfhost/backup.sh` wrote a 50 KB ZIP in 7 s. The guide's crontab line
   was installed, and the same command succeeded under a cron-like minimal
   environment (`env -i`, `PATH=/usr/bin:/bin`).
8. `./selfhost/reset-password.sh` in an SSH terminal changed the password.
   Sign-in with the new password returned 200; a wrong password returned 401.
9. `git pull && ./selfhost/update.sh`: backed up first, redeployed, and
   restarted in 28 s. Exit 0. Services stayed healthy.
10. Lost-server recovery: copied `selfhost/.env` and the newest backup off the
    VM, ran `docker compose down`, deleted the whole checkout including
    `selfhost/data/`, and removed the crontab. Fresh clone, copied `.env` back,
    `./selfhost/setup.sh` (exit 0), then `./selfhost/restore.sh
    selfhost/backups/<file>.zip`, typing `RESTORE` (18 documents, exit 0).
11. Signed in with the reset password. The deck, card, "1 learned" state
    ([deck](2026-11-01-self-hosting-azure/09-restored-deck.png)), private
    image (fetch 200, `image/png`;
    [card](2026-11-01-self-hosting-azure/10-restored-card.png)), and the
    review in Stats all came back.
12. MCP over HTTPS: authorization-server metadata, dynamic client
    registration, PKCE authorization through the signed-in browser
    ([consent](2026-11-01-self-hosting-azure/11-mcp-consent.png)), code
    exchange (Bearer plus refresh token), `initialize`, `tools/list`
    (17 tools), and `list_decks` returning the restored deck. A request with no
    token returned 401.

## Findings

- Between `setup.sh` finishing and the owner signing up, anyone who reaches
  the address can claim the owner account. The guide now says to create the
  account right after setup, and how to start over (delete `selfhost/data/`,
  rerun setup) if someone else got there first. A setup token would close the
  gap entirely; that's a product decision left open.
- `setup.sh`'s closing message pointed to a "Backups" section; the guide's
  section is "6. Schedule backups". Fixed.
- The move-to-a-new-server steps didn't mention the backup cron job, which
  lives outside the checkout's data. The guide now says to add it again.

## Re-run after rebasing onto `master`

The branch was rebased onto `master` (`dfc2c6e`, free and Pro plans). The same
VM, still holding the data above, was updated to the rebased code.

1. `./selfhost/update.sh` deployed the new schema, then ran the new
   "Bringing existing data up to date" step: `performance:backfill`,
   `performance:backfillFrontierKeys`, and `media:backfillVariants`. Without
   it, a self-hoster would have needed the operator commands from the backend
   README. Unit summaries gained `frontierKey`; the library gained
   `statsReady`.
2. A second `update.sh` skipped "Creating sign-in signing keys", because
   `JWKS` was already set. Before the fix, `grep -q` exiting early under
   `pipefail` made that check fail and re-store the same keys on every update.
3. `/pricing` redirected to `/`, then to sign-in.
4. After signing in, the deck, the card with its image (loaded, 64 px wide),
   and the earlier review were intact
   ([decks](2026-11-01-self-hosting-azure/12-after-rebase-decks.png),
   [card](2026-11-01-self-hosting-azure/14-after-rebase-card.png)). Stats
   showed the review in the heatmap and the 30-day chart
   ([stats](2026-11-01-self-hosting-azure/13-after-rebase-stats.png)).
5. `account:viewer` returned `plan: "pro"` and `imports:usage` returned
   limits of 1,000 decks, 100,000 flashcards, and 250,000 review units for the
   owner, run on the server with `convex run --identity`.

## Not covered

- Cloning from GitHub (the branch isn't pushed yet).
- A custom domain with its own DNS provider; `sslip.io` stood in for it.
- A 2 GB server, the minimum the guide lists. This VM had 4 GiB.
- Hitting a limit on a self-hosted instance (the "This instance allows..."
  message); the limits are far above what a test library reaches.
- `restore.sh` running migrations on an older backup; the step is the same
  call `update.sh` makes, but no old-version backup was restored.
