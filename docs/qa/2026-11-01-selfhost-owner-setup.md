# Self-hosted owner created by setup

Date: 2026-11-01
Branch: `t3/selfhost-owner-setup`
Environment: the full `selfhost/` Docker stack on this Linux workstation
(rootless Docker 29.9.2), with `ARMIN_DOMAIN=armin.localhost`, `HTTP_PORT=8080`,
`HTTPS_PORT=8443`, and `CADDY_GLOBAL_OPTIONS=local_certs`, as in
[the first local run](2026-10-29-self-hosting.md). A test-only Compose override
gave Caddy network aliases for the three hostnames and made the web container
trust Caddy's local CA; real deployments use public certificates and need
neither. Prompts were answered through a pseudo-terminal, so the scripts saw a
real terminal. Headless Chromium through agent-browser. Not run on a public
server.

## Steps

1. `./selfhost/setup.sh` on an empty checkout built, deployed, then asked
   "Create the owner account now? [Y/n]". Answering `y` prompted for email,
   name, and password (hidden, entered twice) and printed "Created the owner
   account owner@qa.invalid." The closing message says to sign in.
2. `POST /api/auth/sign-up/email` to both the actions host and the web host
   returned 403 `SIGN_UP_CLOSED`. The instance still had one user.
3. In the browser, `/sign-up` showed "Sign-up is closed"
   ([closed](2026-11-01-selfhost-owner-setup/01-signup-closed.png)), and
   sign-in offered no "Create an account" link
   ([sign-in](2026-11-01-selfhost-owner-setup/02-sign-in.png)).
4. Signing in with the owner's password returned 200 and opened the empty deck
   list with the library provisioned
   ([signed in](2026-11-01-selfhost-owner-setup/03-signed-in.png)). A wrong
   password returned 401.
5. Moving servers: created a deck, ran `backup.sh`, stopped the stack, and
   deleted `selfhost/data/` and `selfhost/backups/`, keeping `.env`. Re-ran
   `setup.sh` and answered `n`. It warned "No owner account yet. Restore a
   backup, or run ./selfhost/create-owner.sh." and finished.
6. With no owner yet (the case the old flow left open), sign-up still returned
   403 `SIGN_UP_CLOSED`.
7. `restore.sh` with the backup restored the data and ran the migrations. The
   restored owner signed in, and the deck was back
   ([restored](2026-11-01-selfhost-owner-setup/04-restored.png)).
8. `create-owner.sh` with `ARMIN_OWNER_EMAIL` and `ARMIN_OWNER_PASSWORD` set,
   on the instance that already had an owner, said "This instance already has
   its owner account." and changed nothing.

## Not covered

- A public server with real DNS and Let's Encrypt; this change doesn't touch
  HTTPS or routing.
- Non-interactive `setup.sh` with `ARMIN_OWNER_EMAIL` on an empty instance; it
  calls the same `create-owner.sh` path that steps 1 and 8 exercised.
