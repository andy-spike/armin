import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { planLimits } from "@armin/core/plans";
import { fail } from "./errors";
import { MAX_DECKS, MAX_FLASHCARDS } from "./limits";

/*
 * The one place library capacity is measured and checked. Every write that
 * adds decks or flashcards calls `checkCapacity` with what it is about to add.
 * Review units are also enforced as they are written, by
 * `adjustReviewUnitCount`, so a caller that only edits cards needs no check.
 */

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

/**
 * Bounded current usage. Flashcards are counted from their compact derived
 * summaries instead of loading every card body, and the `take(n + 1)` shape
 * detects an over-limit library without scanning further.
 */
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

/** The plan limits that apply to a library; a missing library gets the free plan. */
export async function libraryLimits(ctx: Pick<QueryCtx, "db">, libraryId: Id<"libraries">) {
  const library = await ctx.db.get(libraryId);
  return { plan: library?.plan ?? "free", ...planLimits(library?.plan) };
}

function overLimit(plan: string, noun: string, max: number, have: number, adding: number) {
  const added = adding === 1 ? "" : ` This adds ${adding}.`;
  const name = plan === "pro" ? "The Pro plan" : "The free plan";
  fail("QUOTA", `${name} allows ${max} ${noun} per library, and this one has ${have}.${added}`);
}

/** Reject an addition that would cross the library's plan limits, with the user-facing counts. */
export async function checkCapacity(
  ctx: Pick<QueryCtx, "db">,
  libraryId: Id<"libraries">,
  add: { decks?: number; flashcards?: number; reviewUnits?: number },
) {
  const [usage, limits] = await Promise.all([
    libraryUsage(ctx, libraryId),
    libraryLimits(ctx, libraryId),
  ]);
  const { decks = 0, flashcards = 0, reviewUnits = 0 } = add;
  if (usage.decks + decks > limits.decks)
    overLimit(limits.plan, "decks", limits.decks, usage.decks, decks);
  if (usage.flashcards + flashcards > limits.flashcards)
    overLimit(limits.plan, "flashcards", limits.flashcards, usage.flashcards, flashcards);
  if (usage.reviewUnits + reviewUnits > limits.reviewUnits)
    overLimit(limits.plan, "review items", limits.reviewUnits, usage.reviewUnits, reviewUnits);
  return usage;
}
