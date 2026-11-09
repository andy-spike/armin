# Docs search walkthrough (2026-11-09)

Search reads the Pagefind index that only the production build writes, so this
ran against `pnpm --filter @armin/docs build` served by `astro preview` on port
4322, in desktop Chromium via agent-browser. The 390 px check is an emulated
viewport in desktop Chromium, not a phone.

1. Reviewing page, 1280×900: the sidebar has no filter box
   (`[data-nb-sidebar-filter-input]` is absent). Pressing `/` opened the search
   dialog. Before typing it shows "Search every page of the Armin docs." and five
   suggested searches, with a footer hint for `/`
   ([screenshot](2026-11-09-docs-search/search-open.png)).
2. Typing `clo` matched "cloze" by prefix: Cards and decks and Import from
   Anki, each labelled GUIDES, with matched headings listed under them.
3. `bury` returned Reviewing with its Bury heading; `zebra` showed "No results
   for “zebra”. Try a shorter or different word."
4. Ctrl K opened search, `cloze` highlighted the matches in the excerpts,
   ArrowDown selected the first result, and Enter opened
   `/guides/cards-and-decks/`. A result no longer repeats its own page title
   in the heading list ([screenshot](2026-11-09-docs-search/search-results-cloze.png)).
5. Ranking: with Pagefind's short-page bias lowered, the guide ranks first for
   `daily limits` (Reviewing), `bury` (Reviewing), `cloze` (Cards and decks),
   and `anki` (Import from Anki); before the change the Guides overview came
   first for `daily limits`.
6. At 390×844, the header search icon opened the dialog, and tapping **Daily
   limits** ran that search with 3 results
   ([screenshot](2026-11-09-docs-search/search-390px-suggestion.png); taken
   before the ranking change).

`pnpm check`, `astro check`, and the production build passed.
