import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/legal-page";
import terms from "@/content/legal/terms.md?raw";

export const Route = createFileRoute("/terms")({
  staticData: { documentScroll: true },
  // Public and crawlable: the server renders the terms rather than a client shell.
  ssr: true,
  // Public, session-independent HTML; updates become fresh within five minutes.
  headers: () => ({ "Cache-Control": "public, max-age=300, s-maxage=300" }),
  head: () => ({
    meta: [
      { title: "Terms of Service · Armin" },
      {
        name: "description",
        content:
          "The terms for using Armin, its mobile apps, and its MCP server and plugins for AI study assistants.",
      },
    ],
  }),
  component: () => <LegalPage source={terms} />,
});
