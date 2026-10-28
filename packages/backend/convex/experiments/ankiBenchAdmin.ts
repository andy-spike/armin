import { v } from "convex/values";
import { internalMutation } from "../functions";

/**
 * Local-only controls for the Anki import benchmark.
 *
 * These functions are internal (not reachable from clients) and exist only so
 * `docs/research/anki-import-bench/run.mjs` can upload a fixture, inspect its
 * stored metadata, and delete it afterwards. They are not part of the importer
 * and should be removed if the experiment is not carried forward.
 */

export const createUploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

export const fileMetadata = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const metadata = await ctx.db.system.get(storageId);
    if (!metadata) return null;
    return {
      size: metadata.size,
      contentType: metadata.contentType,
      sha256: metadata.sha256,
    };
  },
});

export const deleteFile = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await ctx.storage.delete(storageId);
    return true;
  },
});
