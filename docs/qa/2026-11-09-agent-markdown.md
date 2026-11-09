# Markdown for agents and Ask ChatGPT / Claude walkthrough (2026-11-09)

Production build run through the docs Worker with `wrangler dev` on port 8788
(the Workers runtime Cloudflare uses), checked with `curl` and with desktop
Chromium via agent-browser. The 390 px check is an emulated viewport in desktop
Chromium, not a phone.

## Markdown at page URLs

| Request | `Accept` | Result |
| --- | --- | --- |
| `/guides/reviewing/` | `text/markdown` | 200 `text/markdown`, `Content-Location: /guides/reviewing/index.md`, `Vary: Accept` |
| `/guides/reviewing` | `text/markdown, text/html, */*` | 200 Markdown (a tie goes to Markdown) |
| `/guides/reviewing/` | `text/markdown, text/html;q=0.9` | 200 Markdown |
| `/guides/reviewing/` | Chromium's default | 200 HTML, `Link: </guides/reviewing/index.md>; rel="alternate"; type="text/markdown"`, `Vary: Accept` |
| `/guides/reviewing/` | `*/*` | 200 HTML |
| `/` | `text/markdown` | 200 Markdown of the home page |
| `/` | `text/html` | HTML with Nimbus's discovery `Link` headers, its Markdown link listed once |
| `/nope/` | `text/markdown` | 404 Markdown body linking `/llms.txt` and `/llms-full.txt` |
| `/nope/` | `text/html` | 404 HTML page |
| `/llms.txt`, `/guides/reviewing/index.md` | any | served unchanged |
| `HEAD /guides/reviewing/` | `text/markdown` | 200 `text/markdown` |
| `/pagefind/pagefind.js` | default | 200, served without the Worker |

The first `wrangler dev` run failed: the scaffold had set the compatibility
date to today (2026-11-09), newer than the installed runtime supports
(2026-10-30), which would also have failed a deploy. It now matches the web
app's 2026-10-19.

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
