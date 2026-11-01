# Self-hosting walkthrough

Date: 2026-10-29
Checkout: `t3/55742678`
Environment: the full `selfhost/` Docker stack on this Linux workstation
(rootless Docker 29.9.2, Compose 5.6.1), with `ARMIN_DOMAIN=armin.localhost`,
`HTTP_PORT=8080`, `HTTPS_PORT=8443`, and `CADDY_GLOBAL_OPTIONS=local_certs`
because rootless Docker can't bind ports 80/443 and `.localhost` can't get a
Let's Encrypt certificate. A test-only Compose override made the web container
trust Caddy's local CA (`NODE_EXTRA_CA_CERTS`); real deployments use public
certificates and need no override. Headless Chromium through agent-browser,
trusting the same CA. Not tested on a public server with real DNS and Let's
Encrypt.

## Steps

1. `./selfhost/setup.sh` on an empty checkout: generated secrets, built both
   images, started the pinned Convex backend, created the admin key, set
   `SITE_URL`, `BETTER_AUTH_SECRET`, `SELF_HOSTED`, deployed functions, stored
   `JWKS`, and started web and Caddy. Exit 0.
2. `/` redirected to sign-in (no landing page). The **Self-hosted** badge shows
   under the logo ([sign-in](2026-10-29-self-hosting/01-sign-in.png)).
3. Sign-up showed "Create the owner account". Submitting signed in directly,
   with no email step, and provisioned the library
   ([decks](2026-10-29-self-hosting/03-after-signup.png)); badge in the sidebar.
4. Created a deck and a basic card with a PNG uploaded into the back. Review
   showed the card and loaded the private image through `/media/` (64 px wide);
   rated Good ([review](2026-10-29-self-hosting/05-review-answer.png)).
5. A second `POST /api/auth/sign-up/email` returned 403 `SIGN_UP_CLOSED`. In a
   signed-out browser, sign-up showed "Sign-up is closed"
   ([closed](2026-10-29-self-hosting/06-signup-closed.png)), sign-in hid
   "Create an account", and forgot-password pointed to the server script
   ([reset](2026-10-29-self-hosting/07-forgot.png)).
6. `./selfhost/reset-password.sh`: the old password then returned 401 and the
   new one 200. An unknown email failed with "No account uses …".
7. `./selfhost/update.sh`: rebuilt, backed up, redeployed, restarted; about
   2 minutes. The zip contained the auth user and signing keys
   (`_components/betterAuth/...`), flashcards, and the stored image.
8. Disaster recovery: stopped the stack, deleted `selfhost/data`, reran setup
   with the same `.env` (sign-in then returned 401), then
   `./selfhost/restore.sh selfhost/backups/<zip>`. Sign-in returned 200; the
   deck, card, one review in Stats, and the image (200, `image/png`) were back.
9. MCP: protected-resource and authorization-server metadata served from
   `https://actions.armin.localhost:8443`; unauthenticated `/mcp` returned 401
   with `WWW-Authenticate`. Registered a client, approved the consent page
   ([consent](2026-10-29-self-hosting/10-consent.png)), exchanged the code with
   PKCE, and `list_decks` returned the restored deck. AI setup shows the
   instance's `/mcp` address.
10. `BACKUP_KEEP=1` pruned older backups; files are owned by the checkout's
    user.
11. Hosted mode unchanged: the worktree's dev app still shows the landing page,
    no badge, "Create your account", and the seed account signs in.

## Bugs found and fixed during the walkthrough

- `restore.sh` resolved a relative backup path after changing into
  `selfhost/`, so `selfhost/backups/...` from the repository root failed.
- The tools image re-downloaded pnpm on every command; it now runs the Convex
  CLI from `node_modules/.bin` directly.

## Checks

`pnpm check`, `pnpm --filter @armin/web build`, and
`pnpm --filter @armin/mobile check:bundle` pass.
