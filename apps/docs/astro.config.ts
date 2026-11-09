import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import nimbus, { defineConfig as defineNimbusConfig } from "@cloudflare/nimbus-docs";
import { tableScroll } from "@cloudflare/nimbus-docs/markdown";
import cloudflare from "@astrojs/cloudflare";

const nimbusConfig = defineNimbusConfig({
  rendering: { default: "request" },
  site: "https://docs.armincards.app",
  title: "Armin",
  description: "How to study with Armin: decks, cards, prerequisites, reviews, and imports.",
  locale: "en",
  github: "https://github.com/andy-spike/armin",
  editPattern: "https://github.com/andy-spike/armin/edit/master/apps/docs/{path}",
  socialImageAlt: "Armin user guide",
  sidebar: {
    items: [
      "index",
      { autogenerate: { collection: "docs" } },
      { label: "Source code on GitHub", link: "https://github.com/andy-spike/armin" },
      { label: "Report an issue", link: "https://github.com/andy-spike/armin/issues" },
    ],
  },
});

export default defineConfig({
  output: "server",
  adapter: cloudflare({ prerenderEnvironment: "node" }),
  vite: {
    plugins: [tailwindcss()],
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  integrations: [
    nimbus(nimbusConfig, {
      rules: {
        "nimbus/frontmatter-shape": "error",
        "nimbus/internal-link": "error",
      },
      markdown: {
        hastPlugins: [tableScroll()],
        features: { headingAttributes: true },
      },
    }),
  ],
});
