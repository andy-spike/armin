import { isWithheldConcept, queueUnit, type QueueUnit } from "./queue";
import { MAX_REVIEW_UNITS_PER_DECK } from "./limits";
import { CONCEPT_SUBKEY, isAwaitingVariant } from "@armin/core/concept";
import { State } from "@armin/core/scheduler";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

const CRAM_STATES = new Set<number>([State.New, State.Learning, State.Relearning, State.Review]);

const MAX_FORGOTTEN_DAYS = 365;
const DAY_MS = 86_400_000;

export type CramSelection = {
  deckId: Id<"decks">;
  states: number[];
  tag?: string;
  forgottenWithinDays?: number;
  includeLocked: boolean;
};

export function cleanCramStates(states: number[]) {
  return [...new Set(states.filter((state) => CRAM_STATES.has(state)))];
}

export function cleanForgottenDays(days: number | undefined) {
  if (days === undefined || !Number.isFinite(days)) return undefined;
  return Math.min(MAX_FORGOTTEN_DAYS, Math.max(1, Math.floor(days)));
}

export function cleanCramTag(tag: string | undefined) {
  const trimmed = tag?.trim();
  return trimmed ? trimmed : undefined;
}

export async function selectCramUnits(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  args: CramSelection,
  now: number,
) {
  const deck = await ctx.db.get(args.deckId);
  if (!deck || deck.libraryId !== library._id) return [];
  const states = new Set(args.states);
  const projected = library.statsReady
    ? await ctx.db
        .query("unitSummaries")
        .withIndex("by_deck", (q) => q.eq("deckId", args.deckId))
        .take(MAX_REVIEW_UNITS_PER_DECK)
    : null;
  let units: QueueUnit[] = (
    projected
      ? projected.map(queueUnit)
      : await ctx.db
          .query("reviewUnits")
          .withIndex("by_deck", (q) => q.eq("deckId", args.deckId))
          .take(MAX_REVIEW_UNITS_PER_DECK)
  ).filter(
    (unit) =>
      unit.libraryId === library._id &&
      !unit.archived &&
      (args.includeLocked || !unit.locked) &&
      states.has(unit.state) &&
      !isWithheldConcept(unit, library),
  );
  if (units.length === 0) return [];
  const awaiting = new Set<Id<"reviewUnits">>();
  for (const unit of units) {
    if (unit.subKey !== CONCEPT_SUBKEY) continue;
    const row = await ctx.db.get(unit._id);
    if (!row || isAwaitingVariant(row)) awaiting.add(unit._id);
  }
  if (awaiting.size) units = units.filter((unit) => !awaiting.has(unit._id));

  if (args.tag) {
    const tag = args.tag;
    const flashcards = new Map<Id<"flashcards">, Doc<"flashcards"> | null>();
    const tagged: QueueUnit[] = [];
    for (const unit of units) {
      if (!flashcards.has(unit.flashcardId)) {
        flashcards.set(unit.flashcardId, await ctx.db.get(unit.flashcardId));
      }
      const flashcard = flashcards.get(unit.flashcardId);
      if (flashcard && !flashcard.archived && flashcard.tags.includes(tag)) tagged.push(unit);
    }
    units = tagged;
  }

  if (args.forgottenWithinDays !== undefined) {
    const cutoff = now - args.forgottenWithinDays * DAY_MS;
    if (projected) {
      const forgotten = new Set(
        projected
          .filter((row) => row.latestAgain != null && row.latestAgain >= cutoff)
          .map((row) => row.reviewUnitId),
      );
      units = units.filter((unit) => forgotten.has(unit._id));
    } else {
      const matching: QueueUnit[] = [];
      for (const unit of units) {
        const log = await ctx.db
          .query("reviewLogs")
          .withIndex("by_unit_rating_review", (q) =>
            q.eq("reviewUnitId", unit._id).eq("rating", 1).gte("review", cutoff),
          )
          .first();
        if (log) matching.push(unit);
      }
      units = matching;
    }
  }

  return units.sort(
    (a, b) => a.due - b.due || a.subKey.localeCompare(b.subKey) || a._id.localeCompare(b._id),
  );
}
