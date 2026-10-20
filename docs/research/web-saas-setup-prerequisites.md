# Web SaaS setup prerequisites

Checked against official documentation on 2026-10-19. This records preparation
for the approved TanStack Start, Better Auth, and Convex migration. No packages,
accounts, credentials, deployments, or application configuration were changed.

## What the owner should prepare now

### Convex

1. Sign in at [the Convex dashboard](https://dashboard.convex.dev/).
2. Select or create the team that should own Armin. A personal team is enough.
3. Create a project named `armin` using Create Project, or tell the implementation
   agent which existing project to use. Record the team and project slugs.
4. Authorize the CLI on the same machine and OS user the agent will use:

   ```bash
   pnpm dlx --allow-build=esbuild convex login
   ```

   Complete the browser/device authorization yourself. This command authenticates
   the CLI. Do not run `convex dev` in the current repository just to sign in.
   The implementation agent will run development configuration in the correct
   new workspace after creating it.

   The explicit `--allow-build=esbuild` is needed with this repository's pnpm
   12.4.1 setup: plain `pnpm dlx convex login` failed with
   `ERR_PNPM_IGNORED_BUILDS` for `esbuild@0.27.0`. The install path was reproduced
   with `convex@1.47.0 --version`; adding the flag succeeded and printed
   `1.47.0`. The flag permits esbuild's build script in the isolated dlx
   environment without changing workspace build permissions.
   [pnpm dlx build permission](https://pnpm.io/cli/pnx#--allow-build)

Convex organizes projects under teams. Projects can be created in the dashboard
or CLI. [Teams](https://docs.convex.dev/dashboard/teams/teams),
[projects](https://docs.convex.dev/dashboard/projects)

The CLI source confirms a standalone `login` command with browser/device flows
and a `--no-open` option. It stores device authorization locally. Login can also
offer to link pre-existing anonymous local deployments, if any exist; do not
select unrelated projects. [CLI login source](https://github.com/get-convex/convex-js/blob/main/src/cli/login.ts)

`convex dev` configures a project and writes deployment configuration and the
backend directory, then watches and pushes code. That is implementation work,
not a prerequisite for dashboard signup. [CLI overview](https://docs.convex.dev/cli/overview)

By default there is a shared production deployment and a personal development
deployment per developer. Staging is an additional deployment arrangement, not
a required signup checkbox. Current tooling supports creating additional
deployments. Ordinary preview deployments expire by default, so do not assume
an ephemeral preview is durable staging. Leave this setup to the implementation
agent. [Multiple deployments](https://docs.convex.dev/production/multiple-deployments)

### Google OAuth for development

1. Create or select a Google Cloud project dedicated to Armin development.
2. In Google Auth Platform, complete Branding with the Armin name, support
   email, and developer contact email.
3. In Audience, select External and leave the app in Testing while building.
   Add the Google accounts you plan to use for development and QA as test users.
4. In Data Access, keep authentication scopes only: `openid`, `email`, `profile`.
   Do not request Gmail, Drive, Calendar, or other Google data access.
5. In Clients, create an OAuth client of type Web application, named for example
   `Armin local development`.
6. Register `http://localhost:3000/api/auth/callback/google` as an Authorized
   redirect URI. We can make port 3000 and the standard `/api/auth` route the
   implementation defaults. If the UI requires origins or we use Google's
   browser SDK, add `http://localhost` and `http://localhost:3000` as Authorized
   JavaScript origins. Origin entries have no callback path.
7. Save the client ID and secret privately. The client ID can be reported to the
   agent, but the secret should go directly into backend environment settings
   once the development deployment exists.

Google documents Clients, Branding, and Data Access and says these default
identity scopes suffice for authentication. Better Auth documents the exact
local callback above. [Google setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid),
[Better Auth Google provider](https://better-auth.com/docs/authentication/google)

Testing status is enough to begin implementation. Google's current app-state
documentation explicitly exempts apps requesting only basic identity scopes
from the test-user allowlist requirement. Test users are useful preparation,
but do not describe the allowlist, 100-user limit, or seven-day token expiry as
unconditional rules for this sign-in-only app. Revisit publishing and brand
verification with the actual production domain before launch.
[Google app states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)

The Start integration proxies auth through the app domain. The Expo guide's
social callback instead uses the deployment's `.convex.site` origin. Do not
pre-register guessed production or mobile URLs. The implementation spike must
establish and verify the actual shared web/mobile auth configuration before
requesting additional callback registrations.
[Start integration](https://labs.convex.dev/better-auth/framework-guides/tanstack-start),
[Expo social sign-in](https://labs.convex.dev/better-auth/framework-guides/expo#social-sign-in)

## Email, domain, and hosting preparation

If no sending domain is available yet, create the Resend account and a
development API key, then use `Armin <onboarding@resend.dev>` as the sender.
Without a verified domain, real test delivery is restricted to the email address
associated with the Resend account. This permits a real verification/reset
walkthrough for that address, but not public signup email delivery. The special
`delivered@resend.dev` addresses simulate delivery events; they are not a real
user inbox for clicking authentication links.
[Resend testing sender example](https://resend.com/docs/send-with-nodejs),
[recipient restriction](https://resend.com/docs/api-reference/errors),
[simulated test addresses](https://resend.com/docs/dashboard/emails/send-test-emails)

Public email/password registration will require a verified domain before
launch. It can be a domain the owner already controls and does not need to be
the eventual Armin web domain. Domain-free development does not change the
requirement for real email verification in the public product.

For verification and password-reset email, choose a transactional sender.
Resend is a proposed default, not a prior product decision. To prepare it,
create the account, add a sending subdomain of a domain you own, copy its exact
DKIM/SPF DNS records into your DNS provider, and wait for verification. Keep
existing mail records unless the provider's specific instructions require a
change. Choose the From and reply-to addresses. Generate a Sending access API
key restricted to that domain. Store the key privately until backend
environment settings exist. The implementation agent can wire sending and
templates. [Resend domain setup](https://resend.com/docs/add-a-domain),
[Resend API key permissions](https://resend.com/changelog/new-api-key-permissions)

A production domain and DNS access are helpful now, but not blockers to coding
or localhost Google sign-in. Final production callbacks, HTTPS, public policy
pages, Google publishing/brand review, and staging/production secrets depend on
the deployment we build. Google recommends separate development/testing and
production projects. Do not make production brand approval a prerequisite for
starting implementation.
[Google verification exceptions](https://developers.google.com/identity/verification/authentication-verification)

TanStack Start still requires a frontend/server host. Convex does not host the
Start application. Creating a hosting account and authenticating its CLI can
wait until the host is selected. Avoid creating a project with guessed build
settings now. [Convex frontend hosting](https://docs.convex.dev/production/hosting)

## Credential handoff

The owner can safely report team/project slugs, dashboard URLs, OAuth client
IDs, chosen domains, sender addresses, and completion status. OAuth client
secrets, email API keys, deploy keys, and account tokens stay out of chat.

After the development deployment exists, place `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, and the selected provider's email key in that deployment's
environment settings. If using Resend, agree on `RESEND_API_KEY` in code. Set
production values separately later. The agent can generate `BETTER_AUTH_SECRET`
and configure `SITE_URL`, public Convex URLs, trusted origins, components,
schema, functions, and auth callbacks. Better Auth is a library in this setup;
no separate hosted Better Auth account is needed.
[Convex environment variables](https://docs.convex.dev/production/environment-variables),
[Convex Better Auth installation](https://labs.convex.dev/better-auth/framework-guides/tanstack-start)
