import { createFileRoute } from "@tanstack/react-router";
import { proxyAuthenticated } from "@/lib/auth-server";

/** Same-origin export download; ownership is checked in Convex. */
export const Route = createFileRoute("/api/export/$")({
  server: {
    handlers: {
      GET: ({ params }) => {
        const exportId = params._splat ?? "";
        if (!/^[a-z0-9]+$/i.test(exportId)) {
          return new Response("Not found", { status: 404 });
        }
        return proxyAuthenticated(`/export/${exportId}`, "private, no-store");
      },
    },
  },
});
