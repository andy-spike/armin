import { v } from "convex/values";
import { MAX_MEDIA_FILE_BYTES, MIME_BY_EXT, sniffImageExt } from "@armin/core/media";
import { mediaRefFromFileName } from "@armin/core/media-ref";
import { planLimits } from "@armin/core/plans";
import { internal } from "./_generated/api";
import { internalQuery, query } from "./_generated/server";
import { internalMutation } from "./functions";
import type { ActionCtx } from "./_generated/server";
import { getViewer } from "./model/access";
import { libraryLimits } from "./model/usage";

export const uploaderLibrary = internalQuery({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer?.emailVerified || viewer.library?.status !== "active") return null;
    return { libraryId: viewer.library._id, reviewerResetAt: viewer.library.reviewerResetAt };
  },
});

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Read and discard a request body. Rejecting an oversized upload before the
 * client has finished sending closes the connection mid-write, which HTTP
 * proxies surface as an EPIPE and a 500. Draining lets the caller receive the
 * intended 413 instead.
 */
async function drainBody(body: ReadableStream<Uint8Array> | null) {
  if (!body) return;
  const reader = body.getReader();
  try {
    for (;;) {
      const { done } = await reader.read();
      if (done) return;
    }
  } catch {
    // The client stopped sending; the response status still explains why.
  }
}

/** Authenticated raw bytes, stored by this action. Clients cannot name a blob. */
export async function uploadImage(ctx: ActionCtx, request: Request) {
  const upload = await ctx.runQuery(internal.media.uploaderLibrary, {});
  if (!upload) return new Response("Sign in with a verified account.", { status: 401 });
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_MEDIA_FILE_BYTES) {
    await drainBody(request.body);
    return new Response("Image too large.", { status: 413 });
  }
  const reader = request.body?.getReader();
  if (!reader) return new Response("Image is empty.", { status: 400 });
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
  if (tooLarge) return new Response("Image too large.", { status: 413 });
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const ext = sniffImageExt(bytes);
  if (!ext) return new Response("Use a PNG, JPG, GIF, WebP, BMP, or AVIF image.", { status: 400 });
  const sha = hex(await crypto.subtle.digest("SHA-256", bytes));
  const fileName = `${sha}.${ext}`;
  const mime = MIME_BY_EXT[ext];
  const storageId = await ctx.storage.store(new Blob([bytes], { type: mime }));
  try {
    const result = await recordWithRetry(() =>
      ctx.runMutation(internal.media.recordUpload, {
        libraryId: upload.libraryId,
        reviewerResetAt: upload.reviewerResetAt,
        storageId,
        fileName,
        mime,
        size,
      }),
    );
    if (result.status !== "stored") await ctx.storage.delete(storageId);
    if (result.status === "quota")
      return new Response("Your image storage is full.", { status: 413 });
    if (result.status === "claimed") return new Response("Upload failed.", { status: 409 });
    return Response.json({ ref: mediaRefFromFileName(fileName), fileName, mime, bytes: size });
  } catch (error) {
    await ctx.storage.delete(storageId);
    throw error;
  }
}

/**
 * Every upload updates the library's one counter row, so parallel uploads (an
 * Anki import sends several at once) can exhaust Convex's own conflict retries.
 * The bytes are already stored, so retry just the bookkeeping, spread out.
 */
async function recordWithRetry<T>(run: () => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const conflict = error instanceof Error && /changed while this mutation/.test(error.message);
      if (!conflict || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 200 * (attempt + 1)));
    }
  }
}

export const recordUpload = internalMutation({
  args: {
    libraryId: v.id("libraries"),
    storageId: v.id("_storage"),
    reviewerResetAt: v.optional(v.number()),
    fileName: v.string(),
    mime: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const library = await ctx.db.get(args.libraryId);
    if (!library || library.status !== "active" || library.reviewerResetAt !== args.reviewerResetAt)
      return { status: "claimed" as const };
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
    const { mediaBytes: maxBytes } = await libraryLimits(ctx, args.libraryId);
    if (used + args.size > maxBytes) return { status: "quota" as const };
    const { reviewerResetAt: _resetAt, ...media } = args;
    await ctx.db.insert("media", { ...media, createdAt: Date.now() });
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
        .withIndex("by_library_file", (q) => q.eq("libraryId", libraryId).eq("fileName", fileName))
        .first();
      if (reference) continue;
      const staging = await ctx.db
        .query("agentImportMedia")
        .withIndex("by_library_file", (q) => q.eq("libraryId", libraryId).eq("fileName", fileName))
        .first();
      if (staging) {
        // A staged import still owns this image; check again after it finishes or expires.
        await ctx.scheduler.runAfter(60 * 60_000, internal.media.collectUnreferenced, {
          libraryId,
          fileNames: [fileName],
        });
        continue;
      }
      const media = await ctx.db
        .query("media")
        .withIndex("by_library_file", (q) => q.eq("libraryId", libraryId).eq("fileName", fileName))
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
      if (media.thumbnailId) await ctx.storage.delete(media.thumbnailId);
      await ctx.db.delete(media._id);
      const counters = await ctx.db
        .query("libraryCounters")
        .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
        .unique();
      if (counters) {
        await ctx.db.patch(counters._id, {
          mediaBytes: Math.max(0, counters.mediaBytes - media.size - (media.thumbnailSize ?? 0)),
          revision: counters.revision + 1,
        });
      }
    }
  },
});

/** Resolve a media file for the current session; null unless it's theirs. */
export const lookupForViewer = internalQuery({
  args: { fileName: v.string(), preview: v.optional(v.boolean()) },
  handler: async (ctx, { fileName, preview }) => {
    const viewer = await getViewer(ctx);
    if (!viewer?.library || viewer.library.status !== "active") return null;
    const media = await ctx.db
      .query("media")
      .withIndex("by_library_file", (q) =>
        q.eq("libraryId", viewer.library!._id).eq("fileName", fileName),
      )
      .unique();
    if (!media) return null;
    return preview && media.thumbnailId
      ? {
          storageId: media.thumbnailId,
          mime: "image/webp",
          size: media.thumbnailSize ?? media.size,
        }
      : { storageId: media.storageId, mime: media.mime, size: media.size };
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
      const thumbnail = await ctx.db
        .query("media")
        .withIndex("by_thumbnail", (q) => q.eq("thumbnailId", blob._id))
        .first();
      if (thumbnail) continue;
      const exported = await ctx.db
        .query("exports")
        .withIndex("by_storage", (q) => q.eq("storageId", blob._id))
        .first();
      if (exported) continue;
      await ctx.storage.delete(blob._id);
    }
  },
});

export const variantSource = internalQuery({
  args: { mediaId: v.id("media") },
  returns: v.union(
    v.null(),
    v.object({ storageId: v.id("_storage"), width: v.optional(v.number()) }),
  ),
  handler: async (ctx, { mediaId }) => {
    const media = await ctx.db.get(mediaId);
    const library = media ? await ctx.db.get(media.libraryId) : null;
    return library?.status === "active" && media
      ? { storageId: media.storageId, width: media.width }
      : null;
  },
});

export const attachVariant = internalMutation({
  args: {
    mediaId: v.id("media"),
    width: v.number(),
    height: v.number(),
    thumbnailId: v.optional(v.id("_storage")),
    thumbnailSize: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const media = await ctx.db.get(args.mediaId);
    const library = media ? await ctx.db.get(media.libraryId) : null;
    if (!media || library?.status !== "active" || media.width != null) return false;
    const counters = await ctx.db
      .query("libraryCounters")
      .withIndex("by_library", (q) => q.eq("libraryId", media.libraryId))
      .unique();
    const fits =
      counters != null &&
      counters.mediaBytes + args.thumbnailSize <= planLimits(library.plan).mediaBytes;
    await ctx.db.patch(media._id, {
      width: args.width,
      height: args.height,
      ...(fits ? { thumbnailId: args.thumbnailId, thumbnailSize: args.thumbnailSize } : {}),
    });
    if (fits && args.thumbnailSize && counters)
      await ctx.db.patch(counters._id, { mediaBytes: counters.mediaBytes + args.thumbnailSize });
    return fits;
  },
});

/** Bounded, session-scoped layout metadata; never exposes storage URLs. */
export const dimensions = query({
  args: { fileName: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      width: v.optional(v.number()),
      height: v.optional(v.number()),
      preview: v.boolean(),
    }),
  ),
  handler: async (ctx, { fileName }) => {
    const viewer = await getViewer(ctx);
    if (viewer?.library?.status !== "active") return null;
    const media = await ctx.db
      .query("media")
      .withIndex("by_library_file", (q) =>
        q.eq("libraryId", viewer.library!._id).eq("fileName", fileName),
      )
      .unique();
    return media
      ? { width: media.width, height: media.height, preview: media.thumbnailId != null }
      : null;
  },
});

/** Operator backfill for existing images; work stays in bounded action jobs. */
export const backfillVariants = internalMutation({
  args: { cursor: v.union(v.null(), v.string()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("media")
      .withIndex("by_library")
      .paginate({ cursor, numItems: 20 });
    for (const media of page.page)
      if (media.width == null)
        await ctx.scheduler.runAfter(0, internal.mediaVariants.generate, { mediaId: media._id });
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.media.backfillVariants, {
        cursor: page.continueCursor,
      });
    return null;
  },
});
