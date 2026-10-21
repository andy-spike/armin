import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { REQUEST_RETENTION_MS } from "./model/limits";
import { bumpRevision, migratePrerequisiteAccess } from "./model/study";

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
      if (library?.status === "active" && await migratePrerequisiteAccess(ctx, flashcard, now)) {
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
