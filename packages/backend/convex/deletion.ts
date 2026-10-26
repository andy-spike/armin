import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { TableNames } from "./_generated/dataModel";

/** Rows deleted per cleanup transaction; the job reschedules until done. */
const BATCH = 400;

/** Remove a deleted deck's review history in bounded batches. */
export const cleanupUnitLogs = internalMutation({
  args: { reviewUnitId: v.id("reviewUnits") },
  handler: async (ctx, { reviewUnitId }) => {
    const logs = await ctx.db
      .query("reviewLogs")
      .withIndex("by_unit_review", (q) => q.eq("reviewUnitId", reviewUnitId))
      .take(BATCH);
    for (const log of logs) await ctx.db.delete(log._id);
    if (logs.length === BATCH)
      await ctx.scheduler.runAfter(0, internal.deletion.cleanupUnitLogs, { reviewUnitId });
  },
});

/** Deck deletion supplies the removed unit IDs, including units moved in. */
export const cleanupRemovedUnits = internalMutation({
  args: { unitIds: v.array(v.id("reviewUnits")) },
  handler: async (ctx, { unitIds }) => {
    let budget = BATCH;
    let index = 0;
    for (; index < unitIds.length && budget > 0 && index < 20; index++) {
      const id = unitIds[index]!;
      const logs = await ctx.db
        .query("reviewLogs")
        .withIndex("by_unit_review", (q) => q.eq("reviewUnitId", id))
        .take(budget);
      for (const log of logs) await ctx.db.delete(log._id);
      budget -= logs.length;
      // If we filled the batch, revisit this unit to catch any remaining logs.
      if (budget === 0) break;
    }
    const remaining = unitIds.slice(index);
    if (remaining.length)
      await ctx.scheduler.runAfter(0, internal.deletion.cleanupRemovedUnits, {
        unitIds: remaining,
      });
  },
});

/** Each table with the index whose first field is `libraryId`. */
const LIBRARY_TABLES: [TableNames, string][] = [
  ["agentAuthorizations", "by_library"],
  ["agentConnections", "by_library"],
  ["agentUsedRefreshTokens", "by_library"],
  ["agentCreatedDecks", "by_library"],
  ["agentActivity", "by_library"],
  ["agentRequests", "by_library"],
  ["agentRateLimits", "by_library"],
  ["imports", "by_library_status"],
  ["reviewLogs", "by_library_review"],
  ["reviewUnits", "by_library"],
  ["prereqs", "by_library"],
  ["flashcardMedia", "by_library_file"],
  ["flashcards", "by_library"],
  ["deckSettings", "by_library"],
  ["decks", "by_library"],
  ["tags", "by_library_key"],
  ["requests", "by_library_request"],
  ["settings", "by_library"],
  ["libraryCounters", "by_library"],
];

/**
 * Bounded, resumable deletion of everything a library owns. Each run deletes
 * one batch and schedules itself again, so large libraries never exceed a
 * transaction's limits. Files are removed with their metadata rows.
 */
export const cleanupLibrary = internalMutation({
  args: { libraryId: v.id("libraries") },
  handler: async (ctx, { libraryId }) => {
    const library = await ctx.db.get(libraryId);
    if (!library || library.status !== "deleting") return;

    let budget = BATCH;

    const media = await ctx.db
      .query("media")
      .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
      .take(budget);
    for (const row of media) {
      await ctx.storage.delete(row.storageId).catch(() => undefined);
      await ctx.db.delete(row._id);
    }
    budget -= media.length;

    const exportsRows = await ctx.db
      .query("exports")
      .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
      .take(Math.max(budget, 0));
    for (const row of exportsRows) {
      if (row.storageId) {
        await ctx.storage.delete(row.storageId).catch(() => undefined);
      }
      await ctx.db.delete(row._id);
    }
    budget -= exportsRows.length;

    for (const [table, index] of LIBRARY_TABLES) {
      if (budget <= 0) break;
      const rows = await ctx.db
        .query(table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex(index as never, (q: any) => q.eq("libraryId", libraryId))
        .take(budget);
      for (const row of rows) await ctx.db.delete(row._id);
      budget -= rows.length;
    }

    if (budget <= 0) {
      await ctx.scheduler.runAfter(0, internal.deletion.cleanupLibrary, {
        libraryId,
      });
      return;
    }
    await ctx.db.delete(libraryId);
  },
});
