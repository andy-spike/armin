import { v } from "convex/values";
import { Rating, type Grade } from "ts-fsrs";
import {
  fsrsFieldsFromMs,
  fsrsFieldsToMs,
  fromFsrsCard,
  isPrereqSecured,
  toFsrsCard,
} from "@armin/core/scheduler";
import { formatInterval, startOfNextStudyDayMs } from "@armin/core/study";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import { activeDeckIds, owned, readableLibrary, writableLibrary } from "./model/access";
import { checkEligible, selectSession } from "./model/queue";
import {
  bumpRevision,
  findRequest,
  fsrsSnapshot,
  parseFlashcard,
  recordRequest,
  refreshAfterPrereqChange,
  schedulerFor,
  SettingsCache,
} from "./model/study";

const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

async function toQueueItems(
  ctx: Parameters<typeof readableLibrary>[0],
  units: Doc<"reviewUnits">[],
) {
  const flashcards = new Map<Id<"flashcards">, Doc<"flashcards"> | null>();
  const decks = new Map<Id<"decks">, string>();
  const items = [];
  for (const unit of units) {
    if (!flashcards.has(unit.flashcardId)) {
      flashcards.set(unit.flashcardId, await ctx.db.get(unit.flashcardId));
    }
    const flashcard = flashcards.get(unit.flashcardId);
    if (!flashcard) continue;
    if (!decks.has(unit.deckId)) {
      decks.set(unit.deckId, (await ctx.db.get(unit.deckId))?.name ?? "");
    }
    const { type, content } = parseFlashcard(flashcard);
    items.push({
      reviewUnitId: unit._id,
      flashcardId: unit.flashcardId,
      deckId: unit.deckId,
      deckName: decks.get(unit.deckId) ?? "",
      type,
      content,
      subKey: unit.subKey,
      front: unit.front,
      back: unit.back,
      version: unit.version,
      flashcardVersion: flashcard.version,
      due: unit.due,
      isNew: unit.state === 0,
    });
  }
  return items;
}

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
  for (const id of deckId ? (decks.has(deckId) ? [deckId] : []) : decks) {
    const unit = await ctx.db
      .query("reviewUnits")
      .withIndex("by_deck_eligible_due", (q) =>
        q.eq("deckId", id).eq("locked", false).eq("archived", false).gt("due", now),
      )
      .first();
    if (unit && (earliest === null || unit.due < earliest)) earliest = unit.due;
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
