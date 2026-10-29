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
  summarizeReviewUnitStates,
  type ReviewUnitStateCounts,
} from "@armin/core/stats";
import { statsGeneration } from "./model/performance";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { activeDeckIds, readableLibrary } from "./model/access";
import { MAX_REVIEW_UNITS_PER_DECK } from "./model/limits";
import { sumSizes } from "./model/deckSizes";
import { State } from "@armin/core/scheduler";
import { startOfNextStudyDayMs } from "@armin/core/study";

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
  if (!deck || deck.libraryId !== library._id || deck.staging) return { ok: false as const };
  return { ok: true as const, deckId };
}

async function readActivity(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  deckId: Id<"decks"> | null,
  since: number,
) {
  return ctx.db
    .query("dailyActivity")
    .withIndex("by_scope_day", (q) =>
      q
        .eq("libraryId", library._id)
        .eq("scope", deckId ?? "")
        .eq("generation", statsGeneration(library))
        .gte("day", since),
    )
    .take(370);
}

function activityDays(rows: Doc<"dailyActivity">[], starts: number[], timeZone: string) {
  const days = bucketStudyDayCounts([], starts, timeZone);
  const byDay = new Map(rows.map((row) => [row.day, row.count]));
  return days.map((day, index) => ({ ...day, count: byDay.get(starts[index]) ?? 0 }));
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

/** Units read per review state for the forecast; past this the forecast is truncated. */
const FORECAST_ROWS_PER_STATE = 8000;

/**
 * Due times of studyable reviews through the end of the forecast window,
 * from the review-state indexes, so new units never count toward the read.
 */
async function forecastDues(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  deckId: Id<"decks"> | null,
  decks: Set<Id<"decks">>,
  end: number,
) {
  const dues: number[] = [];
  let truncated = false;
  for (const state of [State.Learning, State.Review, State.Relearning]) {
    const rows = deckId
      ? await ctx.db
          .query("unitSummaries")
          .withIndex("by_deck_state_due", (q) =>
            q
              .eq("deckId", deckId)
              .eq("locked", false)
              .eq("archived", false)
              .eq("state", state)
              .lt("due", end),
          )
          .take(FORECAST_ROWS_PER_STATE)
      : await ctx.db
          .query("unitSummaries")
          .withIndex("by_library_state_due", (q) =>
            q
              .eq("libraryId", library._id)
              .eq("locked", false)
              .eq("archived", false)
              .eq("state", state)
              .lt("due", end),
          )
          .take(FORECAST_ROWS_PER_STATE);
    if (rows.length === FORECAST_ROWS_PER_STATE) truncated = true;
    for (const row of rows) if (decks.has(row.deckId)) dues.push(row.due);
  }
  return { dues, truncated };
}

/** Unit-state totals from the deck counters; decks without counters yet are read. */
async function stateTotals(ctx: QueryCtx, library: Doc<"libraries">, decks: Set<Id<"decks">>) {
  const rows = await ctx.db
    .query("deckUnitCounts")
    .withIndex("by_library", (q) => q.eq("libraryId", library._id))
    .collect();
  const counted = rows.filter((row) => decks.has(row.deckId));
  const sizes = sumSizes(counted);
  const totals: ReviewUnitStateCounts = {
    newCount: sizes.newCount,
    learningCount: sizes.learningCount,
    reviewCount: sizes.reviewCount,
    relearningCount: sizes.relearningCount,
    lockedCount: sizes.lockedCount,
    archivedCount: sizes.archivedCount,
    total: sizes.total,
  };
  const have = new Set(counted.map((row) => row.deckId));
  for (const deckId of decks) {
    if (have.has(deckId)) continue;
    // Decks from before the counters were small; their counters appear on the next write.
    const units = await ctx.db
      .query("unitSummaries")
      .withIndex("by_deck", (q) => q.eq("deckId", deckId))
      .take(MAX_REVIEW_UNITS_PER_DECK);
    const deck = summarizeReviewUnitStates(units);
    for (const key of Object.keys(totals) as (keyof ReviewUnitStateCounts)[])
      totals[key] += deck[key];
  }
  return totals;
}

/**
 * Everything the Stats page shows, in one bounded read per data source. `now`
 * is the client study clock: it makes the subscription re-run when the study
 * day rolls over, while the server still buckets against its own current time.
 */
export const overview = query({
  args: { deckId: v.optional(v.string()), now: v.number() },
  handler: async (ctx, { deckId: deckIdArg, now }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const scope = await resolveDeckScope(ctx, library, deckIdArg);
    if (!scope.ok) return null;

    const timeZone = library.timeZone;
    const heatmapStarts = studyDayWindowStarts(now, timeZone, heatmapDayCount(STATS_HEATMAP_WEEKS));
    const dailyStarts = studyDayStarts(now, timeZone, STATS_RECENT_DAYS);
    const decks = scope.deckId ? new Set([scope.deckId]) : await activeDeckIds(ctx, library._id);
    const rows = await readActivity(ctx, library, scope.deckId, heatmapStarts[0]);
    const heatmapDays = activityDays(rows, heatmapStarts, timeZone);
    const dailyDays = activityDays(rows, dailyStarts, timeZone);
    const forecasts = studyDayForwardStarts(now, timeZone, STATS_FORECAST_DAYS);
    const forecast = await forecastDues(
      ctx,
      library,
      scope.deckId,
      decks,
      startOfNextStudyDayMs(forecasts[forecasts.length - 1], timeZone),
    );
    const recent = rows.filter((row) => row.day >= dailyStarts[0]);
    const reviews = recent.reduce((sum, row) => sum + row.reviews, 0);
    const retained = recent.reduce((sum, row) => sum + row.retained, 0);
    return {
      timeZone,
      heatmap: studyDaySeries(heatmapDays),
      daily: studyDaySeries(dailyDays),
      forecast: studyDaySeries(bucketForecast(forecast.dues, forecasts, timeZone)),
      retention: { reviews, retained, ratio: reviews === 0 ? null : retained / reviews },
      states: await stateTotals(ctx, library, decks),
      streak: reviewStreaks(heatmapDays),
      truncated: forecast.truncated,
      pending: library.statsReady !== true,
    };
  },
});

/**
 * Just the heatmap and streak, for the compact panel on the Decks page. `weeks`
 * is clamped so a client cannot ask for an unbounded history read.
 */
export const heatmap = query({
  args: { deckId: v.optional(v.string()), weeks: v.optional(v.number()), now: v.number() },
  handler: async (ctx, { deckId: deckIdArg, weeks, now }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const scope = await resolveDeckScope(ctx, library, deckIdArg);
    if (!scope.ok) return null;

    const timeZone = library.timeZone;
    const starts = studyDayWindowStarts(now, timeZone, heatmapDayCount(clampHeatmapWeeks(weeks)));
    const rows = await readActivity(ctx, library, scope.deckId, starts[0]);
    const days = activityDays(rows, starts, timeZone);
    return {
      ...studyDaySeries(days),
      streak: reviewStreaks(days),
      truncated: false,
      pending: library.statsReady !== true,
    };
  },
});
