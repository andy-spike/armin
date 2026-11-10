import type { HttpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { mcp } from "./mcp";

export function registerAgentRoutes(http: HttpRouter) {
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
