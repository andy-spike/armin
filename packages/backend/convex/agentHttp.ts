import type { HttpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { mcp } from "./mcp";

/**
 * Agent-facing HTTP routes. The MCP component registers the hosted `/mcp`
 * endpoint, its OAuth endpoints, and the discovery documents; Armin keeps only
 * the provider domain-verification route.
 */
export function registerAgentRoutes(http: HttpRouter) {
  // OpenAI's plugin portal verifies domain ownership by fetching this token from
  // the MCP host. Set OPENAI_APPS_CHALLENGE to the portal's exact token.
  http.route({
    path: "/.well-known/openai-apps-challenge",
    method: "GET",
    handler: httpAction(async () => {
      const token = process.env.OPENAI_APPS_CHALLENGE?.trim();
      return new Response(token || "Not found", {
        status: token ? 200 : 404,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }),
  });

  mcp.registerRoutes(http);
}
