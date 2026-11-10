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

http.route({ path: "/upload-image", method: "POST", handler: httpAction(uploadMedia) });
http.route({
  pathPrefix: "/agent-imports/",
  method: "POST",
  handler: httpAction(uploadAgentImportMedia),
});

authComponent.registerRoutes(http, createAuth);
registerBillingRoutes(http);

function denied(status: number) {
  return new Response(status === 404 ? "Not found" : "Unauthorized", {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

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
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  }),
});

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
