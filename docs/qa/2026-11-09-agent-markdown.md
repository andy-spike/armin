# Markdown for agents and Ask ChatGPT / Claude walkthrough (2026-11-09)

Production build run with `wrangler dev` on port 8788 (the Workers runtime
Cloudflare uses), checked with `curl` and with desktop Chromium via
agent-browser. The 390 px check is an emulated viewport in desktop Chromium,
not a phone.

## Markdown at page URLs (Nimbus's documented setup)

A first version used a custom Worker in front of the static site. It was
replaced with Nimbus's own setup: `nimbus-docs add adapter-cloudflare`
installed `@astrojs/cloudflare`, set `output: "server"` and
`rendering: { default: "request" }`, and updated the route files. The build
reports `docs prerendered=0/11 (11 moved)` and still indexes all 11 pages for
search.

| Request | `Accept` | Result |
| --- | --- | --- |
| `/guides/reviewing/` | `text/markdown` | 200 `text/markdown`, `Vary: Accept` |
| `/guides/reviewing/` | `text/markdown, text/html;q=0.9` | 200 Markdown |
| `/guides/reviewing/` | `text/markdown, text/html, */*` | 200 HTML: Markdown must outrank HTML, so a tie gets HTML |
| `/guides/reviewing/` | Chromium's default | 200 HTML, `Vary: Accept` |
| `/guides/reviewing/` | `*/*` | 200 HTML |
| `/` | `text/markdown` | 200 Markdown of the home page, with the discovery `Link` headers |
| `/nope/` | `text/markdown` | 404 Markdown ("There is no page at `/nope/`") linking the docs index |
| `/nope/` | `text/html` | 404 HTML page |
| `/llms.txt`, `/guides/reviewing/index.md`, `/pagefind/pagefind.js` | `*/*` | 200, unchanged |
| `HEAD /guides/reviewing/` | `text/markdown` | 200 `text/markdown` |

In the browser the server-rendered Reviewing page loaded with both Ask
buttons, and searching `bury` found 2 pages
([screenshot](2026-11-09-agent-markdown/server-search.png)).

The build warns that `404.astro` reads request headers while prerendered. A
fresh `create-nimbus-docs --adapter cloudflare` site prints the same warning,
so it comes from Nimbus. `nimbus-docs check` reports structure as partly
checked, as its docs say for request-rendered pages.

The scaffold's compatibility date (2026-11-09) is newer than the installed
Workers runtime supports (2026-10-30), so `wrangler dev` refused to start; it
now matches the web app's 2026-10-19.

## Ask ChatGPT / Ask Claude

1. Reviewing at 1280×900: the actions read Updated · Copy page · Markdown ·
   Ask ChatGPT · Ask Claude on one line
   ([screenshot](2026-11-09-agent-markdown/page-actions-desktop.png)).
2. The links open `https://chatgpt.com/?hints=search&q=…` and
   `https://claude.ai/new?q=…` in a new tab with the prompt "Read
   https://docs.armincards.app/guides/reviewing/index.md so I can ask questions
   about it. It is a page of the Armin docs, a spaced-repetition flashcard app."
3. At 800×900 (sidebar beside narrow content) the row wraps after Ask ChatGPT.
   An earlier version left a "|" separator at the end of the first line, so
   the separators were removed; the wrap is now clean
   ([screenshot](2026-11-09-agent-markdown/page-actions-800px.png)).
4. At 390×844 the actions use the short labels ChatGPT and Claude
   ([screenshot](2026-11-09-agent-markdown/page-actions-390px.png)).

The chats themselves were not opened: the prompts point at
`docs.armincards.app`, which isn't deployed yet.

`pnpm check`, `astro check`, and the production build passed.
