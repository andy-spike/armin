import { v } from "convex/values";
import {
  bucketForecast,
  bucketStudyDayCounts,
  reviewStreaks,
  STATS_FORECAST_DAYS,
  STATS_HEATMAP_WEEKS,
  STATS_RECENT_DAYS,
  studyDayForwardStarts,
  studyDaySeries,
  studyDayStarts,
  studyDayWindowStarts,
  summarizeRetention,
  summarizeReviewUnitStates,
} from "@armin/core/stats";
import { startOfNextStudyDayMs } from "@armin/core/study";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { activeDeckIds, readableLibrary } from "./model/access";
import { MAX_FLASHCARDS, MAX_REVIEW_UNITS } from "./model/limits";

/**
 * Review history is unbounded, so statistics read at most this many of the
 * most recent logs in the requested window. That keeps the query inside one
 * Convex transaction while recent activity and retention stay complete.
 */
const MAX_STATS_REVIEW_LOGS = 20_000;

/** All decks (`null`) or the requested deck, if it belongs to the library. */
async function resolveDeckScope(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  deckIdArg: string | undefined,
) {
  if (deckIdArg === undefined) return { ok: true as const, deckId: null };
  const deckId = ctx.db.normalizeId("decks", deckIdArg);
  if (!deckId) return { ok: false as const };
  const deck = await ctx.db.get(deckId);
  if (!deck || deck.libraryId !== library._id) return { ok: false as const };
  return { ok: true as const, deckId };
}

/**
 * Most recent scheduled reviews in the window, newest first. Logs follow the
 * card's current deck (moved cards keep their history without rewriting it), so
 * deleted or moved cards stop counting immediately.
 */
async function readReviewLogs(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  since: number,
  flashcardIds: Set<Id<"flashcards">>,
) {
  const rows = await ctx.db
    .query("reviewLogs")
    .withIndex("by_library_review", (q) => q.eq("libraryId", library._id).gte("review", since))
    .order("desc")
    .take(MAX_STATS_REVIEW_LOGS);
  return {
    logs: rows.filter((log) => flashcardIds.has(log.flashcardId)),
    truncated: rows.length >= MAX_STATS_REVIEW_LOGS,
  };
}

async function readScopedFlashcardIds(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  deckId: Id<"decks"> | null,
  decks: Set<Id<"decks">>,
) {
  if (deckId) {
    const cards = await ctx.db
      .query("flashcards")
      .withIndex("by_deck", (q) => q.eq("deckId", deckId))
      .take(MAX_FLASHCARDS);
    return new Set(cards.map((card) => card._id));
  }
  const cards = await ctx.db
    .query("flashcards")
    .withIndex("by_library", (q) => q.eq("libraryId", library._id))
    .take(MAX_FLASHCARDS);
  return new Set(cards.filter((card) => decks.has(card.deckId)).map((card) => card._id));
}

/**
 * Scheduled review activity plus history from other study modes. Cram sessions
 * are not part of `reviewLogs`, so their timestamps are merged here when that
 * feature lands; retention must keep reading only scheduled reviews.
 */
function mergeActivityTimestamps(scheduled: number[], extra: number[] = []) {
  // TODO(cram): merge cramLogs review timestamps for this library, deck, and
  // date range into the activity buckets and streaks.
  return scheduled.concat(extra);
}

function clampHeatmapWeeks(weeks: number | undefined) {
  if (weeks === undefined || !Number.isFinite(weeks)) return STATS_HEATMAP_WEEKS;
  return Math.min(STATS_HEATMAP_WEEKS, Math.max(1, Math.floor(weeks)));
}

/**
 * Days to request so the Sunday-aligned heatmap has exactly `weeks` columns:
 * the range plus whatever leading days fill the current partial week.
 */
function heatmapDayCount(weeks: number) {
  return (weeks - 1) * 7 + 1;
}

async function readForecastUnits(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  deckId: Id<"decks"> | null,
  decks: Set<Id<"decks">>,
  end: number,
) {
  if (deckId) {
    return ctx.db
      .query("reviewUnits")
      .withIndex("by_deck_eligible_due", (q) =>
        q.eq("deckId", deckId).eq("locked", false).eq("archived", false).lt("due", end),
      )
      .take(MAX_REVIEW_UNITS);
  }
  const units = await ctx.db
    .query("reviewUnits")
    .withIndex("by_library_eligible_due", (q) =>
      q.eq("libraryId", library._id).eq("locked", false).eq("archived", false).lt("due", end),
    )
    .take(MAX_REVIEW_UNITS);
  return units.filter((unit) => decks.has(unit.deckId));
}

/** Every current review unit in scope, for state and lock/archive totals. */
async function readScopedUnits(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  deckId: Id<"decks"> | null,
  decks: Set<Id<"decks">>,
) {
  if (deckId) {
    return ctx.db
      .query("reviewUnits")
      .withIndex("by_deck", (q) => q.eq("deckId", deckId))
      .take(MAX_REVIEW_UNITS);
  }
  const units = await ctx.db
    .query("reviewUnits")
    .withIndex("by_library", (q) => q.eq("libraryId", library._id))
    .take(MAX_REVIEW_UNITS);
  return units.filter((unit) => decks.has(unit.deckId));
}

/**
 * Everything the Stats page shows, in one bounded read per data source. `now`
 * is the client study clock: it makes the subscription re-run when the study
 * day rolls over, while the server still buckets against its own current time.
 */
export const overview = query({
  args: { deckId: v.optional(v.string()), now: v.number() },
  handler: async (ctx, { deckId: deckIdArg }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const scope = await resolveDeckScope(ctx, library, deckIdArg);
    if (!scope.ok) return null;

    const now = Date.now();
    const timeZone = library.timeZone;
    const heatmapStarts = studyDayWindowStarts(now, timeZone, heatmapDayCount(STATS_HEATMAP_WEEKS));
    const dailyStarts = studyDayStarts(now, timeZone, STATS_RECENT_DAYS);
    const decks = scope.deckId ? new Set([scope.deckId]) : await activeDeckIds(ctx, library._id);
    const flashcardIds = await readScopedFlashcardIds(ctx, library, scope.deckId, decks);
    const { logs, truncated } = await readReviewLogs(ctx, library, heatmapStarts[0], flashcardIds);
    const timestamps = mergeActivityTimestamps(logs.map((log) => log.review));

    const heatmapDays = bucketStudyDayCounts(timestamps, heatmapStarts, timeZone);
    const dailyDays = bucketStudyDayCounts(timestamps, dailyStarts, timeZone);
    const forecasts = studyDayForwardStarts(now, timeZone, STATS_FORECAST_DAYS);
    const forecastEnd = startOfNextStudyDayMs(forecasts[forecasts.length - 1], timeZone);
    const forecastUnits = await readForecastUnits(ctx, library, scope.deckId, decks, forecastEnd);
    const units = await readScopedUnits(ctx, library, scope.deckId, decks);
    const dailySince = dailyStarts[0];

    return {
      timeZone,
      heatmap: studyDaySeries(heatmapDays),
      daily: studyDaySeries(dailyDays),
      forecast: studyDaySeries(
        bucketForecast(
          forecastUnits.map((unit) => unit.due),
          forecasts,
          timeZone,
        ),
      ),
      retention: summarizeRetention(logs.filter((log) => log.review >= dailySince)),
      states: summarizeReviewUnitStates(units),
      streak: reviewStreaks(heatmapDays),
      truncated,
    };
  },
});

/**
 * Just the heatmap and streak, for the compact panel on the Decks page. `weeks`
 * is clamped so a client cannot ask for an unbounded history read.
 */
export const heatmap = query({
  args: { deckId: v.optional(v.string()), weeks: v.optional(v.number()), now: v.number() },
  handler: async (ctx, { deckId: deckIdArg, weeks }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const scope = await resolveDeckScope(ctx, library, deckIdArg);
    if (!scope.ok) return null;

    const now = Date.now();
    const timeZone = library.timeZone;
    const starts = studyDayWindowStarts(now, timeZone, heatmapDayCount(clampHeatmapWeeks(weeks)));
    const decks = scope.deckId ? new Set([scope.deckId]) : await activeDeckIds(ctx, library._id);
    const flashcardIds = await readScopedFlashcardIds(ctx, library, scope.deckId, decks);
    const { logs, truncated } = await readReviewLogs(ctx, library, starts[0], flashcardIds);
    const timestamps = mergeActivityTimestamps(logs.map((log) => log.review));
    const days = bucketStudyDayCounts(timestamps, starts, timeZone);

    return {
      ...studyDaySeries(days),
      streak: reviewStreaks(days),
      truncated,
    };
  },
});
