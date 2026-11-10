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
import { State } from "@armin/core/scheduler";
import { startOfNextStudyDayMs } from "@armin/core/study";
import { statsGeneration } from "./performance";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { activeDeckIds } from "./access";
import { MAX_REVIEW_UNITS_PER_DECK } from "./limits";
import { sumSizes } from "./deckSizes";

export const WEAKEST_DECKS = 5;
export const WEAKEST_MIN_REVIEWS = 5;

const FORECAST_ROWS_PER_STATE = 8000;

export async function readActivity(
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

export function activityDays(rows: Doc<"dailyActivity">[], starts: number[], timeZone: string) {
  const days = bucketStudyDayCounts([], starts, timeZone);
  const byDay = new Map(rows.map((row) => [row.day, row.count]));
  return days.map((day, index) => ({ ...day, count: byDay.get(starts[index]) ?? 0 }));
}

export function clampHeatmapWeeks(weeks: number | undefined) {
  if (weeks === undefined || !Number.isFinite(weeks)) return STATS_HEATMAP_WEEKS;
  return Math.min(STATS_HEATMAP_WEEKS, Math.max(1, Math.floor(weeks)));
}

export function heatmapDayCount(weeks: number) {
  return (weeks - 1) * 7 + 1;
}

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

export async function overviewSnapshot(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  deckId: Id<"decks"> | null,
  now: number,
) {
  const timeZone = library.timeZone;
  const heatmapStarts = studyDayWindowStarts(now, timeZone, heatmapDayCount(STATS_HEATMAP_WEEKS));
  const dailyStarts = studyDayStarts(now, timeZone, STATS_RECENT_DAYS);
  const decks = deckId ? new Set([deckId]) : await activeDeckIds(ctx, library._id);
  const rows = await readActivity(ctx, library, deckId, heatmapStarts[0]);
  const heatmapDays = activityDays(rows, heatmapStarts, timeZone);
  const dailyDays = activityDays(rows, dailyStarts, timeZone);
  const forecasts = studyDayForwardStarts(now, timeZone, STATS_FORECAST_DAYS);
  const forecast = await forecastDues(
    ctx,
    library,
    deckId,
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
}

export async function weakestDecks(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  decks: Set<Id<"decks">>,
  now: number,
) {
  const since = studyDayStarts(now, library.timeZone, STATS_RECENT_DAYS)[0];
  const generation = statsGeneration(library);
  const ranked = [];
  for (const deckId of decks) {
    const rows = await ctx.db
      .query("dailyActivity")
      .withIndex("by_scope_day", (q) =>
        q
          .eq("libraryId", library._id)
          .eq("scope", deckId)
          .eq("generation", generation)
          .gte("day", since),
      )
      .take(STATS_RECENT_DAYS + 2);
    const reviews = rows.reduce((sum, row) => sum + row.reviews, 0);
    const retained = rows.reduce((sum, row) => sum + row.retained, 0);
    if (reviews < WEAKEST_MIN_REVIEWS) continue;
    ranked.push({ deckId, reviews, retained, ratio: retained / reviews });
  }
  ranked.sort(
    (a, b) =>
      a.ratio - b.ratio ||
      b.reviews - a.reviews ||
      a.deckId.toString().localeCompare(b.deckId.toString()),
  );
  const weakest = [];
  for (const row of ranked.slice(0, WEAKEST_DECKS)) {
    const deck = await ctx.db.get(row.deckId);
    if (!deck || deck.staging) continue;
    weakest.push({ ...row, name: deck.name });
  }
  return weakest;
}
