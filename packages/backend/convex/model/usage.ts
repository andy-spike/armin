import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { fail } from "./errors";
import { MAX_DECKS, MAX_FLASHCARDS, MAX_REVIEW_UNITS } from "./limits";

/** Review items in a library, using the counter with a one-time fallback for old rows. */
export async function reviewUnitTotal(ctx: Pick<QueryCtx, "db">, libraryId: Id<"libraries">) {
  const counter = await ctx.db
    .query("libraryCounters")
    .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
    .unique();
  if (counter?.reviewUnits !== undefined) return counter.reviewUnits;
  return (
    await ctx.db
      .query("reviewUnits")
      .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
      .collect()
  ).length;
}

/** Count compact derived summaries instead of loading every card body.
 * Bounded current usage. The `take(n + 1)` shape detects an over-limit library without scanning. */
export async function libraryUsage(ctx: Pick<QueryCtx, "db">, libraryId: Id<"libraries">) {
  const [decks, flashcards, reviewUnits] = await Promise.all([
    ctx.db
      .query("decks")
      .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
      .take(MAX_DECKS + 1),
    ctx.db
      .query("flashcardSummaries")
      .withIndex("by_library_created", (q) => q.eq("libraryId", libraryId))
      .take(MAX_FLASHCARDS + 1),
    reviewUnitTotal(ctx, libraryId),
  ]);
  return { decks: decks.length, flashcards: flashcards.length, reviewUnits };
}

/** Reject an addition that would cross the beta limits, with the user-facing counts. */
export async function checkCapacity(
  ctx: Pick<QueryCtx, "db">,
  libraryId: Id<"libraries">,
  add: { decks?: number; flashcards: number; reviewUnits: number },
) {
  const usage = await libraryUsage(ctx, libraryId);
  const decks = add.decks ?? 0;
  if (usage.decks + decks > MAX_DECKS)
    fail(
      "QUOTA",
      `This import adds ${decks} decks, but the beta allows ${MAX_DECKS} and this library has ${usage.decks}.`,
    );
  if (usage.flashcards + add.flashcards > MAX_FLASHCARDS)
    fail(
      "QUOTA",
      `This import adds ${add.flashcards} cards, but the beta allows ${MAX_FLASHCARDS} and this library has ${usage.flashcards}.`,
    );
  if (usage.reviewUnits + add.reviewUnits > MAX_REVIEW_UNITS)
    fail(
      "QUOTA",
      `This import adds ${add.reviewUnits} review items, but the beta allows ${MAX_REVIEW_UNITS} and this library has ${usage.reviewUnits}.`,
    );
  return usage;
}
