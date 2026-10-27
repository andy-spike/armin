# The web app reads through live Convex subscriptions; Browse reads derived data

The Convex migration research (`docs/research/convex-web-migration.md`) chose
built-in reactivity, and the mobile app uses it. The web app instead kept the
desktop app's request-and-response client (`window.armin`): every read was a
one-off query, and after any write `LibrarySync` threw away the whole cache and
refetched every open screen. Several reads also took a clock argument that
changed every 30 seconds, which re-ran them on a timer and defeated Convex's
query cache. On a 717-card deck, one rating refetched five queries, and Browse
read every card and every review unit on each page.

We changed both:

- **Live reads.** Every study read in `apps/web/src/lib/queries.ts` is a Convex
  subscription through `@convex-dev/react-query`. Convex pushes a new result
  only when data the query read changes, and a mutation's promise resolves
  after its effects reach the subscriptions, so writes need no invalidation.
  Unused subscriptions close five minutes after their last reader leaves.
- **A clock that moves only when needed.** Time-dependent reads take the
  shared study clock (`lib/study-clock.ts`) as `now`. `review.status` returns
  `refreshAt`, the next unit falling due or the next study day, and the clock
  advances then, so those queries re-run once, together, when a count can
  actually change.
- **Derived Browse data.** `flashcardSummaries` holds each flashcard's sort
  keys, search text, and unit aggregate, with an index per Browse sort;
  `deckCounters` holds per-deck totals. Triggers (`convex-helpers`) note the
  flashcards each mutation touches, and the mutation rebuilds those summaries
  before it commits, so the derived rows never disagree with the source rows.
  All mutations come from `convex/functions.ts`; lint rejects the raw builders.
  Browse pages through summaries with Convex cursors, and the client pins each
  loaded page's end cursor so live changes never leave gaps or repeats.

Consequences:

- Forms keep reading a snapshot when they open (card editor, deck settings),
  so a live update never replaces unsaved input, as the research required. The
  review session already holds the card on screen apart from queue updates.
- Browse orders differ slightly: "due soon" orders scheduled cards by due time
  rather than alphabetically within a due bucket, new cards by creation time,
  and a descending sort reverses ties too. Search stays a substring match, but
  over summaries; a filtered count scans the scope's summaries (at most the
  2,000-card quota) instead of reading counters.
- Each write does a little more work (a summary and a counter row), and the
  summaries table carries fourteen indexes.
- Deploying the summaries needs a one-time `maintenance:backfillSummaries` run
  (`docs/deploy-cloudflare.md`). `maintenance:rebuildDeckCounters` repairs a
  deck's counters if they are ever in doubt.
