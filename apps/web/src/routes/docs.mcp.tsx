import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/legal-page";
import guide from "@/content/docs/mcp.md?raw";

export const Route = createFileRoute("/docs/mcp")({
  ssr: true,
  headers: () => ({ "Cache-Control": "public, max-age=300, s-maxage=300" }),
  head: () => ({
    meta: [
      { title: "MCP server documentation · Armin" },
      {
        name: "description",
        content:
          "Connect Claude, ChatGPT, Claude Code, or Codex to Armin. Set deck permissions, manage connections, and troubleshoot the hosted MCP server.",
      },
    ],
  }),
  component: () => <LegalPage source={guide} />,
});
