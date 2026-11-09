import { createFileRoute } from "@tanstack/react-router";
import { isSafeMediaFileName } from "@armin/core/media-ref";
import { convexSiteUrl, getToken, proxyAuthenticated } from "@/lib/auth-server";

export const Route = createFileRoute("/media/$")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        if (params._splat !== "upload") return new Response("Not found", { status: 404 });
        if (request.headers.get("origin") !== new URL(request.url).origin) {
          return new Response("Forbidden", { status: 403 });
        }
        const token = await getToken();
        if (!token) return new Response("Unauthorized", { status: 401 });
        const upstream = await fetch(`${convexSiteUrl}/upload-image`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": request.headers.get("content-type") ?? "application/octet-stream",
          },
          body: request.body,
          duplex: "half",
        } as RequestInit & { duplex: string });
        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            "Content-Type": upstream.headers.get("content-type") ?? "text/plain",
            "Cache-Control": "no-store",
          },
        });
      },
      GET: ({ params }) => {
        const fileName = params._splat ?? "";
        if (!isSafeMediaFileName(fileName)) {
          return new Response("Not found", { status: 404 });
        }
        return proxyAuthenticated(`/media/${fileName}`, "private, max-age=31536000, immutable");
      },
    },
  },
});
