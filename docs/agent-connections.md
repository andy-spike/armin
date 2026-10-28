# AI assistant connections

Users can turn material they are already reading in an AI assistant into Armin
cards, decks, and prerequisite relationships. The assistant reads the source and
generates the content. Armin does not fetch sources, run a model, or use an AI
subscription on the user's behalf.

Settings → AI assistants provides setup instructions for ChatGPT, Claude,
Claude Code, and Codex, connection permissions, revocation, and recent authoring
activity. Connections are available to Armin accounts; the AI provider's plan
and workspace policy still apply.

## Plugins for chat apps, MCP for coding agents

Chat app users install Armin from their app's plugin directory instead of
pasting a server address. [`plugins/armin`](../plugins/armin) is one plugin
folder with a manifest for each directory: Anthropic's lists it in Claude chat,
Cowork, and Claude Code, and OpenAI's single directory lists it in ChatGPT and
Codex. The plugin bundles the MCP server below and the `writing-study-cards`
skill; it runs nothing on the user's computer. Installing it still goes through
the same OAuth consent and permissions.

Coding agents connect to the MCP server directly with `claude mcp add` or
`codex mcp add`, as Settings shows. They can also install the plugin from this
repository's marketplaces.

Until a directory approves the plugin, Settings shows the custom connector
steps for that chat app. [Publishing the plugin](../plugins/PUBLISHING.md)
covers the remaining prerequisites, both submission flows, and the switch to
flip after approval.

## Connection flow

The remote MCP server runs in Convex HTTP actions at
`${CONVEX_SITE_URL}/mcp`, using the official TypeScript MCP SDK's stateless
Streamable HTTP transport with JSON responses. Each request authenticates again;
there is no process-local session or privileged first-party session forwarded to
agent tools.

OAuth endpoints live on the same Convex HTTP origin:

- `/.well-known/oauth-protected-resource` and its `/mcp` variant advertise the
  resource and authorization server.
- `/.well-known/oauth-authorization-server` advertises authorization-code,
  S256 PKCE, refresh tokens, and dynamic public-client registration.
- `/oauth/register` registers an unverified client name and exact HTTPS callback
  addresses, or HTTP callbacks on loopback for coding agents. Custom URL schemes,
  fragments, credentials in URLs, and arbitrary HTTP callbacks are rejected.
- `/oauth/authorize` validates the registered callback and PKCE challenge, then
  sends the user to the web app's authenticated `/connect-agent` consent page.
- `/oauth/token` exchanges a single-use, five-minute authorization code for a
  one-hour access token and a rotating refresh token with a 30-day idle window.

Clients may request additional scopes alongside `armin:author`. Armin grants
only `armin:author` and explicitly returns that reduced scope in the token
response. Additional scopes do not grant identity data or other permissions;
Armin does not implement OpenID Connect or issue ID tokens. An explicit request
containing no supported scope is rejected.

The user signs in to Armin through the usual web flow and explicitly approves
each new connection. Client names are self-reported, so consent labels them
unverified and shows the callback origin. A request expires after ten minutes.
Codes and bearer/refresh tokens are cryptographically random; only their SHA-256
hashes are stored. Token exchange binds client, exact redirect, PKCE, and MCP
resource. Refresh-token reuse revokes that connection's token family. Revocation
and deleting the Armin account immediately stop both reads and writes.

Dynamic registration is supported; client ID metadata documents and confidential
OAuth clients are not advertised. No personal API tokens or unattended credential
provisioning are included.

## Permissions and protection of existing work

New connections default to creating new decks and managing the work they create.
They cannot read other decks. Users may instead share selected existing decks or
the whole library, and separately permit editing existing content and creating
new decks. Existing decks shared without edit permission are read-only.

Every lookup checks the connection's active grant, library ownership, and deck
access in the same query or mutation that reads or changes the data. The MCP
bearer token is accepted only by the agent endpoints, not as a first-party user
session. Decks created by a connection remain accessible to that connection;
cards record which connection created them. Editing a manually created card
still needs edit permission even when that card is in an agent-created deck.

Agents cannot permanently delete cards or decks, rate reviews, change
scheduling, export a library, or administer accounts. Ordinary card authoring
does not upload images. The separate Anki import route can upload PNG, JPEG,
GIF, WebP, BMP, or AVIF images through a one-import scoped token, because
preserving source images is part of faithful conversion; SVG, audio, video, and
arbitrary URLs are refused. Their archive tool is reversible and preserves study
history. Card edits that would remove existing review-unit keys are rejected,
because ordinary reconciliation would delete those units and their review
history. Content edits involving existing images are also rejected; users
perform these changes in Armin. Moving a card refuses to discard prerequisite
links implicitly.

There is no new trash, universal version history, approval queue, or batch undo.
Users inspect saved content in the ordinary deck and card screens.

## Authoring contract

The server exposes the authoring tools below plus the [Anki import tools](#anki-import). Each carries a display title and read-only or destructive annotations, which both plugin directories require:

| Tool                 | Behavior                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `list_decks`         | List only authorized decks and the current permission summary.                                     |
| `read_deck`          | Read authored content and versions, up to 20 cards per page. Follow `nextCursor` until null.       |
| `read_prerequisites` | Read a deck's links and the library revision.                                                      |
| `save_cards`         | Create 1–50 text cards and up to 100 prerequisite links together in a new or authorized deck.      |
| `update_card`        | Edit one card against `expectedVersion`, preserving existing review items.                         |
| `set_card_archived`  | Archive or unarchive one card against `expectedVersion`.                                           |
| `update_deck`        | Change a deck's name or description against `expectedVersion`.                                     |
| `set_prerequisite`   | Add/remove one same-deck edge against `expectedRevision`, rejecting cycles.                        |
| `move_card`          | Move one card between authorized decks, preserving study state and refusing implicit edge removal. |

Card types are `basic`, `basic_reversed`, `cloze`, and `type_answer`. Content and
tags use the same core validation as first-party authoring. Temporary card keys
within `save_cards` identify the endpoints of batch prerequisites. Cross-batch
relationships can be added with `set_prerequisite`. Responses include permanent
card IDs and, for batch saves, a link to the deck.

Each write uses a request ID scoped to the connection. For seven days, an
identical retry returns the original result without duplicating writes or
activity; different input with the same ID is rejected. Permission and existence
checks still apply to retries. A whole batch, its new deck, cards, units, links,
request result, and activity are one Convex mutation. An error rolls it all back.
Larger sources require several explicitly described batches; they are not one
transaction. Stale edits fail instead of automatically overwriting newer work.

MCP initialization includes card-writing guidance distilled from Armin's
`writing-study-cards` skill, including focused retrieval, choosing types, and
meaningful prerequisites. Stored cards and source text are treated as untrusted
data rather than authority to perform actions.

## Anki import

The MCP server offers a staged route for Anki `.apkg`, `.colpkg`, and text
exports. The assistant downloads Armin's versioned converter kit from
`/anki-kit/armin-anki-kit-<version>.zip`, verifies its published SHA-256, and runs
it in its own environment with Node.js. The kit reuses the browser's converter
and reader, extracts supported images, and writes `plan.json`, `manifest.json`,
`preview.html`, and content-addressed `media/` files. Conversion is
deterministic and does not run anything from the source package.

This is not a server-side archive converter. Armin never receives the original
archive, and the backend does not parse it. The assistant must be able to access
the file and execute code; chat clients without attachment access or a code
sandbox are told to use browser import. The tested kit runtime is Node.js 24 on
Linux x64; Node.js 20 and 22 are the supported code target but have not been
verified here.

The import uses these tools:

| Tool                       | Behavior                                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `get_anki_import_guide`    | Returns the kit URL, checksum, runtime requirements, upload protocol, limits, and exact workflow.                                      |
| `anki_import_start`        | Creates a staging session from the kit's decks, every plan key, totals, warnings, and unresolved notes. Returns a scoped upload token. |
| `anki_import_add_batch`    | Stages up to 100 cards and 1,500 review items, plus explicit skip reasons. Idempotent by request ID.                                   |
| `anki_import_upload_token` | Issues a fresh token if the first one was lost; it is valid only for that staging import's media endpoint.                             |
| `anki_import_preview`      | Returns final counts, skips, repairs, unresolved dispositions, and an approval checksum.                                               |
| `anki_import_status`       | Reads progress or the final deck links.                                                                                                |
| `anki_import_finalize`     | Requires the exact preview checksum and explicit confirmation, then materializes in bounded transactions.                              |
| `anki_import_cancel`       | Cancels a staging or materializing import and removes its cards, decks, and unshared uploads.                                          |

Media goes to `POST ${CONVEX_SITE_URL}/agent-imports/{importId}/media` with the
scoped upload token, as raw bytes. The endpoint requires an active staging
session, sniffs the actual image type, enforces the 10 MiB per-file and 80 MiB
per-library limits, content-addresses the blob, and tracks it for that import.
It accepts no URL, filename, or arbitrary storage key. Responses contain an
`armin-media:` reference that already appears in the kit's content. The upload
token is separate from the MCP access token so a coding agent can use curl
without exposing its OAuth credential; it expires with the staging session.

Staged cards and media-owned rows stay outside normal decks. Finalization creates
hidden decks, writes cards in batches of 20, and flips the decks visible only
after every staged card is present. If materialization fails or is cancelled,
the hidden decks, cards, and unshared images are removed. Normal deck lists,
Browse, queues, exports, and agent reads exclude staging decks. The current
2,000-flashcard and 10,000-review-unit caps are checked when staging starts, on
every batch, and again while committing. MCP imports always start fresh: the
kit omits schedules and review history, and the server never writes either.

Every converter plan key must be imported or explicitly skipped; every
unresolved note must be repaired or explicitly skipped. `anki_import_finalize`
rejects a session with any missing disposition, and it requires a checksum from
an `anki_import_preview` of the exact staged state. AI polishing is separate,
explicitly requested work; conversion alone never authorizes rewriting, and no
prerequisites are inferred. Staging expires after 24 hours without activity.
Record retention is 30 days, and cleanup is bounded.

## Bounds and operation

Existing library quotas apply. Each connection may make 120 successful authoring
writes per hour; identical retries do not use that budget. An account may have
20 active connections. OAuth entry points have per-source and global limits.
Request bodies are limited to 1 MiB before parsing. Tool input bounds and core
content limits apply in addition to the HTTP limit.

Activity keeps operation summaries, client names, affected deck IDs, and times
for 90 days, not card snapshots, source documents, codes, or tokens. Settings
shows the latest 50 events. Cleanup prunes expired OAuth requests/registrations,
rate buckets, retired refresh hashes, and request IDs in bounded transactions,
rescheduling if more remain. Account cleanup includes connection data, created
content ownership records, activity, and retry data.

The existing `SITE_URL` must point to the web app. Convex supplies its canonical
`CONVEX_SITE_URL`; it is also the OAuth issuer and token audience. Browser
origins are limited to the web app, the server, ChatGPT, and Claude. If a
supported client needs another browser origin, set `AGENT_ALLOWED_ORIGINS` to
comma-separated exact origins on the intended deployment. Native clients
normally omit Origin. Browser-based HTTP clients receive CORS headers without
cookie credentials; authoring always requires a bearer token.

Local coding agents can reach a checkout's loopback MCP address. Hosted chat
apps need the production deployment's public HTTPS address; they cannot reach
this machine's local backend. The plugin always points at production.

## Compatibility references

- [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [OpenAI plugin authentication](https://developers.openai.com/plugins/build/auth)
- [OpenAI connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp)
- [Claude custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- [Claude Code MCP configuration](https://code.claude.com/docs/en/mcp)
- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins)
- [Claude plugin structure](https://claude.com/docs/plugins/build)

The local OAuth/MCP flow is verified with the SDK client and actual Claude Code
and Codex CLI sessions, including model-driven creation, readback, and revocation.
See [the client walkthrough](qa/2026-10-25-agent-clients.md). Actual ChatGPT and
Claude chat sessions also passed production HTTPS OAuth, creation, and readback;
see [the hosted-client walkthrough](qa/2026-10-25-hosted-agent-clients.md).
Natural token expiry and refresh in the actual clients remain untested. These
bounded walkthroughs do not guarantee compatibility with every provider plan,
workspace policy, or future client version.
