# Search dialog walkthrough (2026-11-09)

Production build of the docs served by `astro preview` on port 4322, desktop
Chromium via agent-browser, with browser storage cleared first. The 390 px
checks are an emulated viewport in desktop Chromium, not a phone.

1. Reviewing page, light, 1280×900: `/` opened the dialog: a paper panel with
   a hairline border and the app's overlay shadow over a paper wash, a 56px
   input, "Search every page of the Armin docs.", five suggested searches, and
   a footer of app-style key caps
   ([screenshot](2026-11-09-search-dialog/idle-light.png)).
2. Typing `cloze`: the status reads "2 pages found" for screen readers, the
   first result is highlighted (`aria-activedescendant` is set), matches are
   highlighted, and each page lists its matching headings as their own rows. A
   clear (×) button appeared in the input
   ([screenshot](2026-11-09-search-dialog/results-light.png)).
3. ArrowDown twice highlighted the heading row "Cloze deletions"; Enter opened
   `/guides/cards-and-decks/#cloze-deletions`.
4. On that page Ctrl K reopened search, now listing "Recently opened" with
   CARDS AND DECKS / Cloze deletions and a **Clear** action. Escape closed the
   dialog. The same view in dark mode
   ([screenshot](2026-11-09-search-dialog/recent-dark.png)).
5. At 390×844 the dialog fills the width under a 12px margin, the close button
   reads **Cancel** (no Esc key cap), and the keyboard hints are hidden.
   `import` returned Import from Anki first, followed by four more pages
   ([screenshot](2026-11-09-search-dialog/results-390px.png)). Tapping
   **Cancel** closed it.
6. `qwxyz` at 390px: "No results for “qwxyz”. Check the spelling, or try a
   shorter or different word." with the suggested searches below
   ([screenshot](2026-11-09-search-dialog/no-results-390px.png)).

The first 390px capture showed both "Esc" and "Cancel"; the key cap's own
display class overrode `hidden`. It is now wrapped, and the recapture shows only
**Cancel**.

`pnpm check`, `astro check`, and the production build passed.
