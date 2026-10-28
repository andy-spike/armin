# Armin

Turn what you read into study cards that unlock in the right order, or bring an existing Anki deck over without losing its images.

[Armin](https://armincards.app) is a spaced-repetition flashcard app whose cards
form a prerequisite graph. A card stays locked until the cards it depends on are
learned, and FSRS schedules every review. This plugin lets your assistant write
those cards for you from an article, lecture notes, a document, or code you share
in the conversation.

## Install

For connection steps, permissions, tools, and troubleshooting, read the
[MCP server documentation](https://armincards.app/docs/mcp).

In Claude or ChatGPT, search for Armin in the plugin directory and add it.
Coding agents can also install it from this repository:

```bash
# Claude Code
/plugin install armin --marketplace andy-spike/armin

# Codex
codex plugin marketplace add andy-spike/armin
codex plugin add armin@armin
```

## Use it

1. Install the plugin, then connect Armin when asked. Your browser opens Armin,
   where you sign in and approve the connection.
2. Share some material and ask for cards, for example: "Make study cards in
   Armin from this article."
3. The assistant writes focused cards, links foundational cards to the ideas
   built on them, saves the deck, and replies with a link to start studying.

You can also ask it to list your decks, read a deck back, edit or archive a
card, move a card to another deck, or add and remove prerequisite links.

## Import an Anki deck

Give the assistant an `.apkg`, `.colpkg`, or Anki text export and ask it to
import the deck into Armin. It downloads Armin's versioned converter, runs it in
its own sandbox, and shows a preview before saving. Supported images are
preserved; unsupported cards are repaired only if you ask, or explicitly skipped
with a reason. MCP imports always start fresh, with no Anki due dates or review
history.

This route needs an assistant environment that can receive the file and run
Node.js 20, 22, or 24. A chat client without file access or code execution
cannot run the converter; use **Import from Anki** in Armin's deck list instead.

## Public test account

Reviewers can sign in at [armincards.app](https://armincards.app) with
**reviewer@armincards.app** / **ArminDemo123!**. These credentials are public.
Everyone using the account can see and change its contents; do not add private
material. The sample library is restored roughly every six hours, so changes
and review history are temporary. Sign-in details and account deletion are
protected. Use a personal account for private or persistent work.

## What's included

- **Armin connector**: Armin's remote MCP server at
  `https://intent-bullfrog-922.convex.site/mcp`, which provides the deck and
  card tools. It signs in with OAuth; the plugin contains no private credentials.
- **writing-study-cards skill**: guidance for deciding what to put on each card,
  choosing card types, and wiring prerequisites, distilled from Andy Matuschak's
  [How to write good prompts](https://andymatuschak.org/prompts/).

The plugin runs no programs on your computer and has no hooks. The converter kit runs only in the assistant environment you choose, with Node.js.

## Permissions

You approve every connection in Armin and can change or revoke it at any time
under Settings → AI assistants. By default a connection can only see and change
the decks it creates. You can choose to share existing decks or your whole
library, and separately allow edits to existing content.

The assistant cannot permanently delete cards or decks, rate reviews or change
scheduling, export your library, or change your account. Ordinary card
authoring is text-only. A scoped Anki import may upload PNG, JPEG, GIF, WebP,
BMP, or AVIF images and keeps them private to your library; SVG, audio, and video
are not accepted. Archiving a card is reversible and keeps its review history.

## Data

The assistant sends the cards, deck names and descriptions, prerequisite links,
and any staged Anki cards and images to your Armin account at the address above.
Armin stores them in your library like cards you write yourself, and keeps a
90-day activity log of which connection changed which deck, without card
snapshots or source text. Unfinished Anki staging exports expire after 24 hours.
Armin does not fetch the pages you share or run a model; your assistant reads the
material. Your AI provider's own policies cover the conversation.

## Support

Report problems in [GitHub Issues](https://github.com/andy-spike/armin/issues).
Armin's [privacy policy](https://armincards.app/privacy) and
[terms](https://armincards.app/terms) apply.
