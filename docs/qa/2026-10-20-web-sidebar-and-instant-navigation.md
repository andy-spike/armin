# Web sidebar and instant navigation

Checked against this worktree's dev server (`http://armin-e8fe6745a7.localhost:38958`)
and a production build served by `vite preview` on port 38960, both in a headless
Chromium session driven by agent-browser. I signed in with the shared test account.
Desktop checks used a 1280 by 800 viewport. Mobile checks used an emulated 390 by
844 viewport in the same desktop browser, not a real phone.

## What changed

- The top bar is replaced by a collapsible left sidebar (shadcn sidebar on Base
  UI). It holds Review with its due count, Decks, Browse, the deck list with due
  counts, Settings, the theme switch, and the account menu. `[` toggles it, and
  the state is kept in the `sidebar_state` cookie. Below 768px it opens as a
  sheet from a top bar.
- Signed-in navigation no longer asks the server for auth on every click. The
  browser remembers the answer for the page's lifetime. The server reuses the
  Convex token cookie instead of minting a new token on each full load.
- Each page's route loader prefetches its data, so hovering a link (or pressing
  `g`, the first key of the navigation shortcuts) loads the page before the click
  or second key.
- The card editor (TipTap) loads when its dialog first opens, preloaded while
  the browser is idle.
- The zod-free flashcard rules moved to `@armin/core/flashcard-rules`, so the
  web client no longer ships zod. The React Flow stylesheet loads only with the
  graph page.
- The root and the signed-in `_app` frame now render on the server. The HTML
  contains the sidebar (in its saved collapsed or expanded state) and the
  skeleton of the opened page. Study pages still render in the browser.
  Signed-out requests to app pages are redirected by the server. Pages are sent
  with `Cache-Control: private, no-store` because the HTML carries the viewer's
  Convex token for hydration.

## How it was checked

Sidebar:

- `[` collapsed and expanded the sidebar. The footer rows (Settings, theme,
  account) kept their size in both states.
- The account menu opened above the account row, left-aligned with it. In the
  collapsed rail it opened beside the avatar.
- Theme: clicking the row flipped light and dark. With dark mode saved and the
  sidebar collapsed, a full reload rendered the rail with the sun icon and no
  hydration warnings.
- Mobile viewport: the top bar showed the menu button and wordmark. The button
  opened the sidebar as a 293px sheet.

Server rendering and hydration:

- With the session cookie, `/`, `/browse`, `/review`, and `/settings` returned
  HTML containing the sidebar, the "Your decks" group, and the page skeleton
  (`aria-busy`), in about 30ms from the dev server.
- Without a cookie, `/` returned a 307 redirect to `/sign-in`.
- I loaded Decks, a deck, its graph, deck review, Browse, Review, and Settings
  fresh and saw no console errors. The first run found a hydration mismatch from
  the sidebar skeleton's random widths, which are now derived from `useId`.
- After a server-rendered load, navigating made no auth server-function calls.

Speed (production build, warm runs, Browse page, local machine):

| Full load | First paint | Real content |
| --- | --- | --- |
| Frame client-rendered (before) | 136–152ms | 582–991ms |
| Frame server-rendered (after) | 76–116ms | 582–654ms |

Content still waits for the Convex connection and the page's queries, so its
timing is unchanged. The frame shows sooner.

| Page switch | Before this branch | After |
| --- | --- | --- |
| Repeat visit | 240–290ms (dev) | 14–32ms (production) |
| First visit after hovering the link | 330–840ms (dev) | 21–71ms (production) |
| `g` then `b` to Browse, about 250ms between keys | up to about 630ms (dev) | 170–296ms (dev) |

JavaScript downloaded per page, gzip:

| Page | Before | After |
| --- | --- | --- |
| Deck | 456 kB | 287 kB |
| Browse | 444 kB | 275 kB |
| Review | 482 kB | 316 kB |
| Graph | 509 kB | 340 kB |

Pages other than the graph also skip the 2.6 kB (gzip) React Flow stylesheet,
which used to block first paint.

The lazy card editor opened from "Add card" on the deck page, closed, and
reopened normally.

## Validation

- `pnpm typecheck`
- `pnpm lint`
- `pnpm --filter @armin/web build`
- `pnpm --filter @armin/mobile check:bundle`

No test suites were added, following the web migration validation policy.
