"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const generate = internalAction({
  args: { mediaId: v.id("media") },
  returns: v.null(),
  handler: async (ctx, { mediaId }) => {
    const { default: sharp } = await import("sharp");
    const source = await ctx.runQuery(internal.media.variantSource, { mediaId });
    if (!source || source.width != null) return null;
    const blob = await ctx.storage.get(source.storageId);
    if (!blob) return null;
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const metadata = await sharp(bytes, { limitInputPixels: 16_000_000 }).metadata();
      if (!metadata.width || !metadata.height) return null;
      const rotated = (metadata.orientation ?? 1) >= 5;
      await ctx.runMutation(internal.media.attachVariant, {
        mediaId,
        width: rotated ? metadata.height : metadata.width,
        height: rotated ? metadata.width : metadata.height,
      });
    } catch (error) {
      console.warn(
        "Image dimensions unavailable",
        error instanceof Error ? error.message : "Image processing failed",
      );
    }
    return null;
  },
});
