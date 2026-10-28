import { MAX_MEDIA_FILE_BYTES, MIME_BY_EXT, sniffImageExt } from "@armin/core/media";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { hashSecret } from "./model/agentAuth";

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

/** Read and discard a rejected body so the caller receives the intended status. */
async function drainBody(body: ReadableStream<Uint8Array> | null) {
  if (!body) return;
  const reader = body.getReader();
  try {
    for (;;) if ((await reader.read()).done) return;
  } catch {
    // The client stopped sending; the status still explains why.
  }
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Scoped raw-image upload for one staging MCP Anki import. The upload token is
 * separate from the MCP bearer token, so an agent can use curl without seeing
 * its OAuth credential. The body is sniffed and content-addressed; there is no
 * URL fetch and no caller-supplied filename.
 */
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

  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_MEDIA_FILE_BYTES) {
    await drainBody(request.body);
    return json({ error: "Image too large." }, 413);
  }
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "Image is empty." }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  let tooLarge = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (tooLarge) continue;
    size += value.byteLength;
    if (size > MAX_MEDIA_FILE_BYTES) {
      tooLarge = true;
      chunks.length = 0;
      continue;
    }
    chunks.push(value);
  }
  if (tooLarge) return json({ error: "Image too large." }, 413);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const ext = sniffImageExt(bytes);
  if (!ext)
    return json(
      { error: "Use a PNG, JPG, GIF, WebP, BMP, or AVIF image. SVG is not accepted." },
      415,
    );
  const fileName = `${hex(await crypto.subtle.digest("SHA-256", bytes))}.${ext}`;
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
      if (recorded.reason === "quota") return json({ error: "Your image storage is full." }, 413);
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
