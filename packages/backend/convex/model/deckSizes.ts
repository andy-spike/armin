import { summarizeReviewUnitStates } from "@armin/core/stats";
import { isPendingSchedule, State } from "@armin/core/scheduler";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { fail } from "./errors";
import { MAX_FLASHCARDS_PER_DECK, MAX_REVIEW_UNITS_PER_DECK } from "./limits";

/*
 * Per-deck sizes in `deckUnitCounts`, kept by the flashcard and review-unit
 * triggers. They are the one place a deck's size bound is enforced, so every
 * create, import, and move into a deck is checked. Their unit-state totals and
 * Frontier counts let Stats and navigation total a library without reading
 * every unit.
 */

type CountedUnit = Pick<
  Doc<"reviewUnits">,
  "deckId" | "state" | "locked" | "archived" | "lastReview" | "reps" | "due"
>;
export type DeckSizes = Omit<
  Doc<"deckUnitCounts">,
  "_id" | "_creationTime" | "libraryId" | "deckId"
>;

const ZERO: DeckSizes = {
  flashcards: 0,
  total: 0,
  frontierCandidates: 0,
  newCount: 0,
  learningCount: 0,
  reviewCount: 0,
  relearningCount: 0,
  lockedCount: 0,
  archivedCount: 0,
};

/** New, unlocked, unarchived, never reviewed: a candidate for the Frontier. */
export function isFrontierCandidate(unit: Omit<CountedUnit, "deckId">) {
  return (
    unit.state === State.New &&
    !unit.locked &&
    !unit.archived &&
    unit.lastReview == null &&
    !isPendingSchedule(unit)
  );
}

/** What a set of units contributes to its deck's sizes. */
function unitSizes(units: Omit<CountedUnit, "deckId">[]): Omit<DeckSizes, "flashcards"> {
  return {
    ...summarizeReviewUnitStates(units),
    frontierCandidates: units.filter(isFrontierCandidate).length,
  };
}

function add(a: DeckSizes, b: Partial<DeckSizes>, sign = 1) {
  const out = { ...a };
  for (const key of Object.keys(ZERO) as (keyof DeckSizes)[]) out[key] += sign * (b[key] ?? 0);
  return out;
}

/**
 * Move a deck's sizes by `delta`. A deck without a row yet is counted from its
 * rows as they stand now, after the triggering write, so that change is
 * already included. Decks from before the counters held at most 2,000 cards.
 */
async function adjust(ctx: MutationCtx, deckId: Id<"decks">, delta: DeckSizes) {
  const row = await ctx.db
    .query("deckUnitCounts")
    .withIndex("by_deck", (q) => q.eq("deckId", deckId))
    .unique();
  let next: DeckSizes;
  if (row) {
    const { _id, _creationTime, libraryId: _library, deckId: _deck, ...current } = row;
    next = add(current, delta);
    await ctx.db.patch(_id, next);
  } else {
    const deck = await ctx.db.get(deckId);
    if (!deck) return; // Deleted decks drop their counters.
    const [flashcards, units] = await Promise.all([
      ctx.db
        .query("flashcards")
        .withIndex("by_deck", (q) => q.eq("deckId", deckId))
        .collect(),
      ctx.db
        .query("reviewUnits")
        .withIndex("by_deck", (q) => q.eq("deckId", deckId))
        .collect(),
    ]);
    next = { flashcards: flashcards.length, ...unitSizes(units) };
    await ctx.db.insert("deckUnitCounts", { libraryId: deck.libraryId, deckId, ...next });
  }
  if (delta.flashcards > 0 && next.flashcards > MAX_FLASHCARDS_PER_DECK)
    fail(
      "QUOTA",
      `A deck holds at most ${MAX_FLASHCARDS_PER_DECK.toLocaleString("en-US")} flashcards. Split the cards across more decks.`,
    );
  if (delta.total > 0 && next.total > MAX_REVIEW_UNITS_PER_DECK)
    fail(
      "QUOTA",
      `A deck holds at most ${MAX_REVIEW_UNITS_PER_DECK.toLocaleString("en-US")} review items. Split the cards across more decks.`,
    );
}

/** Apply one flashcard write to its deck sizes. */
export async function countFlashcardChange(
  ctx: MutationCtx,
  before: Pick<Doc<"flashcards">, "deckId"> | null,
  after: Pick<Doc<"flashcards">, "deckId"> | null,
) {
  if (before?.deckId === after?.deckId) return;
  if (before) await adjust(ctx, before.deckId, { ...ZERO, flashcards: -1 });
  if (after) await adjust(ctx, after.deckId, { ...ZERO, flashcards: 1 });
}

/** Apply one review-unit write to its deck sizes. */
export async function countUnitChange(
  ctx: MutationCtx,
  before: CountedUnit | null,
  after: CountedUnit | null,
) {
  const deltas = new Map<Id<"decks">, DeckSizes>();
  for (const [unit, sign] of [
    [before, -1],
    [after, 1],
  ] as const) {
    if (!unit) continue;
    deltas.set(unit.deckId, add(deltas.get(unit.deckId) ?? ZERO, unitSizes([unit]), sign));
  }
  for (const [deckId, delta] of deltas) {
    if (Object.values(delta).some((value) => value !== 0)) await adjust(ctx, deckId, delta);
  }
}

/** Sum deck sizes, for library totals. */
export function sumSizes(rows: DeckSizes[]) {
  return rows.reduce((sum, row) => add(sum, row), ZERO);
}
