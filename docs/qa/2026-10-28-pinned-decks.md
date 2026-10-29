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
