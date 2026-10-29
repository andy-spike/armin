import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./functions";
import { allocateDeckSlug } from "./model/decks";

/** Operator backfill for decks created before friendly URLs. Safe to rerun. */
export const backfill = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("decks")
      .paginate({ cursor: args.cursor ?? null, numItems: 50 });
    for (const deck of page.page) {
      if (!deck.slug)
        await ctx.db.patch(deck._id, {
          slug: await allocateDeckSlug(ctx, deck.libraryId, deck.name),
        });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.deckSlugs.backfill, { cursor: page.continueCursor });
    }
  },
});
