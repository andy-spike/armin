# Deck slug walkthrough

Verified in headless Chromium through agent-browser against this worktree's
running app at http://armin-b69218dd35.localhost:19808. This was a desktop browser
session, not a physical device check.

- Signed in through the normal form with the local development account.
- Ran `deckSlugs:backfill` against this checkout's local Convex deployment;
  reran the idempotent migration after changing it to scheduled batches.
- Opened the supplied legacy `/deck/kx73t8bn1m7g04tqycbk3e6fah8h7g4f` link.
  It redirected to `/deck/5000-most-common-french-words-a-2-the-study-of-sounds-phonology-ii-words-with-irregular-pronunciatio`.
  The matching deck heading and flashcard appeared.
- Followed Graph: the friendly path retained `/graph` and the matching
  prerequisite graph heading appeared.
- Opened the legacy ID `/review` link directly. It redirected to the slug with
  `/review`; the flashcard and Show answer control appeared. No review was rated.
- Used Back to deck, then Cram and Start. The slug URL retained `/cram` and the
  selected states search parameter.

Validation: `pnpm check`, `pnpm --filter @armin/web build`, and
`pnpm --filter @armin/mobile check:bundle` passed. The mobile check exported both
Android and iOS bundles; no simulator or physical device walkthrough was run.

Duplicate allocation, Unicode normalization, and rename stability were inspected
in code, not separately exercised through the UI. Slug allocation is shared by
all creation paths and uses an indexed lookup in the creation transaction.
Existing deployments need the documented backfill before old decks emit slugs.
