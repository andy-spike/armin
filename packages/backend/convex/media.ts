import { v } from "convex/values";
import {
  MAX_LIBRARY_MEDIA_BYTES,
  MAX_MEDIA_FILE_BYTES,
  MIME_BY_EXT,
  sniffImageExt,
} from "@armin/core/media";
import { mediaRefFromFileName } from "@armin/core/media-ref";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { getViewer } from "./model/access";

export const uploaderLibrary = internalQuery({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer?.emailVerified || viewer.library?.status !== "active") return null;
    return viewer.library._id;
  },
});

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Authenticated raw bytes, stored by this action. Clients cannot name a blob. */
export async function uploadImage(ctx: ActionCtx, request: Request) {
  const libraryId = await ctx.runQuery(internal.media.uploaderLibrary, {});
  if (!libraryId) return new Response("Sign in with a verified account.", { status: 401 });
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_MEDIA_FILE_BYTES) return new Response("Image too large.", { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return new Response("Image is empty.", { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_MEDIA_FILE_BYTES) {
      await reader.cancel();
      return new Response("Image too large.", { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const ext = sniffImageExt(bytes);
  if (!ext) return new Response("Use a PNG, JPG, GIF, WebP, BMP, or AVIF image.", { status: 400 });
  const sha = hex(await crypto.subtle.digest("SHA-256", bytes));
  const fileName = `${sha}.${ext}`;
  const mime = MIME_BY_EXT[ext];
  const storageId = await ctx.storage.store(new Blob([bytes], { type: mime }));
  try {
    const result = await ctx.runMutation(internal.media.recordUpload, {
      libraryId, storageId, fileName, mime, size,
    });
    if (result.status !== "stored") await ctx.storage.delete(storageId);
    if (result.status === "quota") return new Response("Your image storage is full.", { status: 413 });
    if (result.status === "claimed") return new Response("Upload failed.", { status: 409 });
    return Response.json({ ref: mediaRefFromFileName(fileName), fileName, mime, bytes: size });
  } catch (error) {
    await ctx.storage.delete(storageId);
    throw error;
  }
}

export const recordUpload = internalMutation({
  args: {
    libraryId: v.id("libraries"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mime: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const library = await ctx.db.get(args.libraryId);
    if (!library || library.status !== "active") return { status: "quota" as const };
    const claimed = await ctx.db
      .query("media")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (claimed) return { status: "claimed" as const };
    const existing = await ctx.db
      .query("media")
      .withIndex("by_library_file", (q) =>
        q.eq("libraryId", args.libraryId).eq("fileName", args.fileName),
      )
      .unique();
    if (existing) return { status: "duplicate" as const };
    const counters = await ctx.db
      .query("libraryCounters")
      .withIndex("by_library", (q) => q.eq("libraryId", args.libraryId))
      .unique();
    const used = counters?.mediaBytes ?? 0;
    if (used + args.size > MAX_LIBRARY_MEDIA_BYTES) return { status: "quota" as const };
    await ctx.db.insert("media", { ...args, createdAt: Date.now() });
    if (counters) {
      await ctx.db.patch(counters._id, {
        mediaBytes: used + args.size,
        revision: counters.revision + 1,
      });
    } else {
      await ctx.db.insert("libraryCounters", {
        libraryId: args.libraryId,
        revision: 1,
        mediaBytes: args.size,
      });
    }
    // An image that is never attached to a flashcard is removed later.
    await ctx.scheduler.runAfter(24 * 3_600_000, internal.media.collectUnreferenced, {
      libraryId: args.libraryId,
      fileNames: [args.fileName],
    });
    return { status: "stored" as const };
  },
});

/** Delete library images no flashcard references any more. */
export const collectUnreferenced = internalMutation({
  args: { libraryId: v.id("libraries"), fileNames: v.array(v.string()) },
  handler: async (ctx, { libraryId, fileNames }) => {
    for (const fileName of fileNames) {
      const reference = await ctx.db
        .query("flashcardMedia")
        .withIndex("by_library_file", (q) =>
          q.eq("libraryId", libraryId).eq("fileName", fileName),
        )
        .first();
      if (reference) continue;
      const media = await ctx.db
        .query("media")
        .withIndex("by_library_file", (q) =>
          q.eq("libraryId", libraryId).eq("fileName", fileName),
        )
        .unique();
      if (!media) continue;
      // Keep recent uploads that an open editor may be about to save.
      if (Date.now() - media.createdAt < 60 * 60_000) {
        await ctx.scheduler.runAfter(60 * 60_000, internal.media.collectUnreferenced, {
          libraryId,
          fileNames: [fileName],
        });
        continue;
      }
      await ctx.storage.delete(media.storageId);
      await ctx.db.delete(media._id);
      const counters = await ctx.db
        .query("libraryCounters")
        .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
        .unique();
      if (counters) {
        await ctx.db.patch(counters._id, {
          mediaBytes: Math.max(0, counters.mediaBytes - media.size),
          revision: counters.revision + 1,
        });
      }
    }
  },
});

/** Resolve a media file for the current session; null unless it's theirs. */
export const lookupForViewer = internalQuery({
  args: { fileName: v.string() },
  handler: async (ctx, { fileName }) => {
    const viewer = await getViewer(ctx);
    if (!viewer?.library || viewer.library.status !== "active") return null;
    const media = await ctx.db
      .query("media")
      .withIndex("by_library_file", (q) =>
        q.eq("libraryId", viewer.library!._id).eq("fileName", fileName),
      )
      .unique();
    if (!media) return null;
    return { storageId: media.storageId, mime: media.mime, size: media.size };
  },
});

/**
 * Remove blobs that were uploaded but never finalized into a library (and
 * aren't exports). Runs from a cron; bounded per run.
 */
export const sweepOrphanBlobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    // The cron runs every 6 hours, so a two-day window of uploads older than
    // two hours covers every unfinalized blob without rescanning old images.
    const cutoff = Date.now() - 2 * 3_600_000;
    const windowStart = cutoff - 48 * 3_600_000;
    const blobs = await ctx.db.system
      .query("_storage")
      .withIndex("by_creation_time", (q) =>
        q.gt("_creationTime", windowStart).lt("_creationTime", cutoff),
      )
      .order("desc")
      .take(1000);
    for (const blob of blobs) {
      const media = await ctx.db
        .query("media")
        .withIndex("by_storage", (q) => q.eq("storageId", blob._id))
        .first();
      if (media) continue;
      const exported = await ctx.db
        .query("exports")
        .withIndex("by_storage", (q) => q.eq("storageId", blob._id))
        .first();
      if (exported) continue;
      await ctx.storage.delete(blob._id);
    }
  },
});
