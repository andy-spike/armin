import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";

import { uploadImage } from "./media";
import { registerAgentRoutes } from "./agentHttp";

const http = httpRouter();
registerAgentRoutes(http);

http.route({ path: "/upload-image", method: "POST", handler: httpAction(uploadImage) });

authComponent.registerRoutes(http, createAuth);

const MEDIA_FILE_RE = /^[a-f0-9]{64}\.(?:png|jpg|gif|webp|svg|bmp|avif)$/;

function denied(status: number) {
  return new Response(status === 404 ? "Not found" : "Unauthorized", {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Private image bytes. Requires the caller's Convex auth token (Authorization
 * header) and serves only images in the caller's own library. The web app
 * reaches this through its same-origin `/media/*` proxy; mobile calls it
 * directly with its session token. No reusable public URL is ever issued.
 */
http.route({
  pathPrefix: "/media/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const fileName = new URL(request.url).pathname.slice("/media/".length);
    if (!MEDIA_FILE_RE.test(fileName)) return denied(404);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return denied(401);
    const media = await ctx.runQuery(internal.media.lookupForViewer, { fileName });
    if (!media) return denied(404);
    const blob = await ctx.storage.get(media.storageId);
    if (!blob) return denied(404);
    return new Response(blob, {
      status: 200,
      headers: {
        "Content-Type": media.mime,
        "Content-Length": String(media.size),
        // Per-user content: never cache in shared caches.
        "Cache-Control": "private, max-age=600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  }),
});

/** Download a finished export of the caller's own library. */
http.route({
  pathPrefix: "/export/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const exportId = new URL(request.url).pathname.slice("/export/".length);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return denied(401);
    const row = await ctx.runQuery(internal.exports.lookupForViewer, { exportId });
    if (!row) return denied(404);
    const blob = await ctx.storage.get(row.storageId);
    if (!blob) return denied(404);
    return new Response(blob, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${row.fileName}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }),
});

export default http;
