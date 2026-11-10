import { v } from "convex/values";
import { reviewStreaks, studyDaySeries, studyDayWindowStarts } from "@armin/core/stats";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { readableDeck, readableLibrary } from "./model/access";
import {
  activityDays,
  clampHeatmapWeeks,
  heatmapDayCount,
  overviewSnapshot,
  readActivity,
} from "./model/overview";

async function resolveDeckScope(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  deckIdArg: string | undefined,
) {
  if (deckIdArg === undefined) return { ok: true as const, deckId: null };
  const deck = await readableDeck(ctx, library, deckIdArg);
  return deck ? { ok: true as const, deckId: deck._id } : { ok: false as const };
}

export const overview = query({
  args: { deckId: v.optional(v.string()), now: v.number() },
  handler: async (ctx, { deckId: deckIdArg, now }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const scope = await resolveDeckScope(ctx, library, deckIdArg);
    if (!scope.ok) return null;
    return overviewSnapshot(ctx, library, scope.deckId, now);
  },
});

export const heatmap = query({
  args: { deckId: v.optional(v.string()), weeks: v.optional(v.number()), now: v.number() },
  handler: async (ctx, { deckId: deckIdArg, weeks, now }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const scope = await resolveDeckScope(ctx, library, deckIdArg);
    if (!scope.ok) return null;

    const timeZone = library.timeZone;
    const starts = studyDayWindowStarts(now, timeZone, heatmapDayCount(clampHeatmapWeeks(weeks)));
    const rows = await readActivity(ctx, library, scope.deckId, starts[0]);
    const days = activityDays(rows, starts, timeZone);
    return {
      ...studyDaySeries(days),
      streak: reviewStreaks(days),
      truncated: false,
      pending: library.statsReady !== true,
    };
  },
});
