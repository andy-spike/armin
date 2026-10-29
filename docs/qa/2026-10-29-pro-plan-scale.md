# Pro plan at 100,000-card scale walkthrough

Date: 2026-10-29
Checkout: `ccr-89815fb4-tsstpn` (cloud session)
Environment: this checkout's local Convex deployment and web app at
`http://localhost:3000`, headless Chromium (Playwright, 1280×860 viewport),
seed account. Not a real device.

## Library

The seed account was set to `plan: "pro"` and filled through a temporary,
uncommitted internal mutation with 47,504 flashcards: four decks of 10,000
basic cards, one deck of 7,500 two-gap cloze cards (15,000 review units, the
per-deck maximum), and the 4 sample cards.

## Steps

1. Inserting card 10,001 into a full deck failed with `QUOTA`: "A deck holds
   at most 10,000 flashcards."
2. Sign-in to decks list: about 10.6 s including the first queries on a cold
   local backend. Every deck shows its card count and due/new counts
   (`decks.png`).
3. Review, all decks: the queue loaded 10 new units (the daily new-unit cap)
   in fixed Frontier order. Rated three cards; progress went 0 → 3 of 10 and
   the sidebar counts dropped with each rating.
4. Stats, all decks: heatmap, reviews per day, due forecast, and state totals
   rendered from deck counters without errors.
5. Browse, all decks: 47,504 flashcards counted; the first page rendered.
   Searching "Question 31234" first hung (the filtered count scanned every
   summary and timed out). Search now uses a Convex search index; the match
   appeared in about 4 s with "1 flashcard of 47504" (`search.png`).
6. Switched the library to `free` and added a card: refused, and the toast now
   shows the reason, "The free plan allows 1000 flashcards per library, and
   this one has 47504." (`free-limit.png`).
7. No browser console errors. `pnpm check`, `pnpm --filter @armin/web build`,
   and the mobile bundle check pass.

## Not exercised

- Export of the large library, the graph view of a 10,000-card deck, and the
  library-wide prerequisite-floor lock refresh.
- Mobile clients and real devices.
