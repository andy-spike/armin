"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

/** Optional display derivative; originals remain the source for zoom/export. */
export const generate = internalAction({
  args: { mediaId: v.id("media") },
  returns: v.null(),
  handler: async (ctx, { mediaId }) => {
    const { default: sharp } = await import("sharp");
    const source = await ctx.runQuery(internal.media.variantSource, { mediaId });
    if (!source || source.width != null) return null;
    const blob = await ctx.storage.get(source.storageId);
    if (!blob) return null;
    let thumbnailId;
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const image = sharp(bytes, { limitInputPixels: 16_000_000 });
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height) return null;
      const rotated = (metadata.orientation ?? 1) >= 5;
      const width = rotated ? metadata.height : metadata.width;
      const height = rotated ? metadata.width : metadata.height;
      let thumbnailSize = 0;
      // Preserve animation and SVG behavior; do not upscale or grow small files.
      if (
        (metadata.pages ?? 1) === 1 &&
        metadata.format !== "svg" &&
        Math.max(width, height) > 1280
      ) {
        const thumbnail = await image
          .rotate()
          .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();
        if (thumbnail.byteLength < bytes.byteLength) {
          thumbnailId = await ctx.storage.store(
            new Blob([new Uint8Array(thumbnail)], { type: "image/webp" }),
          );
          thumbnailSize = thumbnail.byteLength;
        }
      }
      const attached = await ctx.runMutation(internal.media.attachVariant, {
        mediaId,
        width,
        height,
        thumbnailId,
        thumbnailSize,
      });
      if (!attached && thumbnailId) await ctx.storage.delete(thumbnailId);
    } catch (error) {
      if (thumbnailId) await ctx.storage.delete(thumbnailId);
      // A corrupt/oversized image derivative must never break the original.
      console.warn(
        "Image preview unavailable",
        error instanceof Error ? error.message : "Image processing failed",
      );
    }
    return null;
  },
});
