import { isAudioFile } from "@armin/core/media";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { libraryLimits } from "./usage";

/**
 * Images and audio have separate per-library quotas (`@armin/core/plans`):
 * audio files are much larger, so sharing one budget would let a single audio
 * deck use up the image space. The kind follows the stored file's extension.
 */
function counterFor(fileName: string) {
  return isAudioFile(fileName) ? ("audioBytes" as const) : ("mediaBytes" as const);
}

async function countersRow(ctx: MutationCtx, libraryId: Id<"libraries">) {
  return ctx.db
    .query("libraryCounters")
    .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
    .unique();
}

/** Count a new file against its quota; false when it doesn't fit. */
export async function reserveMediaBytes(
  ctx: MutationCtx,
  libraryId: Id<"libraries">,
  fileName: string,
  size: number,
) {
  const key = counterFor(fileName);
  const counters = await countersRow(ctx, libraryId);
  const used = counters?.[key] ?? 0;
  const limits = await libraryLimits(ctx, libraryId);
  if (used + size > limits[key]) return false;
  if (counters) {
    await ctx.db.patch(counters._id, { [key]: used + size, revision: counters.revision + 1 });
  } else {
    await ctx.db.insert("libraryCounters", {
      libraryId,
      revision: 1,
      mediaBytes: 0,
      [key]: size,
    });
  }
  return true;
}

/** Return a deleted file's bytes (and its preview's) to its quota. */
export async function releaseMediaBytes(ctx: MutationCtx, media: Doc<"media">) {
  const key = counterFor(media.fileName);
  const counters = await countersRow(ctx, media.libraryId);
  if (!counters) return;
  await ctx.db.patch(counters._id, {
    [key]: Math.max(0, (counters[key] ?? 0) - media.size - (media.thumbnailSize ?? 0)),
    revision: counters.revision + 1,
  });
}
