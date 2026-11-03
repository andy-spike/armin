# Landing page scroll story

Running-app walkthrough on the worktree's local deployment
(`http://armin-8e0113bddc.localhost:35548/`, signed out), driven with
agent-browser in headless Chromium on Linux. Viewports are emulated: 1440×900
for desktop, 390×844 for a narrow screen. No real phone or Safari was used.

## What changed

The landing page is now one story told around one pinned example deck,
"Algorithms". The captions scroll past it, and scroll position drives the deck
through six beats:

1. **Hero:** the deck before the story's new card. Its foundations are due, and
   Dynamic programming rests directly on Recursion and Lookup tables.
2. **Write a card:** the camera moves in and the card editor opens in the empty
   slot; the front and back type out, Save card is pressed, and the header count
   goes from 6 to 7 cards.
3. **Say what it builds on:** the editor folds into the new Memoization card.
   Its edges from Recursion and Lookup tables draw in, each prerequisite ringed
   as it links, and Dynamic programming moves to rest on Memoization. The card
   locks, needing 2.
4. **Review:** a longer beat whose caption holds in place. The review card rises
   out of Function calls and works through all three due cards: Space shows each
   answer, 3, 4, and 3 grade them Good, Easy, and Good. Each grade lands on the
   graph below as the card turns learned with its interval chip.
5. **Unlock:** days pass in the header (Day 1 to Day 16) while accent edges
   ink upwards, and each layer unlocks once its foundations are learned.
6. **Whole subject:** the camera pulls back until the deck is one branch of a
   51-card library, and learning climbs through it.

The previous hero animation (`unlock-graph.tsx`) and the separate interactive
review demo (`review-demo.tsx`) were removed; the story replaces both.

![Desktop, beats 0–2 (light)](2026-11-02-landing-scroll-story/01-desktop-beats-0-2.png)

![Desktop, beats 3–5 (light)](2026-11-02-landing-scroll-story/02-desktop-beats-3-5.png)

## The review beat

Captured mid-scroll (dark): Space on the first card, its Good grade landing on
Function calls, the second card's ratings, the third card graded, and "All
caught up" with the three interval chips.

![Review sequence](2026-11-02-landing-scroll-story/03-review-sequence.png)

- A scripted 6-second scroll through the earlier version of the story recorded
  362 frames, none over 20 ms, on this development machine. Not re-measured
  after the review beat was lengthened, and not measured on a mid-range phone.
- No console errors or warnings during the walkthrough.

## Narrow screens

The hero comes first; the deck then pins under the header and the captions
scroll beneath it.

![390×844 frames](2026-11-02-landing-scroll-story/04-mobile.png)

## Reduced motion

With `prefers-reduced-motion: reduce` emulated, the deck shows one settled
frame per beat and crossfades between them; nothing scrubs, zooms, or types.
The review beat holds its first card with the answer shown, Good chosen, and
the grade on the graph.

![Reduced motion, review beat](2026-11-02-landing-scroll-story/05-reduced-motion-review.png)

## Checks

- `pnpm check`, `pnpm --filter @armin/web build`, and
  `pnpm --filter @armin/mobile check:bundle` pass.

Not verified: Safari and Firefox, a real phone (scroll feel, stage height with
browser chrome, frame rate), and screen readers beyond the stage being hidden
from the accessibility tree while captions carry the text.
