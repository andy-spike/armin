# Nimbus docs site walkthrough (2026-11-09)

`pnpm dev:docs` (Astro dev server at `http://localhost:4321`), desktop Chromium
via agent-browser. The site is static and needs no backend or account. The 390 px
check is an emulated viewport in desktop Chromium, not a phone.

1. Home at 1280×900: the header shows the Armin tree mark and "Armin docs"; the
   sidebar lists Introduction, Getting started, the Guides group (seven pages),
   and the Reference group (two pages). The demo account tip renders from its
   partial, and the card grid links to four guides
   ([screenshot](2026-11-09-nimbus-docs-site/home-desktop.png)).
2. Cards and decks: the card type table and the cloze code block render
   ([screenshot](2026-11-09-nimbus-docs-site/cards-and-decks-desktop.png)).
3. Import from Anki: choosing the **In the browser** tab switched its content.
4. Prerequisites with **Dark mode** on: the header, sidebar, prose, and note
   aside all switch to the dark theme
   ([screenshot](2026-11-09-nimbus-docs-site/prerequisites-dark.png)).
5. Reviewing at 390×844: the sidebar collapses behind the menu button, the
   table of contents becomes the **Overview** dropdown, and the ratings table
   fits without horizontal page scroll
   ([screenshot](2026-11-09-nimbus-docs-site/reviewing-390px.png)).
6. An unknown path showed the 404 page, titled "Page not found | Armin".
7. `/llms.txt`, `/guides/reviewing/index.md`, `/og.png`, and `/favicon.svg` each
   returned 200. The site social card shows the Armin mark over the site
   description.

The production build (`pnpm --filter @armin/docs build`) wrote 11 doc pages
and indexed all 11 for search. Search itself was not exercised in the dev
server, which has no index.
