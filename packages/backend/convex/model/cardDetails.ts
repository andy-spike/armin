import { retrievabilityAt } from "@armin/core/scheduler";
import { owned } from "./access";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { displayFor, parseFlashcard, schedulerFor, SettingsCache } from "./study";
import { isBuried } from "./queue";

const REVIEW_STATE_NAMES = ["New", "Learning", "Review", "Relearning"] as const;

export const CARD_INFO_HISTORY_LIMIT = 100;

export function reviewStateName(state: number) {
  return REVIEW_STATE_NAMES[state] ?? "Unknown";
}

export async function cardDetails(ctx: QueryCtx, library: Doc<"libraries">, flashcardId: string) {
  const id = ctx.db.normalizeId("flashcards", flashcardId);
  const flashcard = id ? await owned(ctx, library, id) : null;
  if (!flashcard) return null;
  const now = Date.now();
  const parsed = parseFlashcard(flashcard);
  const displayed = displayFor(parsed.type, parsed.content);
  const [deck, unitRows, logs] = await Promise.all([
    ctx.db.get(flashcard.deckId),
    ctx.db
      .query("reviewUnits")
      .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcard._id))
      .collect(),
    ctx.db
      .query("reviewLogs")
      .withIndex("by_flashcard_review", (q) => q.eq("flashcardId", flashcard._id))
      .order("desc")
      .take(CARD_INFO_HISTORY_LIMIT + 1),
  ]);
  const settings = new SettingsCache(ctx, library._id);
  const schedulers = new Map<Id<"decks">, ReturnType<typeof schedulerFor>>();
  const schedulerForDeck = async (deckId: Id<"decks">) => {
    const cached = schedulers.get(deckId);
    if (cached) return cached;
    const scheduler = schedulerFor(await settings.forDeck(deckId));
    schedulers.set(deckId, scheduler);
    return scheduler;
  };

  const units = [...unitRows].sort(
    (a, b) => a.createdAt - b.createdAt || a.subKey.localeCompare(b.subKey),
  );
  for (const unit of unitRows) await schedulerForDeck(unit.deckId);

  const unitViews = units.map((unit) => ({
    reviewUnitId: unit._id,
    subKey: unit.subKey,
    front: unit.front,
    back: unit.back,
    state: unit.state,
    stateName: reviewStateName(unit.state),
    due: unit.due,
    stability: unit.stability,
    difficulty: unit.difficulty,
    retrievability: retrievabilityAt(unit, now, schedulers.get(unit.deckId)!),
    reps: unit.reps,
    lapses: unit.lapses,
    lastReview: unit.lastReview,
    locked: unit.locked,
    archived: unit.archived,
    buried: isBuried(unit, now),
    buriedUntil: unit.buriedUntil ?? null,
    version: unit.version,
  }));

  const unitById = new Map(unitRows.map((unit) => [unit._id, unit]));
  const newerByUnit = new Map<Id<"reviewUnits">, Doc<"reviewLogs">>();
  const reviews = logs.slice(0, CARD_INFO_HISTORY_LIMIT).map((log) => {
    const newer = newerByUnit.get(log.reviewUnitId);
    newerByUnit.set(log.reviewUnitId, log);
    const resultingDue = newer?.before.due ?? unitById.get(log.reviewUnitId)?.due ?? log.due;
    return {
      reviewLogId: log._id,
      reviewUnitId: log.reviewUnitId,
      review: log.review,
      rating: log.rating,
      state: log.state,
      stateName: reviewStateName(log.state),
      intervalMs: Math.max(0, resultingDue - log.review),
      elapsedDays: log.elapsedDays,
    };
  });

  return {
    serverNow: now,
    flashcard: {
      id: flashcard._id,
      deckId: flashcard.deckId,
      deckName: deck?.name ?? "",
      type: parsed.type,
      front: displayed.front,
      back: displayed.back,
      tags: flashcard.tags,
      archived: flashcard.archived,
      locked: flashcard.locked,
      version: flashcard.version,
      createdAt: flashcard.createdAt,
    },
    units: unitViews,
    reviews,
    historyLimit: CARD_INFO_HISTORY_LIMIT,
    historyTruncated: logs.length > CARD_INFO_HISTORY_LIMIT,
  };
}
