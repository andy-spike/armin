import { httpRouter } from "convex/server";
import { isSafeMediaFileName } from "@armin/core/media-ref";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";

import { uploadMedia } from "./media";
import { uploadAgentImportMedia } from "./agentImportHttp";
import { registerAgentRoutes } from "./agentHttp";
import { registerBillingRoutes } from "./billing";

const http = httpRouter();
registerAgentRoutes(http);

// Kept at its original path: deployed clients upload images here, and audio uses the same route.
http.route({ path: "/upload-image", method: "POST", handler: httpAction(uploadMedia) });
http.route({
  pathPrefix: "/agent-imports/",
  method: "POST",
  handler: httpAction(uploadAgentImportMedia),
});

authComponent.registerRoutes(http, createAuth);
// Polar subscription webhooks (`/polar/events`), signature-verified in billing.ts.
registerBillingRoutes(http);

function denied(status: number) {
  return new Response(status === 404 ? "Not found" : "Unauthorized", {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Private image and audio bytes. Requires the caller's Convex auth token (Authorization
 * header) and serves only images in the caller's own library. The web app
 * reaches this through its same-origin `/media/*` proxy; mobile calls it
 * directly with its session token. No reusable public URL is ever issued.
 */
http.route({
  pathPrefix: "/media/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const fileName = new URL(request.url).pathname.slice("/media/".length);
    if (!isSafeMediaFileName(fileName)) return denied(404);
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
        // Files are named by a hash of their bytes and never change.
        "Cache-Control": "private, max-age=31536000, immutable",
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
