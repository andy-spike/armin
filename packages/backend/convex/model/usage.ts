import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { planLimits, type PlanId } from "@armin/core/plans";
import type { Doc } from "../_generated/dataModel";
import { fail } from "./errors";
import { MAX_DECKS, MAX_FLASHCARDS_PER_DECK } from "./limits";
import { isSelfHosted } from "./selfHost";

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

export function libraryPlan(
  library: Pick<Doc<"libraries">, "plan" | "complimentaryPro"> | null,
): PlanId {
  if (isSelfHosted() || library?.complimentaryPro) return "pro";
  return library?.plan ?? "free";
}

export function conceptCardsAllowed(
  library: Pick<Doc<"libraries">, "plan" | "complimentaryPro"> | null,
) {
  return libraryPlan(library) === "pro";
}

export function requireConceptCards(
  library: Pick<Doc<"libraries">, "plan" | "complimentaryPro"> | null,
) {
  if (!conceptCardsAllowed(library))
    fail(
      "QUOTA",
      "Concept cards are a Pro feature. Upgrade to Pro to create, edit, or review them.",
    );
}

export function limitOwnerName(plan: PlanId) {
  if (isSelfHosted()) return "This instance";
  return plan === "pro" ? "The Pro plan" : "The free plan";
}

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
