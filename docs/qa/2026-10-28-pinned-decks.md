# Pinned decks walkthrough

Date: 2026-10-28
Checkout: `claude/manual-ui-polish` (`.claude/worktrees/armin-integrations-9e908c`)
Environment: this worktree's local Convex deployment and web app at
`http://armin-b69218dd35.localhost:19808`, headless Chromium through
agent-browser (1280×577), signed in with the seed account. Not a real device.

## Steps

1. Before pinning, the sidebar showed only the "Your decks" group.
2. Right-clicked "Agent sample library" in the sidebar. The menu listed
   "Pin to sidebar", "Rename deck", "Delete deck". Chose Pin to sidebar.
3. A "Pinned" group appeared above "Your decks" with the deck and its due
   badge; the deck also stayed in "Your decks". `convex data decks` showed
   `pinnedAt` set and `version` still 1 (pinning is not an edit).
4. Reopening the sidebar menu showed "Unpin from sidebar".
5. On the Decks page, the deck tile's "Deck actions" menu also showed
   "Unpin from sidebar". Choosing it cleared `pinnedAt` in the database and the
   Pinned group went away.
6. `pnpm check`, `pnpm --filter @armin/web build`, and
   `pnpm --filter @armin/mobile check:bundle` pass.

## Not exercised

- Many pinned decks (the Pinned list caps at 12rem and scrolls).
- The collapsed (icon) sidebar with pins.
- Mobile, which has no deck menu yet.

## Pin latency follow-up

The user's screen recording showed about 4 seconds between choosing Pin or
Unpin and the sidebar changing: the sidebar waited for the live `decks.list`
query to rerun, and that query recomputes every deck's due count. A first
optimistic cache patch cut it to about 1 second but could flip back when an
older `decks.list` result arrived after the patch. The shipped fix keeps
requested pins in a small client store (`lib/pending-pins.ts`) that the sidebar
and menus read until the mutation has saved and the live list agrees.

Measured in headless Chromium (software rendering), sampling the sidebar every
20ms for 8 seconds after each toggle:

- Sidebar page: Pinned appears about 156ms after the click, disappears about
  157ms after Unpin, one change each, no flip-back.
- Decks page (58 tiles): 156ms and 214ms. Each tile subscribes only to its own
  deck's pin, so the grid doesn't redraw on every pin.
- Pinning from the sidebar then opening the deck tile's menu showed "Unpin
  from sidebar"; choosing it removed the Pinned group. The database ended with
  no `pinnedAt` on the deck.
