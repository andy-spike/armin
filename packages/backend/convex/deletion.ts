import { v } from "convex/values";
import { type MutationCtx } from "./_generated/server";
import { internalMutation } from "./functions";
import { internal } from "./_generated/api";
import { bumpRevision } from "./model/study";
import type { Id, TableNames } from "./_generated/dataModel";

/** Rows deleted per cleanup transaction; the job reschedules until done. */
const BATCH = 400;
// A review unit repeats up to MAX_CONTENT_CHARS (20,000) in front and back.
// Twenty units leave ample room below 16 MiB even for multi-byte text and
// formatting expansion. Cards carry the same bounded authored content.
const CONTENT_BATCH = 20;

/** Remove a deleted deck's review and cram history in bounded batches. */
export const cleanupUnitLogs = internalMutation({
  args: { reviewUnitId: v.id("reviewUnits") },
  handler: async (ctx, { reviewUnitId }) => {
    const logs = await ctx.db
      .query("reviewLogs")
      .withIndex("by_unit_review", (q) => q.eq("reviewUnitId", reviewUnitId))
      .take(BATCH);
    for (const log of logs) await ctx.db.delete(log._id);
    const cramBudget = BATCH - logs.length;
    const cramLogs =
      cramBudget > 0
        ? await ctx.db
            .query("cramLogs")
            .withIndex("by_unit_review", (q) => q.eq("reviewUnitId", reviewUnitId))
            .take(cramBudget)
        : [];
    for (const log of cramLogs) await ctx.db.delete(log._id);
    if (logs.length + cramLogs.length >= BATCH) {
      await ctx.scheduler.runAfter(0, internal.deletion.cleanupUnitLogs, { reviewUnitId });
    }
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
      const cramLogs = await ctx.db
        .query("cramLogs")
        .withIndex("by_unit_review", (q) => q.eq("reviewUnitId", id))
        .take(budget);
      for (const log of cramLogs) await ctx.db.delete(log._id);
      budget -= cramLogs.length;
      if (budget === 0) break;
    }
    const remaining = unitIds.slice(index);
    if (remaining.length)
      await ctx.scheduler.runAfter(0, internal.deletion.cleanupRemovedUnits, {
        unitIds: remaining,
      });
  },
});

/**
 * Clean rows belonging to an already removed deck. Never follow log.deckId:
 * reviews retain that original ID when a card moves to another deck. Removed
 * unit IDs identify exactly the history that should disappear.
 */
export const cleanupDeck = internalMutation({
  args: { libraryId: v.id("libraries"), deckId: v.id("decks") },
  handler: async (ctx, args) => {
    const library = await ctx.db.get(args.libraryId);
    // Account deletion owns cleanup once the library is no longer active.
    if (!library || library.status !== "active" || (await ctx.db.get(args.deckId))) return;
    const again = () => ctx.scheduler.runAfter(0, internal.deletion.cleanupDeck, args);
    const units = await ctx.db
      .query("reviewUnits")
      .withIndex("by_deck", (q) => q.eq("deckId", args.deckId))
      .take(CONTENT_BATCH);
    if (units.length) {
      const counters = await ctx.db
        .query("libraryCounters")
        .withIndex("by_library", (q) => q.eq("libraryId", args.libraryId))
        .unique();
      // Older libraries have no stored unit count. Leave it uninitialized so
      // its eventual fallback counts the surviving rows, without scanning all
      // text-heavy units in this cleanup transaction.
      if (counters?.reviewUnits !== undefined) {
        await ctx.db.patch(counters._id, {
          reviewUnits: Math.max(0, counters.reviewUnits - units.length),
        });
      }
      for (const unit of units) await ctx.db.delete(unit._id);
      await ctx.scheduler.runAfter(0, internal.deletion.cleanupRemovedUnits, {
        unitIds: units.map((unit) => unit._id),
      });
      await bumpRevision(ctx, args.libraryId);
      await again();
      return;
    }
    // Bound both the number of cards and their image links. A card with many
    // links stays until a later batch has removed all of its links.
    const cards = await ctx.db
      .query("flashcards")
      .withIndex("by_deck", (q) => q.eq("deckId", args.deckId))
      .take(CONTENT_BATCH);
    if (cards.length) {
      let budget = BATCH;
      const files = new Set<string>();
      for (const card of cards) {
        const links = await ctx.db
          .query("flashcardMedia")
          .withIndex("by_flashcard", (q) => q.eq("flashcardId", card._id))
          .take(budget);
        for (const link of links) {
          files.add(link.fileName);
          await ctx.db.delete(link._id);
        }
        budget -= links.length;
        if (!budget) break;
        await ctx.db.delete(card._id);
        if (--budget === 0) break;
      }
      if (files.size)
        await ctx.scheduler.runAfter(60 * 60_000, internal.media.collectUnreferenced, {
          libraryId: args.libraryId,
          fileNames: [...files],
        });
      await bumpRevision(ctx, args.libraryId);
      await again();
      return;
    }
    const edges = await ctx.db
      .query("prereqs")
      .withIndex("by_deck", (q) => q.eq("deckId", args.deckId))
      .take(BATCH);
    for (const edge of edges) await ctx.db.delete(edge._id);
    if (edges.length === BATCH) {
      await again();
      return;
    }
    const settings = await ctx.db
      .query("deckSettings")
      .withIndex("by_deck", (q) => q.eq("deckId", args.deckId))
      .unique();
    if (settings) await ctx.db.delete(settings._id);
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
  ["agentImportCards", "by_library"],
  ["agentImportMedia", "by_library"],
  ["agentImports", "by_library"],
  // Before units and flashcards, so deleting those finds no summary to rebuild.
  ["flashcardSummaries", "by_library_created"],
  ["deckCounters", "by_library"],
  ["cardActivity", "by_library"],
  ["dailyActivity", "by_library"],
  ["unitSummaries", "by_library"],
  ["reviewLogs", "by_library_review"],
  ["cramLogs", "by_library_review"],
  ["reviewUnits", "by_library"],
  ["prereqs", "by_library"],
  ["flashcardMedia", "by_library_file"],
  ["flashcards", "by_library"],
  ["deckSettings", "by_library"],
  ["decks", "by_library"],
  // After decks, so unit and card deletions above never recount a deck.
  ["deckUnitCounts", "by_library"],
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

    const complete = await cleanupLibraryData(ctx, libraryId, false);

    if (!complete) {
      await ctx.scheduler.runAfter(0, internal.deletion.cleanupLibrary, {
        libraryId,
      });
      return;
    }
    // Library status already denies assistant access. Revoke the component
    // grants one at a time so their token rows never exceed a transaction.
    await ctx.scheduler.runAfter(0, internal.agents.revokeAccountGrants, {
      userId: library.ownerId,
    });
    await ctx.db.delete(libraryId);
  },
});

// Keep sign-ins, OAuth grants, refresh-token replay protection, rate limits,
// and the monotonic revision while replacing a reviewer's study content.
const RESET_PRESERVED_TABLES = new Set<TableNames>([
  "agentAuthorizations",
  "agentConnections",
  "agentUsedRefreshTokens",
  "agentRateLimits",
  "libraryCounters",
]);

/** Return false when another bounded cleanup transaction is needed. */
export async function cleanupLibraryData(
  ctx: MutationCtx,
  libraryId: Id<"libraries">,
  reset: boolean,
) {
  let budget = BATCH;

  const media = await ctx.db
    .query("media")
    .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
    .take(budget);
  for (const row of media) {
    if (reset) await ctx.storage.delete(row.storageId);
    else await ctx.storage.delete(row.storageId).catch(() => undefined);
    if (row.thumbnailId) await ctx.storage.delete(row.thumbnailId).catch(() => undefined);
    await ctx.db.delete(row._id);
  }
  budget -= media.length;

  const exportsRows = await ctx.db
    .query("exports")
    .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
    .take(Math.max(budget, 0));
  for (const row of exportsRows) {
    if (row.storageId) {
      if (reset) await ctx.storage.delete(row.storageId);
      else await ctx.storage.delete(row.storageId).catch(() => undefined);
    }
    await ctx.db.delete(row._id);
  }
  budget -= exportsRows.length;

  for (const [table, index] of LIBRARY_TABLES) {
    if (reset && RESET_PRESERVED_TABLES.has(table)) continue;
    if (budget <= 0) break;
    const limit =
      table === "reviewUnits" || table === "flashcards" || table === "agentImportCards"
        ? Math.min(budget, CONTENT_BATCH)
        : budget;
    const rows = await ctx.db
      .query(table)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex(index as never, (q: any) => q.eq("libraryId", libraryId))
      .take(limit);
    for (const row of rows) await ctx.db.delete(row._id);
    budget -= rows.length;
    if (rows.length === limit) return false;
  }

  return budget > 0;
}
