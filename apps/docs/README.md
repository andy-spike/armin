# Armin docs

The Armin user guide, built with [Nimbus](https://nimbus-docs.com), Cloudflare's
docs framework on Astro. It is a Cloudflare Worker, separate from the web app,
meant to be served at `https://docs.armincards.app` (the `site` in
`astro.config.ts`). It needs no backend.

## Develop

From the repository root:

```bash
pnpm dev:docs   # http://localhost:4321
```

The dev server renders pages as you edit, and answers `Accept: text/markdown`
too. Search needs the production build; see
[Preview the production build](#preview-the-production-build). After changing
`astro.config.ts` or the adapter, restart the dev server.

## Search

The header search (or `/`, or Ctrl/⌘ K, on any page) searches every page with
[Pagefind](https://pagefind.app), which indexes the site during the production
build; there is no separate sidebar filter. The dialog is drawn like the app's
command palette. Results show the page's sidebar group, a highlighted excerpt,
and the matching headings as their own rows; the top result is highlighted, so
Enter opens it, and the arrow keys reach every page and heading (Ctrl/⌘ Enter
opens a new tab). Reopening on the same page keeps the last search. Before the
reader types, the dialog lists the pages they recently opened from search (kept
in this browser's storage only) and suggested searches, set in
`src/components/ui/search/SearchDialog.astro`; keep those to topics people look
up. The dialog's markup is in that file and its behaviour in `search.client.ts`;
the ranking option lives in `src/components/ui/search/providers/pagefind.ts`.

The dev server has no index, so try search on the
[production build](#preview-the-production-build).

## Write a page

Pages are MDX files in `src/content/docs/`. The folder tree is both the URL
structure and the sidebar: `guides/reviewing.mdx` is served at
`/guides/reviewing/` under the Guides group. Every page needs a `title` in its
frontmatter; `sidebar.order` sorts pages within a group. Shared passages live in
`src/content/partials/` and are included with `<Render file="name" />`.

Components available in every page without an import (such as `Aside`, `Steps`,
`Tabs`, and `CardGrid`) are registered in `src/components.ts`. Install more from
the Nimbus registry with `pnpm --filter @armin/docs exec nimbus-docs add <name>`.

[AGENT.md](AGENT.md) is Nimbus's guide for coding agents working on the site,
including upgrades.

## AI agents

Nimbus publishes a Markdown version of every page (`/<slug>/index.md`),
`llms.txt` indexes, `llms-full.txt`, and the agent discovery files under
`/.well-known/` ([Docs for agents](https://nimbus-docs.com/ai/docs-for-agents)).
On top of that:

- **Markdown at page URLs**, set up as Nimbus documents it
  ([Serve Markdown at page URLs](https://nimbus-docs.com/ai/markdown-negotiation)):
  the Cloudflare server adapter (`nimbus-docs add adapter-cloudflare`) and
  `rendering: { default: "request" }` in `astro.config.ts`, so the docs render
  on request. A request whose `Accept` header ranks `text/markdown` above every
  HTML and wildcard type gets the page's Markdown at the page's own URL; a
  browser's `*/*` still gets HTML. Both send `Vary: Accept`, and an unknown page
  asked for in Markdown gets a short Markdown 404 that links `llms.txt`. The
  search index, sitemap, `llms.txt`, and Markdown versions are still prepared at
  build time; the 404 page, social cards, and `robots.txt` stay prerendered.
- **Ask ChatGPT / Ask Claude.** Each page's actions open a new chat that reads
  the page's Markdown from `https://docs.armincards.app`, so they answer from
  the live site, not a local build (`src/components/ui/page-actions/`).

The build prints a warning that `404.astro` reads request headers while
prerendered. A fresh Nimbus site with the Cloudflare adapter prints the same
one; it comes from Nimbus, not this project, and the 404 page works.

## Preview the production build

```bash
pnpm --filter @armin/docs preview:cf   # builds, then runs it with wrangler dev on http://localhost:8787
curl -H 'Accept: text/markdown' http://localhost:8787/guides/reviewing/
```

This runs the Worker as Cloudflare will, with search and Markdown at page URLs.

## Validate

```bash
pnpm --filter @armin/docs typecheck          # astro check, including .astro files
pnpm --filter @armin/docs build              # validates frontmatter, MDX, and links
pnpm --filter @armin/docs exec nimbus-docs check
```

`nimbus-docs check` reports structure as "partly checked": it can't verify
request-rendered pages, so a passing production build is the gate for them.
`pnpm check` at the root formats and lints this workspace too. It reads `.astro`
imports through the ambient declaration in `src/env.d.ts`; `astro check` does
the real type checking for them. CI runs the typecheck and build.

## Deploy

`pnpm --filter @armin/docs deploy` checks, builds, and publishes the
`armin-docs` Cloudflare Worker: the server the adapter builds, with the static
files beside it. The adapter writes the full deploy config to
`dist/server/wrangler.json`; `wrangler.jsonc` holds only the name, the
compatibility date, and flags. Its compatibility date matches the web app's: a
date newer than the installed Workers runtime stops `wrangler dev` and deploys. To serve it at
`docs.armincards.app`, add that custom domain to the Worker in the Cloudflare
dashboard (or as a `routes` entry in `wrangler.jsonc`).

## Look

The site wears the app's design system ([DESIGN.md](../../DESIGN.md)). Colours
come from the web app's Flexoki tokens, imported by `src/styles/globals.css`
from `apps/web/src/styles/`, so a palette change there reaches the docs too;
the Nimbus `--nb-*` tokens only point at them. `BaseLayout.astro` sets
`data-theme` alongside Nimbus's `data-mode` so those tokens switch for dark
mode. Headings use Source Serif 4, corners are square, and the page carries the
app's dot-grid paper. The logo and wordmark come from the web app's generated
`apps/web/src/components/brand-paths.ts`.

Pages load as ordinary navigations: Astro's client router and its view
transitions are removed on purpose, so moving between pages has no animation.

Every page links to its source with **Edit this page on GitHub**
(`editPattern` in `astro.config.ts`), and the sidebar links to the repository
and its issues.
