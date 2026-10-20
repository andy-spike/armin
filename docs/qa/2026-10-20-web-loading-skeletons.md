# Web loading skeletons

Checked against this worktree's dev server (`http://armin-0de0fe9ba9.localhost:29132`)
in a headless Chromium session driven by agent-browser, with a 1280 by 850 viewport.
I signed in with the shared test account. This was a desktop browser check only. I
did not test a mobile device or a mobile viewport.

## What changed

- `components/ui/skeleton.tsx` is now the shadcn/ui Skeleton (`data-slot`, props
  spread), using the app's `.skeleton` shimmer because this theme uses `muted` as a
  text color.
- While the account is loading or a library is being set up, `_app.tsx` used to show
  a centered "Loading your library" card. It now shows the real header and nav, with
  a skeleton of the page being opened (Decks, Browse, deck, graph, review, deck
  review, Settings).
- The in-page skeletons for Decks, Browse, deck, and review moved to
  `components/page-skeletons.tsx`. Each one now includes the rows it used to leave
  out (sort control, filter bar, card count, review card metadata), and its tiles
  are sized to match the loaded tiles.
- The graph's "Loading graph…" text is now a skeleton of the canvas controls and
  node placeholders. It fades out the same way as before.
- The deck settings dialog shows skeleton setting rows instead of "Loading
  settings…", so the dialog no longer grows when the settings arrive.

## How it was checked

To hold each page in its signed-in loading state, I loaded it with an init script
that replaced `WebSocket` with a stub that never connects. Convex queries stayed
pending, so the app-level skeleton stayed on screen. I took a screenshot of each
page in that state and another after a normal load, then blended the two at 50%.
After fixes, these matched to within a few pixels:

- Decks: header, sort control, deck tiles (164px).
- Browse: filter bar (82px), count line, flashcard tiles (216px).
- Deck: back link line, deck header, tag and sort bar, count line, tiles.
- Review and deck review: header, metadata row, progress and Undo row, card (300px),
  and answer controls.
- Graph: back and search, Tidy layout, and zoom controls at React Flow's panel
  positions. Node placeholders are approximate, because node placement depends on
  the deck.
- Settings: title, tabs, and the first two sections.
- Deck settings dialog (opened while the browser was offline): the skeleton rows
  have the same size as the loaded rows, and the footer stays in place.

The header's Review button gains its "(n)" due count after loading, which still
moves the theme toggle slightly to the left.

## Validation

- `pnpm typecheck`
- `pnpm lint`
- `pnpm --filter @armin/web build`

No test suites were added, following the web migration validation policy.
