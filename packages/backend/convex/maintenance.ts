import { internalMutation } from "./functions";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { REQUEST_RETENTION_MS } from "./model/limits";
import { bumpRevision, migratePrerequisiteAccess } from "./model/study";
import { countSummaries, syncSummary } from "./model/summaries";

/** Operator-run migration; each scheduled batch stays within function limits. */
export const grantLegacyPrerequisiteAccess = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("flashcards").paginate({
      cursor: cursor ?? null,
      // One large cloze card can own 60 text-heavy review units. A single
      // card per transaction bounds bytes read as well as document count.
      numItems: 1,
    });
    let migrated = 0;
    const now = Date.now();
    for (const flashcard of page.page) {
      const library = await ctx.db.get(flashcard.libraryId);
      if (
        library?.status === "active" &&
        (await ctx.db.get(flashcard.deckId)) &&
        (await migratePrerequisiteAccess(ctx, flashcard, now))
      ) {
        await bumpRevision(ctx, flashcard.libraryId);
        migrated++;
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.maintenance.grantLegacyPrerequisiteAccess, {
        cursor: page.continueCursor,
      });
    }
    return { processed: page.page.length, migrated, isDone: page.isDone };
  },
});

/**
 * Operator-run after deploying Browse summaries: build every flashcard's
 * summary, which also builds the deck counters. Safe to rerun; a summary
 * that is already current is left alone.
 */
export const backfillSummaries = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    // A card owns at most a few dozen units, so 25 cards stay well inside limits.
    const page = await ctx.db
      .query("flashcards")
      .paginate({ cursor: cursor ?? null, numItems: 25 });
    for (const flashcard of page.page) await syncSummary(ctx.db, flashcard._id);
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.maintenance.backfillSummaries, {
        cursor: page.continueCursor,
      });
    }
    return { processed: page.page.length, isDone: page.isDone };
  },
});

/** Repair: recount one deck's counters from its summaries. */
export const rebuildDeckCounters = internalMutation({
  args: { deckId: v.id("decks") },
  handler: async (ctx, { deckId }) => {
    const deck = await ctx.db.get(deckId);
    const existing = await ctx.db
      .query("deckCounters")
      .withIndex("by_deck", (q) => q.eq("deckId", deckId))
      .unique();
    if (!deck) {
      if (existing) await ctx.db.delete(existing._id);
      return;
    }
    const summaries = await ctx.db
      .query("flashcardSummaries")
      .withIndex("by_deck_created", (q) => q.eq("deckId", deckId))
      .collect();
    const counts = countSummaries(summaries);
    if (existing) await ctx.db.patch(existing._id, counts);
    else await ctx.db.insert("deckCounters", { libraryId: deck.libraryId, deckId, ...counts });
  },
});

/** Drop request-id records older than the retry window. Bounded per run. */
export const pruneRequests = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - REQUEST_RETENTION_MS;
    const old = await ctx.db
      .query("requests")
      .withIndex("by_created", (q) => q.lt("createdAt", cutoff))
      .take(1000);
    for (const row of old) await ctx.db.delete(row._id);
  },
});
