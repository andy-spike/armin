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
Claude's next read attempt stopped at a reconnect prompt instead of reading
the deck, confirming revoked access was not reused successfully.

## ChatGPT: authorization compatibility issue and fix

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

`pnpm check`, web build, and mobile iOS/Android bundle check pass. PR #50 passed
the required Verify check and its automated review reported no findings. Merged
it as `f587c87` and deployed the corrected backend from `master`. The web code
did not change, so the existing Cloudflare deployment remained current.

## ChatGPT: passed creation and readback after deployment

Retried the same custom MCP connection. It reached Armin consent and completed
OAuth with creation-only permissions. ChatGPT discovered the tools and listed
zero visible decks, even though the account contained the Claude QA deck.

The model picker offered GPT-6 and GPT-5.6 Sol, with no mini model. Used GPT-6
at the lowest available Power setting (slider value 1; response details called
this Medium thinking effort). Kept the task bounded to three short basic HTTP
cards. Approved the Save Cards tool once, without granting permanent tool-call
approval. The model saved the cards and two prerequisite links, read them back,
and returned the production deck URL.

Opened `ChatGPT QA 2026-10-25` in the web app and confirmed three cards, with the
foundation new and the two dependent cards locked. Settings displayed the
connection and save activity. Revoked the QA connection through Armin Settings
after the test. A fresh read request in ChatGPT then stopped at `Your Armin QA
connection has expired` and required reconnection; no deck content was returned.

Natural client access-token expiry/refresh is not covered by these short
sessions. The two production QA decks remain available for user inspection;
they contain only synthetic content. No existing study content was edited.
