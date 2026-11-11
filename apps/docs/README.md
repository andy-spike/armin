# Armin docs

The Armin user guide, built with [Nimbus](https://nimbus-docs.com) (Cloudflare's docs framework on Astro). It runs as its own Cloudflare Worker at `https://docs.armincards.app` and needs no backend.

## Develop

```bash
pnpm dev:docs   # http://localhost:4321
```

The dev server has no search index; try search on the [production build](#preview-the-production-build). Restart it after changing `astro.config.ts` or the adapter.

## Write a page

Pages are MDX files in `src/content/docs/`. The folder tree sets the URL and sidebar: `guides/reviewing.mdx` is served at `/guides/reviewing/` under Guides. Every page needs a `title`; `sidebar.order` sorts pages within a group. Shared passages go in `src/content/partials/` and are included with `<Render file="name" />`.

Components in `src/components.ts` (`Aside`, `Steps`, `Tabs`, `CardGrid`, and others) work without an import. Add more with `pnpm --filter @armin/docs exec nimbus-docs add <name>`.

[AGENT.md](AGENT.md) is Nimbus's guide for coding agents, including upgrades.

## Search

Search (header, `/`, or Ctrl/⌘ K) uses [Pagefind](https://pagefind.app), indexed during the production build. The dialog's markup and suggestions are in `src/components/ui/search/SearchDialog.astro`, its behavior in `search.client.ts`, and ranking in `providers/pagefind.ts`. Keep suggestions to topics people look up.

## AI agents

Nimbus publishes a Markdown version of every page (`/<slug>/index.md`), `llms.txt`, `llms-full.txt`, and discovery files under `/.well-known/` ([Docs for agents](https://nimbus-docs.com/ai/docs-for-agents)). This site adds:

- **Markdown at page URLs** ([how Nimbus documents it](https://nimbus-docs.com/ai/markdown-negotiation)), through the Cloudflare adapter and `rendering: { default: "request" }` in `astro.config.ts`. A request that ranks `text/markdown` above HTML gets Markdown; a browser's `*/*` still gets HTML. Both send `Vary: Accept`.
- **Ask ChatGPT / Ask Claude** page actions (`src/components/ui/page-actions/`), which read the page's Markdown from the live site.

The build warns that `404.astro` reads request headers while prerendered. Nimbus causes it, and the 404 page works.

## Preview the production build

```bash
pnpm --filter @armin/docs preview:cf   # builds, then runs wrangler dev on http://localhost:8787
curl -H 'Accept: text/markdown' http://localhost:8787/guides/reviewing/
```

## Validate

```bash
pnpm --filter @armin/docs typecheck          # astro check, including .astro files
pnpm --filter @armin/docs build              # validates frontmatter, MDX, and links
pnpm --filter @armin/docs exec nimbus-docs check
```

`nimbus-docs check` reports structure as "partly checked" because it can't verify request-rendered pages; a passing production build is the gate. `pnpm check` at the root needs the types Astro generates into `.astro/`, which `pnpm install` writes through `postinstall` (`astro sync`). CI runs the typecheck and build.

## Deploy

`pnpm --filter @armin/docs deploy` checks, builds, and publishes the `armin-docs` Worker. The adapter writes the deploy config to `dist/server/wrangler.json`; `wrangler.jsonc` holds the name, compatibility date, flags, and the `routes` entry that attaches `docs.armincards.app`. Keep the compatibility date equal to the web app's: a date newer than the installed Workers runtime stops `wrangler dev` and deploys.

## Look

The site uses the app's design system ([DESIGN.md](../../DESIGN.md)). `src/styles/globals.css` imports the web app's Flexoki tokens from `apps/web/src/styles/`, and the Nimbus `--nb-*` tokens point at them. `BaseLayout.astro` sets `data-theme` alongside Nimbus's `data-mode` so dark mode switches. The logo and wordmark come from `apps/web/src/components/brand-paths.ts`. Astro's client router and view transitions are removed on purpose.
