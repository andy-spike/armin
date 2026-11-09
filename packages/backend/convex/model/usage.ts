import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { planLimits, type PlanId } from "@armin/core/plans";
import type { Doc } from "../_generated/dataModel";
import { fail } from "./errors";
import { MAX_DECKS, MAX_FLASHCARDS_PER_DECK } from "./limits";
import { isSelfHosted } from "./selfHost";

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
  // Libraries from before the counter held at most 10,000 units.
  return (
    await ctx.db
      .query("reviewUnits")
      .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
      .collect()
  ).length;
}

/**
 * Bounded current usage. Flashcards are summed from the per-deck counters, so
 * the read grows with decks rather than cards; a deck without counters yet is
 * counted from its compact summaries.
 */
export async function libraryUsage(ctx: Pick<QueryCtx, "db">, libraryId: Id<"libraries">) {
  const [decks, counters, reviewUnits] = await Promise.all([
    ctx.db
      .query("decks")
      .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
      .take(MAX_DECKS + 1),
    ctx.db
      .query("deckCounters")
      .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
      .collect(),
    reviewUnitTotal(ctx, libraryId),
  ]);
  const counted = new Map(counters.map((row) => [row.deckId, row.flashcards]));
  let flashcards = 0;
  for (const deck of decks) {
    flashcards +=
      counted.get(deck._id) ??
      (
        await ctx.db
          .query("flashcardSummaries")
          .withIndex("by_deck_created", (q) => q.eq("deckId", deck._id))
          .take(MAX_FLASHCARDS_PER_DECK + 1)
      ).length;
  }
  return { decks: decks.length, flashcards, reviewUnits };
}

/**
 * The plan a library is on. A self-hosted instance has no billing, so its
 * owner gets Pro's limits, which are the technical bounds. An operator can
 * grant complimentary Pro without a subscription. A missing library gets the
 * free plan.
 */
export function libraryPlan(
  library: Pick<Doc<"libraries">, "plan" | "complimentaryPro"> | null,
): PlanId {
  if (isSelfHosted() || library?.complimentaryPro) return "pro";
  return library?.plan ?? "free";
}

/**
 * Whether a library may create, edit, generate for, and review concept cards
 *: Pro only, which includes complimentary Pro and every
 * self-hosted instance (`libraryPlan`). A library that leaves Pro keeps its
 * concept cards untouched; queue selection, cram, rating, and edits skip or
 * refuse them until Pro returns, so nothing needs migrating either way.
 */
export function conceptCardsAllowed(
  library: Pick<Doc<"libraries">, "plan" | "complimentaryPro"> | null,
) {
  return libraryPlan(library) === "pro";
}

/** Refuse a concept card write for a library without Pro. */
export function requireConceptCards(
  library: Pick<Doc<"libraries">, "plan" | "complimentaryPro"> | null,
) {
  if (!conceptCardsAllowed(library))
    fail(
      "QUOTA",
      "Concept cards are a Pro feature. Upgrade to Pro to create, edit, or review them.",
    );
}

/** Who a limit belongs to, for quota messages. */
export function limitOwnerName(plan: PlanId) {
  if (isSelfHosted()) return "This instance";
  return plan === "pro" ? "The Pro plan" : "The free plan";
}

/** The plan limits that apply to a library. */
export async function libraryLimits(ctx: Pick<QueryCtx, "db">, libraryId: Id<"libraries">) {
  const plan = libraryPlan(await ctx.db.get(libraryId));
  return { plan, ...planLimits(plan) };
}

function overLimit(plan: PlanId, noun: string, max: number, have: number, adding: number) {
  const n = (value: number) => value.toLocaleString("en-US");
  const added = adding === 1 ? "" : ` This adds ${n(adding)}.`;
  const name = limitOwnerName(plan);
  fail(
    "QUOTA",
    `${name} allows ${n(max)} ${noun} per library, and this one has ${n(have)}.${added}`,
  );
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
