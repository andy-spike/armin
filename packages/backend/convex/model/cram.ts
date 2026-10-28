import { Rating } from "ts-fsrs";
import { State } from "@armin/core/scheduler";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** Every FSRS state a cram setup can include. */
const CRAM_STATES = new Set<number>([State.New, State.Learning, State.Relearning, State.Review]);

/** Keep the forgotten window a recent-history filter, not a whole-library scan. */
const MAX_FORGOTTEN_DAYS = 365;
const DAY_MS = 86_400_000;

export type CramSelection = {
  deckId: Id<"decks">;
  states: number[];
  tag?: string;
  forgottenWithinDays?: number;
  includeLocked: boolean;
};

/** Drop unknown or repeated states; an empty result matches nothing. */
export function cleanCramStates(states: number[]) {
  return [...new Set(states.filter((state) => CRAM_STATES.has(state)))];
}

/** Fold non-finite or out-of-range day counts into a recent, bounded window. */
export function cleanForgottenDays(days: number | undefined) {
  if (days === undefined || !Number.isFinite(days)) return undefined;
  return Math.min(MAX_FORGOTTEN_DAYS, Math.max(1, Math.floor(days)));
}

export function cleanCramTag(tag: string | undefined) {
  const trimmed = tag?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Review units matching a cram setup: the deck's unarchived units in the
 * chosen states, optionally on one tag, optionally only units rated Again
 * within the recent window. Archived cards are always excluded. Locked units
 * are excluded unless the setup includes them; cram never changes the schedule.
 */
export async function selectCramUnits(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  args: CramSelection,
  now: number,
): Promise<Doc<"reviewUnits">[]> {
  const deck = await ctx.db.get(args.deckId);
  if (!deck || deck.libraryId !== library._id) return [];
  const states = new Set(args.states);
  let units = (
    await ctx.db
      .query("reviewUnits")
      .withIndex("by_deck", (q) => q.eq("deckId", args.deckId))
      .collect()
  ).filter(
    (unit) =>
      unit.libraryId === library._id &&
      !unit.archived &&
      (args.includeLocked || !unit.locked) &&
      states.has(unit.state),
  );
  if (units.length === 0) return [];

  if (args.tag) {
    const tag = args.tag;
    const flashcards = new Map<Id<"flashcards">, Doc<"flashcards"> | null>();
    const tagged: Doc<"reviewUnits">[] = [];
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
    const forgotten = new Set<Id<"reviewUnits">>();
    const logs = await ctx.db
      .query("reviewLogs")
      .withIndex("by_library_rating_review", (q) =>
        q.eq("libraryId", library._id).eq("rating", Rating.Again).gte("review", cutoff),
      )
      .collect();
    for (const log of logs) forgotten.add(log.reviewUnitId);
    units = units.filter((unit) => forgotten.has(unit._id));
  }

  return units.sort(
    (a, b) => a.due - b.due || a.subKey.localeCompare(b.subKey) || a._id.localeCompare(b._id),
  );
}
