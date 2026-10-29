import { v } from "convex/values";
import { internalMutation } from "./functions";
import { internal } from "./_generated/api";
import {
  activityCutoff,
  recordActivity,
  syncUnitSummary,
  statsGeneration,
} from "./model/performance";

/** Idempotent operator migration; safe to rerun after interrupted deployment. */
export const backfill = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("libraries")
      .withIndex("by_owner")
      .paginate({ cursor, numItems: 20 });
    for (const library of page.page) {
      if (library.status !== "active" || library.statsReady) continue;
      const epoch = library.statsEpoch ?? 0;
      await ctx.scheduler.runAfter(0, internal.performance.rebuild, {
        libraryId: library._id,
        epoch,
        phase: "units",
        since: activityCutoff(),
        cursor: null,
      });
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.performance.backfill, {
        cursor: page.continueCursor,
      });
    return null;
  },
});

/** New log writes are marked in their own transaction; backfill skips those. */
export const rebuild = internalMutation({
  args: {
    libraryId: v.id("libraries"),
    epoch: v.number(),
    since: v.number(),
    phase: v.union(v.literal("units"), v.literal("reviewLogs"), v.literal("cramLogs")),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const library = await ctx.db.get(args.libraryId);
    if (!library || library.status !== "active" || (library.statsEpoch ?? 0) !== args.epoch)
      return null;
    let done: boolean;
    let cursor: string;
    if (args.phase === "units") {
      const page = await ctx.db
        .query("reviewUnits")
        .withIndex("by_library", (q) => q.eq("libraryId", library._id))
        .paginate({ cursor: args.cursor, numItems: 20 });
      for (const unit of page.page) await syncUnitSummary(ctx, unit, unit._id);
      done = page.isDone;
      cursor = page.continueCursor;
    } else {
      const page = await ctx.db
        .query(args.phase)
        .withIndex("by_library_review", (q) =>
          q.eq("libraryId", library._id).gte("review", args.since),
        )
        .paginate({ cursor: args.cursor, numItems: 100 });
      for (const log of page.page) await recordActivity(ctx, args.phase, log, 1);
      done = page.isDone;
      cursor = page.continueCursor;
    }
    if (!done) await ctx.scheduler.runAfter(0, internal.performance.rebuild, { ...args, cursor });
    else if (args.phase !== "cramLogs")
      await ctx.scheduler.runAfter(0, internal.performance.rebuild, {
        ...args,
        phase: args.phase === "units" ? "reviewLogs" : "cramLogs",
        cursor: null,
      });
    else {
      await ctx.db.patch(library._id, { statsReady: true });
      if ((library.statsEpoch ?? 0) > 0)
        await ctx.scheduler.runAfter(0, internal.performance.pruneGenerations, {
          libraryId: library._id,
          generation: statsGeneration(library),
          phase: "cardActivity",
          cursor: null,
        });
    }
    return null;
  },
});

/** Old generations and expired daily rows have no effect on current reads. */
export const prune = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for (const table of ["cardActivity", "dailyActivity"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_day", (q) => q.lt("day", activityCutoff() - 86_400_000))
        .take(200);
      for (const row of rows) await ctx.db.delete(row._id);
      if (rows.length === 200) await ctx.scheduler.runAfter(0, internal.performance.prune, {});
    }
    return null;
  },
});

/** Retire superseded timezone generations without growing retained storage. */
export const pruneGenerations = internalMutation({
  args: {
    libraryId: v.id("libraries"),
    generation: v.string(),
    phase: v.union(v.literal("cardActivity"), v.literal("dailyActivity")),
    cursor: v.union(v.null(), v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const library = await ctx.db.get(args.libraryId);
    if (!library || !library.statsReady || statsGeneration(library) !== args.generation)
      return null;
    const page = await ctx.db
      .query(args.phase)
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .paginate({ cursor: args.cursor, numItems: 200 });
    for (const row of page.page)
      if (row.generation !== args.generation) await ctx.db.delete(row._id);
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.performance.pruneGenerations, {
        ...args,
        cursor: page.continueCursor,
      });
    else if (args.phase === "cardActivity")
      await ctx.scheduler.runAfter(0, internal.performance.pruneGenerations, {
        ...args,
        phase: "dailyActivity",
        cursor: null,
      });
    return null;
  },
});
