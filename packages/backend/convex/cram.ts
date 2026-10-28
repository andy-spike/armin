import { v } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import type { Id } from "./_generated/dataModel";
import { owned, readableLibrary, writableLibrary } from "./model/access";
import {
  cleanCramStates,
  cleanCramTag,
  cleanForgottenDays,
  selectCramUnits,
  type CramSelection,
} from "./model/cram";
import { toQueueItems } from "./model/queue";
import { findRequest, recordRequest } from "./model/study";

/**
 * Cram is practice only. Its queries reuse the review queue's item shape so
 * the existing card renderer works unchanged, and its mutations only append or
 * remove `cramLogs` rows: schedules, versions, locks, prerequisite access, and
 * `reviewLogs` are never touched.
 */

const selectionArgs = {
  deckId: v.string(),
  states: v.array(v.number()),
  tag: v.optional(v.string()),
  forgottenWithinDays: v.optional(v.number()),
  includeLocked: v.boolean(),
};

type SelectionArgs = {
  deckId: string;
  states: number[];
  tag?: string;
  forgottenWithinDays?: number;
  includeLocked: boolean;
};

/** Resolve the deck and library for a cram read; null means "not found". */
async function readableDeck(ctx: Parameters<typeof readableLibrary>[0], deckIdArg: string) {
  const library = await readableLibrary(ctx);
  if (!library) return null;
  const deckId = ctx.db.normalizeId("decks", deckIdArg);
  if (!deckId) return null;
  const deck = await ctx.db.get(deckId);
  if (!deck || deck.libraryId !== library._id || deck.staging) return null;
  return { library, deckId };
}

function selectionFrom(args: SelectionArgs, deckId: Id<"decks">): CramSelection {
  return {
    deckId,
    states: cleanCramStates(args.states),
    tag: cleanCramTag(args.tag),
    forgottenWithinDays: cleanForgottenDays(args.forgottenWithinDays),
    includeLocked: args.includeLocked,
  };
}

/** Live count for the cram setup dialog. */
export const count = query({
  args: selectionArgs,
  handler: async (ctx, args) => {
    const found = await readableDeck(ctx, args.deckId);
    if (!found) return null;
    const units = await selectCramUnits(
      ctx,
      found.library,
      selectionFrom(args, found.deckId),
      Date.now(),
    );
    return { count: units.length };
  },
});

/** Every review unit matching a cram setup; the client shuffles and limits it. */
export const queue = query({
  args: selectionArgs,
  handler: async (ctx, args) => {
    const found = await readableDeck(ctx, args.deckId);
    if (!found) return null;
    const units = await selectCramUnits(
      ctx,
      found.library,
      selectionFrom(args, found.deckId),
      Date.now(),
    );
    return { items: await toQueueItems(ctx, units) };
  },
});

export type CramRateResult =
  | {
      status: "ok";
      cramLogId: Id<"cramLogs">;
      reviewUnitId: Id<"reviewUnits">;
      deckId: Id<"decks">;
      version: number;
    }
  | { status: "stale"; message: string };

/** Record one practice rating. The review unit is not modified. */
export const rate = mutation({
  args: {
    reviewUnitId: v.id("reviewUnits"),
    rating: v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4)),
    requestId: v.string(),
  },
  handler: async (ctx, args): Promise<CramRateResult> => {
    const library = await writableLibrary(ctx);
    const previous = await findRequest(ctx, library._id, args.requestId);
    if (previous) return previous.result as CramRateResult;

    const now = Date.now();
    const unit = await owned(ctx, library, args.reviewUnitId);
    if (!unit || unit.libraryId !== library._id) {
      return { status: "stale", message: "This review unit no longer exists." };
    }
    const cramLogId = await ctx.db.insert("cramLogs", {
      libraryId: library._id,
      deckId: unit.deckId,
      flashcardId: unit.flashcardId,
      reviewUnitId: unit._id,
      rating: args.rating,
      review: now,
    });
    const result: CramRateResult = {
      status: "ok",
      cramLogId,
      reviewUnitId: unit._id,
      deckId: unit.deckId,
      version: unit.version,
    };
    await recordRequest(ctx, library._id, args.requestId, "cram.rate", result, now);
    return result;
  },
});

export type CramUndoResult =
  | { status: "ok"; reviewUnitId: Id<"reviewUnits">; version: number }
  | { status: "stale"; message: string };

/** Remove one cram rating, restoring nothing else: practice has no schedule to restore. */
export const undo = mutation({
  args: { cramLogId: v.id("cramLogs"), requestId: v.string() },
  handler: async (ctx, args): Promise<CramUndoResult> => {
    const library = await writableLibrary(ctx);
    const previous = await findRequest(ctx, library._id, args.requestId);
    if (previous) return previous.result as CramUndoResult;

    const now = Date.now();
    const log = await ctx.db.get(args.cramLogId);
    if (!log || log.libraryId !== library._id) {
      return { status: "stale", message: "That cram answer was already undone." };
    }
    const unit = await owned(ctx, library, log.reviewUnitId);
    if (!unit) return { status: "stale", message: "That card no longer exists." };
    await ctx.db.delete(log._id);
    const result: CramUndoResult = {
      status: "ok",
      reviewUnitId: unit._id,
      version: unit.version,
    };
    await recordRequest(ctx, library._id, args.requestId, "cram.undo", result, now);
    return result;
  },
});
