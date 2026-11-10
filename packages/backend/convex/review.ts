import { v } from "convex/values";
import { Rating, type Grade } from "ts-fsrs";
import { fsrsFieldsFromMs, toFsrsCard } from "@armin/core/scheduler";
import { formatInterval, startOfNextStudyDayMs } from "@armin/core/study";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import { owned, readableDeck, readableLibrary, writableLibrary } from "./model/access";
import { restoreVariant } from "./model/concepts";
import {
  isBuried,
  isWithheldConcept,
  selectSession,
  toQueueItems,
  queueDescriptors,
  dueCounts,
  scopeDecks,
} from "./model/queue";
import { cardDetails } from "./model/cardDetails";
import { rateReviewUnit, type RateResult } from "./model/review";
import {
  bumpRevision,
  findRequest,
  recordRequest,
  refreshAfterPrereqChange,
  schedulerFor,
  SettingsCache,
} from "./model/study";

export type { RateResult } from "./model/review";

const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

export const queue = query({
  args: { deckId: v.optional(v.string()), now: v.number(), metadataOnly: v.optional(v.boolean()) },
  handler: async (ctx, { deckId: deckIdArg, now }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    let deckId: Id<"decks"> | null = null;
    if (deckIdArg !== undefined) {
      const deck = await readableDeck(ctx, library, deckIdArg);
      if (!deck) return null;
      deckId = deck._id;
    }
    const { reviews, frontier } = await selectSession(ctx, library, deckId, now);
    const nextDue = await nextDueAfter(ctx, library, deckId, now);
    return {
      items: queueDescriptors([...reviews, ...frontier]),
      reviewCount: reviews.length,
      newCount: frontier.length,
      nextDueAt: nextDue,
      serverNow: now,
    };
  },
});

export const status = query({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const { perDeck, due } = await dueCounts(ctx, library, now);
    const nextDue = await nextDueAfter(ctx, library, null, now);
    const nextDay = startOfNextStudyDayMs(now, library.timeZone);
    return {
      perDeck,
      due,
      refreshAt: nextDue == null ? nextDay : Math.min(nextDue, nextDay),
    };
  },
});

async function nextDueAfter(
  ctx: Parameters<typeof readableLibrary>[0],
  library: Doc<"libraries">,
  deckId: Id<"decks"> | null,
  now: number,
) {
  const decks = await scopeDecks(ctx, library, deckId);
  if (library.statsReady) {
    const rows = deckId
      ? ctx.db
          .query("unitSummaries")
          .withIndex("by_deck_due", (q) =>
            q.eq("deckId", deckId).eq("locked", false).eq("archived", false).gt("due", now),
          )
      : ctx.db
          .query("unitSummaries")
          .withIndex("by_library_due", (q) =>
            q.eq("libraryId", library._id).eq("locked", false).eq("archived", false).gt("due", now),
          );
    let scanned = 0;
    for await (const unit of rows) {
      if (decks.has(unit.deckId) && !isBuried(unit, now) && !isWithheldConcept(unit, library))
        return unit.due;
      if (++scanned >= 2000) break;
    }
    return null;
  }
  let earliest: number | null = null;
  for (const id of decks) {
    const units = await ctx.db
      .query("reviewUnits")
      .withIndex("by_deck_eligible_due", (q) =>
        q.eq("deckId", id).eq("locked", false).eq("archived", false).gt("due", now),
      )
      .take(11);
    const due = units.find(
      (unit) => !isBuried(unit, now) && !isWithheldConcept(unit, library),
    )?.due;
    if (due != null && (earliest == null || due < earliest)) earliest = due;
  }
  return earliest;
}

export const preview = query({
  args: { reviewUnitId: v.id("reviewUnits"), now: v.number() },
  handler: async (ctx, { reviewUnitId }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const unit = await owned(ctx, library, reviewUnitId);
    if (!unit) return null;
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

export const cardInfo = query({
  args: { flashcardId: v.string() },
  handler: async (ctx, { flashcardId }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    return cardDetails(ctx, library, flashcardId);
  },
});

export const rate = mutation({
  args: {
    reviewUnitId: v.id("reviewUnits"),
    rating: v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4)),
    expectedVersion: v.number(),
    requestId: v.string(),
  },
  handler: async (ctx, args): Promise<RateResult> => {
    const library = await writableLibrary(ctx);
    const previous = await findRequest(ctx, library._id, args.requestId, "review.rate");
    if (previous) return previous.result as RateResult;

    const result = await rateReviewUnit(ctx, library, {
      reviewUnitId: args.reviewUnitId,
      rating: args.rating as Grade,
      expectedVersion: args.expectedVersion,
    });
    if (result.status === "ok") {
      await bumpRevision(ctx, library._id);
      await recordRequest(ctx, library._id, args.requestId, "review.rate", result, Date.now());
    }
    return result;
  },
});

export type UndoResult =
  | { status: "ok"; reviewUnitId: Id<"reviewUnits">; version: number }
  | { status: "stale"; message: string };

export const undo = mutation({
  args: {
    reviewLogId: v.id("reviewLogs"),
    expectedVersion: v.number(),
    requestId: v.string(),
  },
  handler: async (ctx, args): Promise<UndoResult> => {
    const library = await writableLibrary(ctx);
    const previous = await findRequest(ctx, library._id, args.requestId, "review.undo");
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
    const display = log.beforeVariant
      ? await restoreVariant(ctx, unit, log.beforeVariant)
      : undefined;
    const version = unit.version + 1;
    await ctx.db.patch(unit._id, { ...log.before, ...display, version, updatedAt: now });
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
  version: number;
  previousBuriedUntil: number | null;
};

export type BuryResult =
  | {
      status: "ok";
      flashcardId: Id<"flashcards">;
      buriedUntil: number;
      units: BuryUnit[];
    }
  | { status: "stale"; message: string };

export const bury = mutation({
  args: { flashcardId: v.id("flashcards"), requestId: v.string() },
  handler: async (ctx, args): Promise<BuryResult> => {
    const library = await writableLibrary(ctx);
    const previous = await findRequest(ctx, library._id, args.requestId, "review.bury");
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
    const previous = await findRequest(ctx, library._id, args.requestId, "review.unbury");
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

export const items = query({
  args: {
    ids: v.array(v.id("reviewUnits")),
    practiceSeed: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      reviewUnitId: v.id("reviewUnits"),
      flashcardId: v.id("flashcards"),
      deckId: v.id("decks"),
      deckName: v.string(),
      type: v.union(
        v.literal("basic"),
        v.literal("basic_reversed"),
        v.literal("cloze"),
        v.literal("type_answer"),
        v.literal("image_occlusion"),
        v.literal("concept"),
      ),
      content: v.any(),
      subKey: v.string(),
      front: v.string(),
      back: v.string(),
      version: v.number(),
      flashcardVersion: v.number(),
      due: v.number(),
      isNew: v.boolean(),
      hydrated: v.boolean(),
    }),
  ),
  handler: async (ctx, { ids, practiceSeed }) => {
    const library = await readableLibrary(ctx);
    if (!library) return [];
    const units = [];
    for (const id of ids.slice(0, 8)) {
      const unit = await owned(ctx, library, id);
      if (unit) units.push(unit);
    }
    return toQueueItems(ctx, units, { practiceSeed });
  },
});
