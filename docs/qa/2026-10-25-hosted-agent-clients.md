# Hosted assistant production walkthrough, 2026-10-25

## Deployment and environment

Deployed merged `master` commit `15e3a8d` to production, backend first, then web.
Convex schema validation and function deployment succeeded on
`intent-bullfrog-922`. Cloudflare deployed Worker `armin-web`, version
`d3b06e33-d002-40e5-a8b4-ae4908e1ca5d`, at `https://armincards.app`.
OAuth discovery advertises the production HTTPS issuer and endpoints; an
unauthenticated MCP request returns 401. Production `SITE_URL` is correct.

The user signed into Armin, Claude, and ChatGPT in their Chromium browser.
A separate headless browser hit human-verification challenges on both provider
sites. After user approval, continued in their authenticated Chromium session
without foregrounding it. Deleted the temporary local browser-state export.

## Claude chat: passed creation and readback

Added a custom connector named `Armin QA` with the production MCP URL and
automatic public-client registration. Claude discovered OAuth and completed
consent with creation-only access. It discovered all nine tools.

Using Haiku 5.5, requested a three-card HTTP deck and prerequisite links.
Claude listed zero existing decks, saved three basic cards with a two-edge
prerequisite chain, and read back the cards and graph successfully. Opened the
returned production deck link and confirmed the foundational card was new and
dependent cards were locked. Settings showed the connection and save activity.
The deck is named `Claude Chat QA 2026-10-25`; it contains only synthetic QA
content. Revoked the QA connection through Armin Settings after the test.

## ChatGPT: authorization compatibility issue

Added `Armin QA` through Plugins → Add → Add custom MCP server, using OAuth.
ChatGPT registered successfully and initiated authorization with the scopes
`openid email offline_access armin:author`. Production rejected this with
`invalid_scope` because it required the entire scope string to equal
`armin:author`. Consent and tool execution could not proceed. The available
plugin settings offered no override for the requested scope.

The fix parses the requested scope list, requires `armin:author` when a
nonempty list is supplied, and grants only that supported scope. The token
response already explicitly returns `scope: armin:author`. Additional requested
scopes do not grant identity information or OpenID Connect support.

Verified against the running isolated local backend: omitted scope,
`armin:author`, the actual ChatGPT scope list, and author plus an unknown scope
reach consent (302). Identity-only and unknown-only lists return 400. Initial
requests against the stale local deployment reproduced the production failure;
the checks passed after restarting the worktree backend with the new code.

`pnpm check`, web build, and mobile iOS/Android bundle check pass. Hosted
ChatGPT acceptance still requires deploying the compatibility fix and repeating
the connection test. Natural client access-token expiry/refresh is not covered
by these short sessions.
