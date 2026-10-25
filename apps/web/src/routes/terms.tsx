import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/legal-page";
import terms from "@/content/legal/terms.md?raw";

export const Route = createFileRoute("/terms")({
  // Public and crawlable: the server renders the terms rather than a client shell.
  ssr: true,
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
