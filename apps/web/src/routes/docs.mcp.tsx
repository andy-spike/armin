import { createFileRoute, redirect } from "@tanstack/react-router";
import { docsUrl } from "@/lib/docs-site";

export const Route = createFileRoute("/docs/mcp")({
  ssr: true,
  beforeLoad: () => {
    throw redirect({ href: docsUrl("reference/mcp-server/"), statusCode: 301 });
  },
});
