import { MIME_BY_EXT, sniffMediaExt, UNSUPPORTED_MEDIA_MESSAGE } from "@armin/core/media";
import { MEDIA_STORAGE_FULL_MESSAGE } from "@armin/core/plans";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { hashSecret } from "./model/agentAuth";
import { mediaFileName, readUploadBody } from "./model/uploadBody";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function uploadAgentImportMedia(ctx: ActionCtx, request: Request) {
  const match = new URL(request.url).pathname.match(/^\/agent-imports\/([^/]+)\/media$/);
  if (!match) return new Response("Not found", { status: 404 });
  const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
  if (!token) return json({ error: "Unauthorized" }, 401);
  const target = await ctx.runQuery(internal.agentImports.mediaTarget, {
    importId: match[1]!,
    tokenHash: await hashSecret(token),
  });
  if (!target) return json({ error: "Unauthorized or expired upload." }, 401);

  const body = await readUploadBody(request);
  if ("error" in body)
    return body.error === "tooLarge"
      ? json({ error: "File too large." }, 413)
      : json({ error: "File is empty." }, 400);
  const { bytes } = body;
  const size = bytes.byteLength;
  const ext = sniffMediaExt(bytes);
  if (!ext) return json({ error: `${UNSUPPORTED_MEDIA_MESSAGE} SVG is not accepted.` }, 415);
  const fileName = await mediaFileName(bytes, ext);
  const mime = MIME_BY_EXT[ext];
  const storageId = await ctx.storage.store(new Blob([bytes], { type: mime }));
  try {
    const recorded = await ctx.runMutation(internal.agentImports.recordMedia, {
      importId: target.importId,
      tokenHash: await hashSecret(token),
      storageId,
      fileName,
      mime,
      size,
    });
    if (!recorded.ok) {
      await ctx.storage.delete(storageId);
      if (recorded.reason === "quota")
        return json(
          {
            error: MEDIA_STORAGE_FULL_MESSAGE,
          },
          413,
        );
      return json({ error: "This import is no longer accepting uploads." }, 409);
    }
    if (recorded.duplicate) await ctx.storage.delete(storageId);
    return json({
      ref: recorded.ref,
      fileName: recorded.fileName,
      mime: recorded.mime,
      bytes: recorded.bytes,
    });
  } catch (error) {
    await ctx.storage.delete(storageId);
    throw error;
  }
}
