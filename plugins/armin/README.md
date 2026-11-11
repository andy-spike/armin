# Armin

Turn what you read into study cards that unlock in the right order.

[Armin](https://armincards.app) is a spaced-repetition flashcard app whose cards form a prerequisite graph. A card stays locked until the cards it depends on are learned, and FSRS schedules every review. This plugin lets your assistant write those cards from an article, notes, a document, or code you share.

## Install

In Claude or ChatGPT, search for Armin in the plugin directory and add it. Coding agents install it from this repository:

```bash
# Claude Code
/plugin install armin --marketplace andy-spike/armin

# Codex
codex plugin marketplace add andy-spike/armin
codex plugin add armin@armin
```

For connection steps, tools, and troubleshooting, see the [MCP server documentation](https://docs.armincards.app/reference/mcp-server/).

## Use it

1. Connect Armin when asked. Your browser opens Armin, where you sign in and approve the connection.
2. Share material and ask for cards: "Make study cards in Armin from this article."
3. The assistant writes focused cards, links foundations to the ideas built on them, saves the deck, and replies with a link to study.

You can also ask it to list or read decks, edit, archive, or move cards, manage prerequisite links, or quiz you on due cards and record your ratings.

## What's included

- **Armin connector:** Armin's remote MCP server at `https://intent-bullfrog-922.convex.site/mcp`. It signs in with OAuth; the plugin holds no credentials.
- **writing-study-cards skill:** guidance on card content, card types, and prerequisites, distilled from Andy Matuschak's [How to write good prompts](https://andymatuschak.org/prompts/).

The plugin runs no programs on your computer and has no hooks.

## Access

You approve every connection and can disconnect it under Settings → AI assistants. A connection asks for up to four permission groups: read, write, import, and study. Each covers your whole library, including decks you add later; there are no per-deck choices.

The assistant can't permanently delete cards or decks, reschedule cards on its own, export your library, or change your account. With the study group it records only the ratings you give and must not reveal an answer before you answer. Archiving is reversible and keeps review history. Each connection allows 60 successful writes per hour on Free (600 on Pro), and an account can have 20 active connections.

## Data

The assistant sends the cards, deck names, and prerequisite links it writes to your Armin account. Armin stores them like cards you write yourself and keeps a 90-day activity log of which connection changed which deck, without card snapshots or source text. Armin doesn't fetch the pages you share or run a model; your assistant reads the material, and your AI provider's policies cover the conversation.

## Anki import

A capable assistant calls `get_guide` with topic `anki_import`, downloads the checksummed converter kit, and runs it with Node.js. Conversion happens in its workspace, and cards stay in a staging session until you approve the final preview. Imported decks start fresh; browser import can keep Anki progress.

## Public test account

Reviewers can sign in at [armincards.app](https://armincards.app) with **reviewer@armincards.app** / **ArminDemo123!**. These credentials are public and everyone using the account sees and changes its contents, so add no private material. The sample library is restored about every six hours. Use a personal account for private or persistent work.

## Support

Report problems in [GitHub Issues](https://github.com/andy-spike/armin/issues). Armin's [privacy policy](https://armincards.app/privacy) and [terms](https://armincards.app/terms) apply.
