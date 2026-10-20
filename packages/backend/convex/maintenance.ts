import { internalMutation } from "./_generated/server";
import { REQUEST_RETENTION_MS } from "./model/limits";

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
