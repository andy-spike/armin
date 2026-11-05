# Concept card review walkthrough (2026-11-04)

Local worktree deployment, desktop Chromium via agent-browser (1440×960
viewport), sample account `test@example.com`. Variants come from the generator's
fake provider; no model was called. A second agent-browser session, signed in
separately, stood in for a second device.

1. Deck → **Add card** → **Concept** with the brief "Multiplying two whole
   numbers under 20…", then **Add card**. While the first batch was generating,
   the toast confirmed the card and Review still showed **3**
   ([screenshot](2026-11-04-concept-card-review/pending.png)). About three
   seconds later the deck read **4 due now** and Review **4**
   ([screenshot](2026-11-04-concept-card-review/eligible.png)). The two concept
   cards from the creation walkthrough, which have variants but were generated
   before assignment existed, stayed out of the count: a card with no assigned
   variant is not admitted.
2. The deck review session reached the concept card after the three seed cards.
   It showed fake variant 8, "Compute 8 × 10", with KaTeX rendering
   ([screenshot](2026-11-04-concept-card-review/exercise.png)).
3. Reloading the page started a new session; the concept card showed
   variant 8 again. The second browser session's review showed the same
   variant 8 ([screenshot](2026-11-04-concept-card-review/second-session.png)).
   **Show answer** revealed the worked solution with Again, Hard, Good, and Easy
   ([screenshot](2026-11-04-concept-card-review/solution.png)).
4. The second session rated **Again**. The first session, still showing
   variant 8 with its answer revealed, then rated **Good**: it was refused with
   "This card changed since it was shown. Reload it to continue. Your answer to
   that card wasn't saved." ([screenshot](2026-11-04-concept-card-review/stale.png)).
   `convex data` showed what the rating wrote in one transaction: the unit now
   showed variant 9 at version 3, variant 8 had a `lastShownAt`, and the review
   log's `beforeVariant` named variant 8 with no previous last-shown time.
5. **Undo** in the second session brought the concept card back as New with
   variant 8 ([screenshot](2026-11-04-concept-card-review/undo.png)). The unit
   was back on variant 8 with its New schedule (version 4), and variant 8's
   `lastShownAt` was gone again.
6. Rating it **Again** once more assigned variant 4, a different random unseen
   variant (Convex seeds `Math.random` per mutation, so each rating draws
   differently). To reach exhaustion without dozens of ratings, a temporary
   internal mutation (removed afterwards, never committed) marked every other
   variant seen, variant 3 longest ago. Ten minutes later the learning step
   came due and the review showed variant 4
   ([screenshot](2026-11-04-concept-card-review/next-variant.png)).
7. Rating variant 4, the last unseen one, left no unseen variant. The unit was
   assigned variant 3, the one shown longest ago, and the review showed it
   when it came due ([screenshot](2026-11-04-concept-card-review/reuse.png)).
   Rating it again assigned variant 1, the next oldest, with no blocking.
8. Stats counted the concept card's reviews with the others: 5 reviews in the
   last 30 days, 7 review units, the concept card in the learning state, and 1
   due today ([screenshot](2026-11-04-concept-card-review/stats.png)).

## Mobile

Not recorded on the Android emulator. This machine has no Android SDK
(`~/Android/Sdk` and `~/.config/android/env.sh` are absent, and `emulator`,
`adb`, and `agent-device` aren't installed), and T3's `device_list` reports
"Agent device access is turned off for this environment". Mobile renders the
review unit's `front` and `back` from `review.items` and rates with its
`version`, the same path this change uses, and `check:bundle` passes, but a
concept card review on the emulator still needs to be recorded.
