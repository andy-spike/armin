# Connect your AI assistant to Armin

Armin's hosted MCP server lets your assistant create study cards, link prerequisites, and manage your library. Your assistant reads the material you provide and writes the cards; Armin stores them and schedules your reviews.

You need an [Armin account](/sign-up) with a verified email and an assistant that supports remote MCP servers with OAuth. Your assistant provider's plan and workspace restrictions apply. Nothing needs to run on your computer for the hosted connection.

## Server details

**MCP server URL:**

`https://intent-bullfrog-922.convex.site/mcp`

- **Transport:** Streamable HTTP over HTTPS.
- **Authentication:** OAuth authorization code flow with S256 PKCE and dynamic client registration. Choose OAuth in your client; no personal API key or manually supplied client secret is needed.
- **Authorization scope:** `armin:author`. Library access is not a separate OAuth scope; approving the connection gives its assistant all nine tools on the whole library.

The server URL is an integration endpoint, not a webpage. Opening it directly in a browser is not a connection test.

## Connect Claude

While the public directory listing is pending, use a custom connector:

1. In Claude, open **Customize → Connectors → Add custom connector**.
2. Name it **Armin** and paste the MCP server URL above.
3. Add the connector, choose **Connect**, and sign in to Armin in the page that opens.
4. Review the requested access and approve the connection.
5. Enable Armin in your conversation and ask it to create or read a deck.

In a managed workspace, an owner may need to add or allow the connector first. Once Armin is listed in your provider's directory, you can install the listing instead of entering the URL. Both paths use the same server and access model.

[Claude's custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

## Connect ChatGPT

1. Open [ChatGPT Plugins](https://chatgpt.com/plugins).
2. Choose **+ → Add custom MCP server**, name it **Armin**, and enter the MCP server URL.
3. Choose **OAuth**, review the warning, and select **Create as a plugin**.
4. Sign in to Armin and approve the connection.
5. Start a conversation, type **@**, select Armin, and send your request.

Account and workspace policies control whether custom servers are available. If a client asks for a client ID or secret, use automatic registration when offered; Armin does not supply a shared client secret.

[OpenAI's connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt)

## Connect coding agents

For Claude Code, run:

```sh
claude mcp add --transport http armin https://intent-bullfrog-922.convex.site/mcp
```

Then run `/mcp` in Claude Code, select **armin**, and authenticate. The command applies to the current project by default; add `--scope user` to make the connection available across projects.

For Codex, run:

```sh
codex mcp add armin --url https://intent-bullfrog-922.convex.site/mcp
codex mcp login armin
```

Approve the connection in the Armin page that opens. Use a current client version that supports remote MCP and OAuth.

## Choose what your assistant can access

Every new connection asks for your approval. There is one access option: after
you approve it, the assistant can use all nine Armin tools on your whole library,
including every existing deck and any decks and cards you add later. Approval
covers reading, creating, editing, and archiving cards, creating and renaming
decks, moving cards, and linking prerequisites; there are no per-deck, read-only,
or edit/create choices.

Armin limits the tools themselves. The assistant cannot permanently delete cards
or decks, upload images, rate reviews or change scheduling, export your library,
or manage your account.

Client names are supplied by the connecting app and are not verified by Armin. Check the client name and callback origin on the consent screen before approving.

## Manage or disconnect an assistant

Open [Armin Settings](/settings) and select **AI assistants** to:

- See connected assistants and what they can access.
- Inspect recent activity summaries to see which assistant changed which deck.
- Disconnect a connection. Its access to Armin stops immediately; your decks and cards remain.

You can also remove the connector or plugin in the assistant's own settings. Disconnect it in Armin when you want to ensure its server access has ended. Reconnecting requires a new approval.

## Try these requests

- “Make an Armin deck from these lecture notes, with prerequisites.”
- “Which Armin decks can you see?”
- “Show me the cards in this deck and how they depend on each other.”
- “Update this card's answer to include the example below.”
- “Archive this card.”

Open the returned deck link to inspect the result and study in Armin. Review generated cards for accuracy before relying on them.

## Available tools

| Tool                 | What it does                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `list_decks`         | Lists the decks in your library.                                                                         |
| `read_deck`          | Reads a deck's cards and versions, up to 20 cards per page.                                              |
| `read_prerequisites` | Reads a deck's prerequisite links.                                                                       |
| `save_cards`         | Saves 1–50 text cards and up to 100 prerequisite links in one atomic batch, in a new or existing deck.   |
| `update_card`        | Edits one card, checking its version and preserving existing review items.                               |
| `set_card_archived`  | Archives or unarchives one card without deleting its review history.                                     |
| `update_deck`        | Changes a deck's name or description.                                                                    |
| `set_prerequisite`   | Adds or removes a same-deck prerequisite link, rejecting cycles.                                         |
| `move_card`          | Moves a card between decks while preserving study state; refuses to silently discard prerequisite links. |

Supported card types are basic, reversed, cloze, and typed-answer. The assistant cannot permanently delete cards or decks, upload images, rate reviews, change scheduling, export your library, or administer your account. Edits that would remove existing review items or change image content must be performed in Armin.

Each connection can make up to 120 successful authoring writes per hour. An account can have up to 20 active connections. Normal library quotas also apply. Large card sets need multiple batches; each batch succeeds or fails as a unit. Stale edits are rejected instead of overwriting a newer change.

## Troubleshooting

**The assistant cannot see a deck.** Confirm you signed into the intended Armin account and that the connection is still listed under **Settings → AI assistants**. An approved connection can use every deck in the active library; there is no per-deck sharing step.

**Sign-in or approval expired.** Start the connection again from your assistant. Consent requests expire after ten minutes. If a previously working connection reports an authentication error, reconnect and approve it again.

**A write is refused.** Check that the connection is still approved. For a version conflict, ask the assistant to read the latest card or graph and retry. A quota error may require waiting for the hourly limit or reducing the batch size.

**The custom connector option is missing.** Check your provider's plan and workspace policy with its administrator. Armin cannot enable a feature blocked by the provider.

**The server cannot be reached.** Use the exact HTTPS URL, including `/mcp`. Hosted chat apps cannot reach a local development server. For persistent failures, [open a support issue](https://github.com/andy-spike/armin/issues) with the client name, time, and error message. Do not include passwords, authorization codes, access tokens, or private card content.

## Data and privacy

Armin stores authorized card content, deck information, prerequisite links, and connection records. It does not fetch the source pages you share or run an AI model on your behalf. Your assistant provider handles the conversation under its own policies.

Connection activity summaries are retained for 90 days and do not contain card snapshots or source documents. Disconnecting an assistant does not delete its saved study content. See the [Privacy Policy](/privacy) and [Terms of Service](/terms) for the full data and account rules.

## Public test account

For evaluation, use `reviewer@armincards.app` with password `ArminDemo123!` at [Armin sign-in](/sign-in). This is a shared, disposable account: everyone using it can see and change its library. Do not add private material.

Its data is restored to a sample deck roughly every six hours, with up to five minutes of scheduling delay. Sign-in sessions and OAuth connections remain, but links to deleted cards and decks become invalid. Approved connections keep their whole-library access across the reset. The account's credentials and deletion are protected so it remains available to testers.

For permanent study content and private data, create your own account.
