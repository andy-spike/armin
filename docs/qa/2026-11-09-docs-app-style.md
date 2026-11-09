# Docs site in the app's style walkthrough (2026-11-09)

`pnpm dev:docs` (`http://localhost:4321`), desktop Chromium via agent-browser.
The 390 px check is an emulated viewport in desktop Chromium, not a phone.

1. Home, light, 1280×900: warm Flexoki paper with the app's dot grid, a bg-2
   header and sidebar, the Armin tree (cyan tips) beside the serif "armin"
   wordmark, Source Serif 4 page and section headings, cyan underlined links,
   and square corners. The current page is a paper row with ink text, as in the
   app's sidebar. No demo account appears
   ([screenshot](2026-11-09-docs-app-style/home-light.png)).
2. Navigation: before clicking **Cards and decks** a marker was set on
   `window`; after the click it was gone and the navigation entry type was
   `navigate`, so the page loaded normally instead of through Astro's
   client router. The page has no `astro-view-transitions-enabled` meta, so no
   transition animation runs.
3. Cards and decks, dark: Flexoki black paper, the dark sidebar, and the cyan
   tips read clearly ([screenshot](2026-11-09-docs-app-style/cards-and-decks-dark.png)).
4. The page footer shows **Edit this page on GitHub**, linking to
   `github.com/andy-spike/armin/edit/master/apps/docs/src/content/docs/guides/cards-and-decks.mdx`
   (the file exists). The sidebar ends with **Source code on GitHub** and
   **Report an issue**; the header keeps its GitHub icon
   ([screenshot](2026-11-09-docs-app-style/page-footer-dark.png)).
5. Reviewing at 390×844, light: the header holds the mark, wordmark, search,
   GitHub, theme, and menu buttons; the ratings table fits with no horizontal
   page scroll ([screenshot](2026-11-09-docs-app-style/reviewing-390px-light.png)).

`pnpm check`, `astro check`, the production build (11 pages indexed), and
`nimbus-docs check` passed.
