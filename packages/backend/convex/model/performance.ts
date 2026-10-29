import { startOfStudyDayMs } from "@armin/core/study";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

// Longer than every displayed window, including week alignment and DST margins.
export const ACTIVITY_DAYS = 400;
export const activityCutoff = () => Date.now() - ACTIVITY_DAYS * 86_400_000;
export const statsGeneration = (library: Doc<"libraries">) =>
  `${library.timeZone}:${library.statsEpoch ?? 0}`;

type Counts = { count: number; reviews: number; retained: number };

export function activityBatch() {
  return {
    libraries: new Map<Id<"libraries">, Doc<"libraries"> | null>(),
    cards: new Map<Id<"flashcards">, Pick<Doc<"flashcards">, "_id" | "deckId"> | null>(),
    decks: new Map<Id<"decks">, Doc<"decks"> | null>(),
    boundaries: new Map<
      Id<"reviewUnits">,
      { libraryId: Id<"libraries">; again?: number; introduced?: number }
    >(),
    deltas: new Map<
      string,
      { libraryId: Id<"libraries">; scope: string; generation: string; day: number; delta: Counts }
    >(),
  };
}
export async function flushActivity(ctx: MutationCtx, batch: ReturnType<typeof activityBatch>) {
  for (const value of batch.deltas.values()) {
    if (value.delta.count || value.delta.reviews || value.delta.retained)
      await adjustActivity(
        ctx,
        value.libraryId,
        value.scope,
        value.generation,
        value.day,
        value.delta,
        1,
      );
  }
  // Large history imports must not spend an index range per boundary lookup
  // on top of their existing per-card and daily-activity reads.
  const summaries = new Map<Id<"reviewUnits">, Doc<"unitSummaries">>();
  const bulk = batch.boundaries.size > 128;
  if (bulk) {
    for (const libraryId of new Set(
      [...batch.boundaries.values()].map((value) => value.libraryId),
    )) {
      const rows = await ctx.db
        .query("unitSummaries")
        .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
        .take(10_000);
      for (const row of rows) summaries.set(row.reviewUnitId, row);
    }
  }
  for (const [unitId, boundary] of batch.boundaries) {
    const row = bulk
      ? summaries.get(unitId)
      : await ctx.db
          .query("unitSummaries")
          .withIndex("by_unit", (q) => q.eq("reviewUnitId", unitId))
          .unique();
    if (!row) continue;
    await ctx.db.patch(row._id, {
      latestAgain:
        boundary.again == null
          ? row.latestAgain
          : Math.max(row.latestAgain ?? -Infinity, boundary.again),
      introducedAt:
        boundary.introduced == null
          ? row.introducedAt
          : Math.max(row.introducedAt ?? -Infinity, boundary.introduced),
    });
  }
}

export async function adjustActivity(
  ctx: MutationCtx,
  libraryId: Id<"libraries">,
  scope: string,
  generation: string,
  day: number,
  delta: Counts,
  sign: number,
) {
  const row = await ctx.db
    .query("dailyActivity")
    .withIndex("by_scope_day", (q) =>
      q.eq("libraryId", libraryId).eq("scope", scope).eq("generation", generation).eq("day", day),
    )
    .unique();
  const next = {
    count: (row?.count ?? 0) + sign * delta.count,
    reviews: (row?.reviews ?? 0) + sign * delta.reviews,
    retained: (row?.retained ?? 0) + sign * delta.retained,
  };
  if (row) {
    if (next.count === 0) await ctx.db.delete(row._id);
    else await ctx.db.patch(row._id, next);
  } else if (next.count > 0) {
    await ctx.db.insert("dailyActivity", { libraryId, scope, generation, day, ...next });
  }
}

/** Called with the unwrapped DB, so marker/projection writes cannot recurse. */
export async function recordActivity(
  ctx: MutationCtx,
  table: "reviewLogs" | "cramLogs",
  log: Doc<"reviewLogs"> | Doc<"cramLogs">,
  sign: 1 | -1,
  batch = activityBatch(),
  deferTotals = false,
) {
  if (!batch.libraries.has(log.libraryId))
    batch.libraries.set(log.libraryId, await ctx.db.get(log.libraryId));
  const library = batch.libraries.get(log.libraryId);
  if (!library || library.status !== "active") return;
  const generation = statsGeneration(library);
  if (sign === 1 && log.statsGeneration === generation) return;
  if (sign === -1 && log.statsGeneration !== generation) return;
  if (sign === 1) await ctx.db.patch(log._id, { statsGeneration: generation });
  if (log.review < activityCutoff()) return;
  if (!batch.cards.has(log.flashcardId))
    batch.cards.set(log.flashcardId, await ctx.db.get(log.flashcardId));
  const card = batch.cards.get(log.flashcardId);
  if (card && !batch.decks.has(card.deckId))
    batch.decks.set(card.deckId, await ctx.db.get(card.deckId));
  const deck = card ? batch.decks.get(card.deckId) : null;
  if (!card || !deck || deck.staging) return;
  const day = startOfStudyDayMs(log.review, library.timeZone);
  const delta = {
    count: 1,
    reviews: table === "reviewLogs" && "state" in log && log.state === 2 ? 1 : 0,
    retained:
      table === "reviewLogs" && "state" in log && log.state === 2 && log.rating !== 1 ? 1 : 0,
  };
  const row = await ctx.db
    .query("cardActivity")
    .withIndex("by_card_day", (q) =>
      q.eq("flashcardId", card._id).eq("generation", generation).eq("day", day),
    )
    .unique();
  const next = {
    count: (row?.count ?? 0) + sign,
    reviews: (row?.reviews ?? 0) + sign * delta.reviews,
    retained: (row?.retained ?? 0) + sign * delta.retained,
  };
  if (row) {
    if (next.count === 0) await ctx.db.delete(row._id);
    else await ctx.db.patch(row._id, next);
  } else if (sign === 1) {
    await ctx.db.insert("cardActivity", {
      libraryId: library._id,
      flashcardId: card._id,
      deckId: card.deckId,
      generation,
      day,
      ...next,
    });
  }
  for (const scope of ["", card.deckId]) {
    if (!deferTotals) await adjustActivity(ctx, library._id, scope, generation, day, delta, sign);
    else {
      const key = `${library._id}:${scope}:${generation}:${day}`;
      const value = batch.deltas.get(key) ?? {
        libraryId: library._id,
        scope,
        generation,
        day,
        delta: { count: 0, reviews: 0, retained: 0 },
      };
      value.delta.count += sign * delta.count;
      value.delta.reviews += sign * delta.reviews;
      value.delta.retained += sign * delta.retained;
      batch.deltas.set(key, value);
    }
  }
}

/** A move or deletion transfers only the bounded, displayed history window. */
export async function transferActivity(
  ctx: MutationCtx,
  before: Doc<"flashcards">,
  after: Doc<"flashcards"> | null,
) {
  const library = await ctx.db.get(before.libraryId);
  if (!library || library.status !== "active") return;
  const generation = statsGeneration(library);
  const rows = await ctx.db
    .query("cardActivity")
    .withIndex("by_card_day", (q) =>
      q
        .eq("flashcardId", before._id)
        .eq("generation", generation)
        .gte("day", activityCutoff() - 86_400_000),
    )
    .take(ACTIVITY_DAYS + 3);
  const oldDeck = await ctx.db.get(before.deckId);
  const newDeck = after ? await ctx.db.get(after.deckId) : null;
  for (const row of rows) {
    if (oldDeck && !oldDeck.staging) {
      await adjustActivity(ctx, before.libraryId, before.deckId, generation, row.day, row, -1);
      await adjustActivity(ctx, before.libraryId, "", generation, row.day, row, -1);
    }
    if (after && newDeck && !newDeck.staging) {
      await adjustActivity(ctx, before.libraryId, after.deckId, generation, row.day, row, 1);
      await adjustActivity(ctx, before.libraryId, "", generation, row.day, row, 1);
      await ctx.db.patch(row._id, { deckId: after.deckId });
    } else await ctx.db.delete(row._id);
  }
}

export async function removeDeckActivity(ctx: MutationCtx, deck: Doc<"decks">) {
  const library = await ctx.db.get(deck.libraryId);
  if (!library || library.status !== "active" || deck.staging) return;
  const generation = statsGeneration(library);
  const rows = await ctx.db
    .query("dailyActivity")
    .withIndex("by_scope_day", (q) =>
      q
        .eq("libraryId", deck.libraryId)
        .eq("scope", deck._id)
        .eq("generation", generation)
        .gte("day", activityCutoff() - 86_400_000),
    )
    .take(ACTIVITY_DAYS + 3);
  for (const row of rows) {
    await adjustActivity(ctx, deck.libraryId, "", generation, row.day, row, -1);
    await ctx.db.delete(row._id);
  }
}

export async function syncUnitSummary(
  ctx: MutationCtx,
  unit: Doc<"reviewUnits"> | null,
  unitId: Id<"reviewUnits">,
) {
  const row = await ctx.db
    .query("unitSummaries")
    .withIndex("by_unit", (q) => q.eq("reviewUnitId", unitId))
    .unique();
  if (!unit) {
    if (row) await ctx.db.delete(row._id);
    return;
  }
  const {
    libraryId,
    deckId,
    flashcardId,
    subKey,
    state,
    due,
    lastReview,
    reps,
    locked,
    archived,
    version,
    buriedUntil,
    createdAt,
  } = unit;
  const fields = {
    libraryId,
    deckId,
    flashcardId,
    reviewUnitId: unitId,
    subKey,
    state,
    due,
    lastReview,
    reps,
    locked,
    archived,
    version,
    buriedUntil,
    createdAt,
  };
  if (row) await ctx.db.patch(row._id, fields);
  else {
    const again = await ctx.db
      .query("reviewLogs")
      .withIndex("by_unit_rating_review", (q) => q.eq("reviewUnitId", unitId).eq("rating", 1))
      .order("desc")
      .first();
    const introduced = await ctx.db
      .query("reviewLogs")
      .withIndex("by_unit_state_review", (q) => q.eq("reviewUnitId", unitId).eq("state", 0))
      .order("desc")
      .first();
    await ctx.db.insert("unitSummaries", {
      ...fields,
      latestAgain: again?.review,
      introducedAt: introduced?.review,
    });
  }
}

export async function syncLogBoundary(
  ctx: MutationCtx,
  unitId: Id<"reviewUnits">,
  inserted?: Doc<"reviewLogs">,
) {
  const row = await ctx.db
    .query("unitSummaries")
    .withIndex("by_unit", (q) => q.eq("reviewUnitId", unitId))
    .unique();
  if (!row) return;
  if (inserted) {
    const latestAgain =
      inserted.rating === 1
        ? Math.max(row.latestAgain ?? -Infinity, inserted.review)
        : row.latestAgain;
    const introducedAt =
      inserted.state === 0
        ? Math.max(row.introducedAt ?? -Infinity, inserted.review)
        : row.introducedAt;
    await ctx.db.patch(row._id, { latestAgain, introducedAt });
    return;
  }
  const again = await ctx.db
    .query("reviewLogs")
    .withIndex("by_unit_rating_review", (q) => q.eq("reviewUnitId", unitId).eq("rating", 1))
    .order("desc")
    .first();
  const introduced = await ctx.db
    .query("reviewLogs")
    .withIndex("by_unit_state_review", (q) => q.eq("reviewUnitId", unitId).eq("state", 0))
    .order("desc")
    .first();
  await ctx.db.patch(row._id, { latestAgain: again?.review, introducedAt: introduced?.review });
}
