import { v } from "convex/values";
import { Rating, type Grade } from "ts-fsrs";
import {
  fsrsFieldsFromMs,
  fsrsFieldsToMs,
  fromFsrsCard,
  isPrereqSecured,
  retrievabilityAt,
  toFsrsCard,
} from "@armin/core/scheduler";
import { formatInterval, startOfNextStudyDayMs } from "@armin/core/study";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import { activeDeckIds, owned, readableLibrary, writableLibrary } from "./model/access";
import { checkEligible, isBuried, selectSession, toQueueItems } from "./model/queue";
import {
  bumpRevision,
  displayFor,
  findRequest,
  fsrsSnapshot,
  parseFlashcard,
  recordRequest,
  refreshAfterPrereqChange,
  schedulerFor,
  SettingsCache,
} from "./model/study";

const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

/**
 * Session queue for one deck or the whole library: due reviews (oldest due
 * first) followed by today's shared Frontier. `now` is a client clock tick so
 * the subscription re-evaluates as time passes even without writes. `deckId`
 * is a string so a malformed route id returns "not found" instead of failing
 * Convex argument validation.
 */
export const queue = query({
  args: { deckId: v.optional(v.string()), now: v.number() },
  handler: async (ctx, { deckId: deckIdArg }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    let deckId: Id<"decks"> | null = null;
    if (deckIdArg !== undefined) {
      deckId = ctx.db.normalizeId("decks", deckIdArg);
      if (!deckId) return null;
      const deck = await ctx.db.get(deckId);
      if (!deck || deck.libraryId !== library._id) return null;
    }
    const now = Date.now();
    const { reviews, frontier } = await selectSession(ctx, library, deckId, now);
    const nextDue = await nextDueAfter(ctx, library, deckId, now);
    return {
      items: await toQueueItems(ctx, [...reviews, ...frontier]),
      reviewCount: reviews.length,
      newCount: frontier.length,
      nextDueAt: nextDue,
      serverNow: now,
    };
  },
});

/**
 * How many review units are due across the library, and when time alone next
 * changes any due count: the next unit falling due, or the next study day
 * (which renews the new-unit allowance). Clients move their clock argument to
 * `refreshAt`, so time-dependent subscriptions re-run only when they must.
 */
export const status = query({
  args: { now: v.number() },
  handler: async (ctx) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const now = Date.now();
    const { reviews, frontier } = await selectSession(ctx, library, null, now);
    const nextDue = await nextDueAfter(ctx, library, null, now);
    const nextDay = startOfNextStudyDayMs(now, library.timeZone);
    return {
      due: reviews.length + frontier.length,
      refreshAt: nextDue == null ? nextDay : Math.min(nextDue, nextDay),
    };
  },
});

/** Earliest future due time among eligible units (for client refresh timers). */
async function nextDueAfter(
  ctx: Parameters<typeof readableLibrary>[0],
  library: Doc<"libraries">,
  deckId: Id<"decks"> | null,
  now: number,
) {
  const decks = deckId
    ? new Set((await ctx.db.get(deckId))?.libraryId === library._id ? [deckId] : [])
    : await activeDeckIds(ctx, library._id);
  let earliest: number | null = null;
  // A bury ends at the next study day, which `status` already schedules, but a
  // buried unit can also hide a later unit that falls due sooner. Look past a
  // bounded run of buried units so the clock still wakes for that one.
  const MAX_BURIED_SCAN = 10;
  for (const id of deckId ? (decks.has(deckId) ? [deckId] : []) : decks) {
    const future = await ctx.db
      .query("reviewUnits")
      .withIndex("by_deck_eligible_due", (q) =>
        q.eq("deckId", id).eq("locked", false).eq("archived", false).gt("due", now),
      )
      .take(MAX_BURIED_SCAN + 1);
    for (const unit of future) {
      if (isBuried(unit, now)) continue;
      if (earliest === null || unit.due < earliest) earliest = unit.due;
      break;
    }
  }
  return earliest;
}

/** The four possible outcomes for a review unit, without committing. */
export const preview = query({
  args: { reviewUnitId: v.id("reviewUnits"), now: v.number() },
  handler: async (ctx, { reviewUnitId }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const unit = await owned(ctx, library, reviewUnitId);
    if (!unit || unit.libraryId !== library._id) return null;
    const settings = new SettingsCache(ctx, library._id);
    const scheduler = schedulerFor(await settings.forDeck(unit.deckId));
    const now = Date.now();
    const outcomes = scheduler.repeat(toFsrsCard(fsrsFieldsFromMs(unit)), new Date(now));
    return {
      version: unit.version,
      options: GRADES.map((rating) => {
        const due = outcomes[rating].card.due.getTime();
        return { rating, due, label: formatInterval(now, due) };
      }),
    };
  },
});

const REVIEW_STATE_NAMES = ["New", "Learning", "Review", "Relearning"] as const;

function reviewStateName(state: number) {
  return REVIEW_STATE_NAMES[state] ?? "Unknown";
}

/** Newest reviews shown in the card info sheet; lifetime history is unbounded. */
const CARD_INFO_HISTORY_LIMIT = 100;

/**
 * Everything behind one flashcard: each review unit's schedule and current
 * recall probability, plus its recent review history from reviewLogs. History
 * is read newest first and capped, because lifetime review history is
 * unbounded. Ownership comes from the session's library.
 */
export const cardInfo = query({
  args: { flashcardId: v.string() },
  handler: async (ctx, { flashcardId }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
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
    // Resolve each unit's scheduler once; units of one flashcard share a deck.
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
      locked: unit.locked,
      archived: unit.archived,
      buried: isBuried(unit, now),
      buriedUntil: unit.buriedUntil ?? null,
      version: unit.version,
    }));

    // The newest review of each unit produced the unit's current schedule; an
    // older review's result is the `before` snapshot of the next review. This
    // gives each history row the interval it actually scheduled, including
    // same-day learning steps.
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
  },
});

export type RateResult =
  | {
      status: "ok";
      reviewLogId: Id<"reviewLogs">;
      reviewUnitId: Id<"reviewUnits">;
      deckId: Id<"decks">;
      version: number;
    }
  | { status: "stale"; message: string }
  | { status: "ineligible"; message: string };

/**
 * Rate a review unit. One transaction validates ownership, the version the
 * client displayed, and eligibility (lock, archive, due, shared Frontier);
 * computes FSRS at accepted server time; writes the schedule and history; and
 * refreshes every prerequisite consequence. A repeated `requestId` returns the
 * first outcome instead of applying the answer again.
 */
export const rate = mutation({
  args: {
    reviewUnitId: v.id("reviewUnits"),
    rating: v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4)),
    expectedVersion: v.number(),
    requestId: v.string(),
  },
  handler: async (ctx, args): Promise<RateResult> => {
    const library = await writableLibrary(ctx);
    const previous = await findRequest(ctx, library._id, args.requestId);
    if (previous) return previous.result as RateResult;

    const now = Date.now();
    const unit = await owned(ctx, library, args.reviewUnitId);
    if (!unit || unit.libraryId !== library._id) {
      return { status: "stale", message: "This review unit no longer exists." };
    }
    if (unit.version !== args.expectedVersion) {
      return {
        status: "stale",
        message: "This card changed since it was shown. Reload it to continue.",
      };
    }
    const ineligible = await checkEligible(unit, now);
    if (ineligible) return { status: "ineligible", message: ineligible };

    const settings = new SettingsCache(ctx, library._id);
    const deckSettings = await settings.forDeck(unit.deckId);
    const scheduler = schedulerFor(deckSettings);
    const { card: next, log } = scheduler.next(
      toFsrsCard(fsrsFieldsFromMs(unit)),
      new Date(now),
      args.rating as Grade,
    );
    const version = unit.version + 1;
    const fields = fsrsFieldsToMs(fromFsrsCard(next));
    await ctx.db.patch(unit._id, {
      ...fields,
      version,
      updatedAt: now,
    });
    // An accepted review proves this flashcard was accessible, including root
    // cards. Later prerequisite edits and Undo must not revoke that access.
    const flashcard = await ctx.db.get(unit.flashcardId);
    if (flashcard && flashcard.prerequisiteAccessGranted !== true) {
      await ctx.db.patch(flashcard._id, { prerequisiteAccessGranted: true });
    }
    const reviewLogId = await ctx.db.insert("reviewLogs", {
      libraryId: library._id,
      deckId: unit.deckId,
      flashcardId: unit.flashcardId,
      reviewUnitId: unit._id,
      rating: log.rating,
      state: log.state,
      due: log.due.getTime(),
      stability: log.stability,
      difficulty: log.difficulty,
      elapsedDays: log.elapsed_days,
      lastElapsedDays: log.last_elapsed_days,
      scheduledDays: log.scheduled_days,
      learningSteps: log.learning_steps,
      review: log.review.getTime(),
      before: fsrsSnapshot(unit),
      unitVersionAfter: version,
    });
    // Dependents' locks depend only on whether this flashcard's units are
    // secured, which is a function of state and stability alone. Prerequisites
    // share their dependents' deck (ADR 0015), so this floor is theirs too. When
    // the answer leaves the unit on the same side of the floor, no lock can
    // change, and the usual case skips walking the downstream graph.
    const floor = deckSettings.prereqStabilityFloor;
    if (isPrereqSecured(unit, floor) !== isPrereqSecured(fields, floor)) {
      await refreshAfterPrereqChange(ctx, unit.flashcardId, settings, now);
    }
    await bumpRevision(ctx, library._id);

    const result: RateResult = {
      status: "ok",
      reviewLogId,
      reviewUnitId: unit._id,
      deckId: unit.deckId,
      version,
    };
    await recordRequest(ctx, library._id, args.requestId, "review.rate", result, now);
    return result;
  },
});

export type UndoResult =
  | { status: "ok"; reviewUnitId: Id<"reviewUnits">; version: number }
  | { status: "stale"; message: string };

/**
 * Undo exactly one review: it must still be the unit's latest review, and the
 * unit must still be in the state that review produced. Restores the saved
 * pre-review schedule, removes the log, and refreshes prerequisite effects.
 */
export const undo = mutation({
  args: {
    reviewLogId: v.id("reviewLogs"),
    expectedVersion: v.number(),
    requestId: v.string(),
  },
  handler: async (ctx, args): Promise<UndoResult> => {
    const library = await writableLibrary(ctx);
    const previous = await findRequest(ctx, library._id, args.requestId);
    if (previous) return previous.result as UndoResult;

    const now = Date.now();
    const log = await ctx.db.get(args.reviewLogId);
    if (!log || log.libraryId !== library._id) {
      return { status: "stale", message: "That review was already undone." };
    }
    const unit = await owned(ctx, library, log.reviewUnitId);
    if (!unit) return { status: "stale", message: "That review unit no longer exists." };
    const latest = await ctx.db
      .query("reviewLogs")
      .withIndex("by_unit_review", (q) => q.eq("reviewUnitId", unit._id))
      .order("desc")
      .first();
    if (
      latest?._id !== log._id ||
      unit.version !== args.expectedVersion ||
      unit.version !== log.unitVersionAfter
    ) {
      return {
        status: "stale",
        message: "This card changed after that review, so it can't be undone.",
      };
    }
    const version = unit.version + 1;
    await ctx.db.patch(unit._id, { ...log.before, version, updatedAt: now });
    await ctx.db.delete(log._id);
    const settings = new SettingsCache(ctx, library._id);
    await refreshAfterPrereqChange(ctx, unit.flashcardId, settings, now);
    await bumpRevision(ctx, library._id);

    const result: UndoResult = { status: "ok", reviewUnitId: unit._id, version };
    await recordRequest(ctx, library._id, args.requestId, "review.undo", result, now);
    return result;
  },
});

export type BuryUnit = {
  reviewUnitId: Id<"reviewUnits">;
  /** Version this bury wrote, which Undo must still find unchanged. */
  version: number;
  /** The unit's buriedUntil before the bury, for an exact Undo. */
  previousBuriedUntil: number | null;
};

export type BuryResult =
  | {
      status: "ok";
      flashcardId: Id<"flashcards">;
      /** Start of the next study day, in the library time zone. */
      buriedUntil: number;
      units: BuryUnit[];
    }
  | { status: "stale"; message: string };

/**
 * Hide every review unit of a flashcard until the next study day. Burying is
 * an admission rule only: the unit keeps its schedule and reappears
 * automatically once `buriedUntil` passes. The returned units carry their
 * prior values so the review screen's Undo can restore them exactly.
 */
export const bury = mutation({
  args: { flashcardId: v.id("flashcards"), requestId: v.string() },
  handler: async (ctx, args): Promise<BuryResult> => {
    const library = await writableLibrary(ctx);
    const previous = await findRequest(ctx, library._id, args.requestId);
    if (previous) return previous.result as BuryResult;

    const now = Date.now();
    const flashcard = await owned(ctx, library, args.flashcardId);
    if (!flashcard) return { status: "stale", message: "This flashcard no longer exists." };
    const buriedUntil = startOfNextStudyDayMs(now, library.timeZone);
    const units = await ctx.db
      .query("reviewUnits")
      .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcard._id))
      .collect();
    const changed: BuryUnit[] = [];
    for (const unit of units) {
      // A unit already buried at least this long is already hidden; leave its
      // version untouched so an existing Undo still applies.
      if (unit.buriedUntil != null && unit.buriedUntil >= buriedUntil) continue;
      const version = unit.version + 1;
      await ctx.db.patch(unit._id, { buriedUntil, version, updatedAt: now });
      changed.push({
        reviewUnitId: unit._id,
        version,
        previousBuriedUntil: unit.buriedUntil ?? null,
      });
    }
    await bumpRevision(ctx, library._id);

    const result: BuryResult = {
      status: "ok",
      flashcardId: flashcard._id,
      buriedUntil,
      units: changed,
    };
    await recordRequest(ctx, library._id, args.requestId, "review.bury", result, now);
    return result;
  },
});

export type UnburyResult =
  | { status: "ok"; flashcardId: Id<"flashcards"> }
  | { status: "stale"; message: string };

/**
 * Reverse one bury for the review screen's Undo: restore each unit's previous
 * `buriedUntil`, but only while every unit still has the version the bury
 * wrote. Any later change makes the undo stale rather than clobbering it.
 */
export const unbury = mutation({
  args: {
    flashcardId: v.id("flashcards"),
    units: v.array(
      v.object({
        reviewUnitId: v.id("reviewUnits"),
        version: v.number(),
        previousBuriedUntil: v.union(v.number(), v.null()),
      }),
    ),
    requestId: v.string(),
  },
  handler: async (ctx, args): Promise<UnburyResult> => {
    const library = await writableLibrary(ctx);
    const previous = await findRequest(ctx, library._id, args.requestId);
    if (previous) return previous.result as UnburyResult;

    const flashcard = await owned(ctx, library, args.flashcardId);
    if (!flashcard) return { status: "stale", message: "This flashcard no longer exists." };
    const units: { unit: Doc<"reviewUnits">; previousBuriedUntil: number | null }[] = [];
    for (const expected of args.units) {
      const unit = await ctx.db.get(expected.reviewUnitId);
      if (
        !unit ||
        unit.libraryId !== library._id ||
        unit.flashcardId !== flashcard._id ||
        unit.version !== expected.version
      ) {
        return {
          status: "stale",
          message: "This card changed after it was buried, so the bury can't be undone.",
        };
      }
      units.push({ unit, previousBuriedUntil: expected.previousBuriedUntil });
    }
    const now = Date.now();
    for (const { unit, previousBuriedUntil } of units) {
      await ctx.db.patch(unit._id, {
        buriedUntil: previousBuriedUntil ?? undefined,
        version: unit.version + 1,
        updatedAt: now,
      });
    }
    await bumpRevision(ctx, library._id);

    const result: UnburyResult = { status: "ok", flashcardId: flashcard._id };
    await recordRequest(ctx, library._id, args.requestId, "review.unbury", result, now);
    return result;
  },
});
