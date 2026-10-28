/**
 * Portable review statistics: account-local day buckets, streaks, retention,
 * and review-unit state totals. Everything here is pure and works on plain
 * numbers and strings, so the backend and every client share one definition.
 */

import { startOfNextStudyDayMs, startOfStudyDayMs, studyDayKey } from "./study";

/** FSRS Review state: the pre-review state counted for true retention. */
const REVIEW_STATE = 2;

/** FSRS Again. Every other rating is treated as retained. */
const RATING_AGAIN = 1;

export const STATS_HEATMAP_WEEKS = 52;
export const STATS_COMPACT_HEATMAP_WEEKS = 26;
export const STATS_RECENT_DAYS = 30;
export const STATS_FORECAST_DAYS = 30;

export type StudyDayCount = {
  /** Calendar date (YYYY-MM-DD) in the library's time zone. */
  key: string;
  count: number;
  /** 0 = Sunday … 6 = Saturday, so heatmaps can align to calendar weeks. */
  weekday: number;
};

export type StudyDaySeries = {
  days: StudyDayCount[];
  total: number;
  max: number;
};

export type ReviewStreak = {
  current: number;
  longest: number;
};

export type ReviewRetention = {
  /** Review-state answers in the window. */
  reviews: number;
  /** Answers rated Hard, Good, or Easy. */
  retained: number;
  /** Retained share, or null when the window has no Review-state answers. */
  ratio: number | null;
};

export type ReviewUnitStateCounts = {
  newCount: number;
  learningCount: number;
  reviewCount: number;
  relearningCount: number;
  lockedCount: number;
  archivedCount: number;
  total: number;
};

function weekdayOfDayKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Local midnights for the `days` study days ending today, oldest first. */
export function studyDayStarts(now: number, timeZone: string, days: number) {
  const count = Math.max(1, Math.floor(days));
  const starts = [startOfStudyDayMs(now, timeZone)];
  while (starts.length < count) {
    starts.unshift(startOfStudyDayMs(starts[0] - 1, timeZone));
  }
  return starts;
}

/** Like {@link studyDayStarts}, but walks back to the requested weekday so the
 * first day begins a calendar week. Heatmaps then start on a full column. */
export function studyDayWindowStarts(
  now: number,
  timeZone: string,
  days: number,
  weekStartsOn = 0,
) {
  const starts = studyDayStarts(now, timeZone, days);
  const weekStart = ((Math.floor(weekStartsOn) % 7) + 7) % 7;
  while (weekdayOfDayKey(studyDayKey(starts[0], timeZone)) !== weekStart) {
    starts.unshift(startOfStudyDayMs(starts[0] - 1, timeZone));
  }
  return starts;
}

/** Local midnights for today and the following `days - 1` study days. */
export function studyDayForwardStarts(now: number, timeZone: string, days: number) {
  const count = Math.max(1, Math.floor(days));
  const starts = [startOfStudyDayMs(now, timeZone)];
  while (starts.length < count) {
    starts.push(startOfNextStudyDayMs(starts[starts.length - 1], timeZone));
  }
  return starts;
}

/** Largest study-day start at or before `ms`. `starts` must be ascending. */
function dayIndexAt(starts: readonly number[], ms: number) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (starts[mid] <= ms) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** Count timestamps per study day, ignoring anything outside the range. */
export function bucketStudyDayCounts(
  timestamps: readonly number[],
  starts: readonly number[],
  timeZone: string,
): StudyDayCount[] {
  if (starts.length === 0) return [];
  const counts = Array.from({ length: starts.length }, () => 0);
  const end = startOfNextStudyDayMs(starts[starts.length - 1], timeZone);
  for (const ms of timestamps) {
    if (ms < starts[0] || ms >= end) continue;
    counts[dayIndexAt(starts, ms)] += 1;
  }
  return starts.map((start, index) => {
    const key = studyDayKey(start, timeZone);
    return { key, count: counts[index], weekday: weekdayOfDayKey(key) };
  });
}

/** Total and peak for a day series, for chart headers and bar heights. */
export function studyDaySeries(days: readonly StudyDayCount[]): StudyDaySeries {
  let total = 0;
  let max = 0;
  for (const day of days) {
    total += day.count;
    if (day.count > max) max = day.count;
  }
  return { days: [...days], total, max };
}

/**
 * Due counts per study day. Anything already overdue is folded into the first
 * day (today), so today's bar is the work waiting at the start of the window.
 */
export function bucketForecast(
  dues: readonly number[],
  starts: readonly number[],
  timeZone: string,
): StudyDayCount[] {
  if (starts.length === 0) return [];
  const today = starts[0];
  return bucketStudyDayCounts(
    dues.map((due) => Math.max(due, today)),
    starts,
    timeZone,
  );
}

/**
 * Current and longest runs of consecutive days with at least one review. A day
 * with no reviews yet does not end the current streak until yesterday is also
 * empty, so the streak survives until a full missed day.
 */
export function reviewStreaks(days: readonly StudyDayCount[]): ReviewStreak {
  let longest = 0;
  let run = 0;
  for (const day of days) {
    if (day.count > 0) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }

  let index = days.length - 1;
  if (index >= 0 && days[index].count === 0) index -= 1;
  let current = 0;
  while (index >= 0 && days[index].count > 0) {
    current += 1;
    index -= 1;
  }
  return { current, longest };
}

/**
 * True retention: of reviews whose pre-review state was Review, the share
 * rated Hard, Good, or Easy rather than Again. Learning and relearning answers
 * are excluded because they measure steps, not long-term recall.
 */
export function summarizeRetention(
  logs: readonly { state: number; rating: number }[],
): ReviewRetention {
  let reviews = 0;
  let retained = 0;
  for (const log of logs) {
    if (log.state !== REVIEW_STATE) continue;
    reviews += 1;
    if (log.rating !== RATING_AGAIN) retained += 1;
  }
  return { reviews, retained, ratio: reviews === 0 ? null : retained / reviews };
}

/** Non-overlapping active state totals plus separate locked/archived counts. */
export function summarizeReviewUnitStates(
  units: readonly { state: number; locked: boolean; archived: boolean }[],
): ReviewUnitStateCounts {
  const counts: ReviewUnitStateCounts = {
    newCount: 0,
    learningCount: 0,
    reviewCount: 0,
    relearningCount: 0,
    lockedCount: 0,
    archivedCount: 0,
    total: units.length,
  };
  for (const unit of units) {
    if (unit.archived) counts.archivedCount += 1;
    if (unit.locked) counts.lockedCount += 1;
    if (unit.locked || unit.archived) continue;
    if (unit.state === 0) counts.newCount += 1;
    else if (unit.state === 1) counts.learningCount += 1;
    else if (unit.state === 2) counts.reviewCount += 1;
    else if (unit.state === 3) counts.relearningCount += 1;
  }
  return counts;
}
