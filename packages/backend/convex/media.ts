import { v } from "convex/values";
import { MIME_BY_EXT, sniffMediaExt, UNSUPPORTED_MEDIA_MESSAGE } from "@armin/core/media";
import { mediaRefFromFileName } from "@armin/core/media-ref";
import { MEDIA_STORAGE_FULL_MESSAGE } from "@armin/core/plans";
import { internal } from "./_generated/api";
import { internalQuery, query } from "./_generated/server";
import { internalMutation } from "./functions";
import type { ActionCtx } from "./_generated/server";
import { getViewer, readableLibrary } from "./model/access";
import { mediaUsage, releaseMediaBytes, reserveMediaBytes } from "./model/mediaQuota";
import { mediaFileName, readUploadBody } from "./model/uploadBody";

export const uploaderLibrary = internalQuery({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer?.emailVerified || viewer.library?.status !== "active") return null;
    return { libraryId: viewer.library._id, reviewerResetAt: viewer.library.reviewerResetAt };
  },
});

export async function uploadMedia(ctx: ActionCtx, request: Request) {
  const upload = await ctx.runQuery(internal.media.uploaderLibrary, {});
  if (!upload) return new Response("Sign in with a verified account.", { status: 401 });
  const body = await readUploadBody(request);
  if ("error" in body)
    return body.error === "tooLarge"
      ? new Response("File too large.", { status: 413 })
      : new Response("File is empty.", { status: 400 });
  const { bytes } = body;
  const size = bytes.byteLength;
  const ext = sniffMediaExt(bytes);
  if (!ext) return new Response(UNSUPPORTED_MEDIA_MESSAGE, { status: 400 });
  const fileName = await mediaFileName(bytes, ext);
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
    if (result.status === "quota") return new Response(MEDIA_STORAGE_FULL_MESSAGE, { status: 413 });
    if (result.status === "claimed") return new Response("Upload failed.", { status: 409 });
    return Response.json({ ref: mediaRefFromFileName(fileName), fileName, mime, bytes: size });
  } catch (error) {
    await ctx.storage.delete(storageId);
    throw error;
  }
}

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
    if (!(await reserveMediaBytes(ctx, args.libraryId, args.fileName, args.size)))
      return { status: "quota" as const };
    const { reviewerResetAt: _resetAt, ...media } = args;
    await ctx.db.insert("media", { ...media, createdAt: Date.now() });
    await ctx.scheduler.runAfter(24 * 3_600_000, internal.media.collectUnreferenced, {
      libraryId: args.libraryId,
      fileNames: [args.fileName],
    });
    return { status: "stored" as const };
  },
});

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
      await releaseMediaBytes(ctx, media);
    }
  },
});

export const usage = query({
  args: {},
  handler: async (ctx) => {
    const library = await readableLibrary(ctx);
    return library ? await mediaUsage(ctx, library._id) : null;
  },
});

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
    return media ? { storageId: media.storageId, mime: media.mime, size: media.size } : null;
  },
});

export const sweepOrphanBlobs = internalMutation({
  args: {},
  handler: async (ctx) => {
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
  args: { mediaId: v.id("media"), width: v.number(), height: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const media = await ctx.db.get(args.mediaId);
    const library = media ? await ctx.db.get(media.libraryId) : null;
    if (!media || library?.status !== "active" || media.width != null) return null;
    await ctx.db.patch(media._id, { width: args.width, height: args.height });
    return null;
  },
});

export const dimensions = query({
  args: { fileName: v.string() },
  returns: v.union(
    v.null(),
    v.object({ width: v.optional(v.number()), height: v.optional(v.number()) }),
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
    return media ? { width: media.width, height: media.height } : null;
  },
});
