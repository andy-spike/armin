# Armin docs

The Armin user guide, built with [Nimbus](https://nimbus-docs.com), Cloudflare's
docs framework on Astro. It is a static site, separate from the web app, meant
to be served at `https://docs.armincards.app` (the `site` in `astro.config.ts`).

## Develop

From the repository root:

```bash
pnpm dev:docs   # http://localhost:4321
```

The site needs no backend.

## Search

The header search (or `/`, or Ctrl/⌘ K, on any page) searches every page with
[Pagefind](https://pagefind.app), which indexes the site during the production
build; there is no separate sidebar filter. Results show the page's sidebar
group, a highlighted excerpt, and the matching headings; arrow keys and Enter
open one. Before the reader types, the dialog offers suggested searches, set in
`src/components/ui/search/SearchDialog.astro`; keep them to topics people look
up. The ranking option lives in `src/components/ui/search/providers/pagefind.ts`.

The dev server has no index, so try search with
`pnpm --filter @armin/docs build` followed by `pnpm --filter @armin/docs preview`.

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

## Validate

```bash
pnpm --filter @armin/docs typecheck          # astro check, including .astro files
pnpm --filter @armin/docs build              # validates frontmatter, MDX, and links
pnpm --filter @armin/docs exec nimbus-docs check
```

`pnpm check` at the root formats and lints this workspace too. It reads `.astro`
imports through the ambient declaration in `src/env.d.ts`; `astro check` does
the real type checking for them. CI runs the typecheck and build.

## Deploy

`pnpm --filter @armin/docs deploy` checks, builds, and publishes the static
site to the `armin-docs` Cloudflare Worker. To serve it at
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
