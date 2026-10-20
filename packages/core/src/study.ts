/**
 * Portable study rules shared by every Armin backend and client: effective
 * scheduling settings, the account-local study day, Frontier selection, and
 * interval labels. Values are plain transport-safe data (epoch milliseconds,
 * strings, numbers) so this module runs in Convex, React Native, and browsers.
 */

import { PRESET_VALUES, type SchedulingPreset } from "./scheduling-presets";

export type SchedulingSettings = {
  requestRetention: number;
  maximumInterval: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  learningSteps: string;
  relearningSteps: string;
  /** JSON array of FSRS weights; null = library defaults. */
  weights: string | null;
  prereqStabilityFloor: number;
  newReviewUnitsPerDay: number;
  keepSiblingReviewUnitsTogether: boolean;
};

export const SCHEDULING_SETTING_KEYS = [
  "requestRetention",
  "maximumInterval",
  "enableFuzz",
  "enableShortTerm",
  "learningSteps",
  "relearningSteps",
  "weights",
  "prereqStabilityFloor",
  "newReviewUnitsPerDay",
  "keepSiblingReviewUnitsTogether",
] as const satisfies readonly (keyof SchedulingSettings)[];

/** The Frontier cap is account-wide, so decks cannot override it. */
export type DeckSettingOverrideKey = Exclude<
  keyof SchedulingSettings,
  "newReviewUnitsPerDay"
>;

export const DECK_SETTING_OVERRIDE_KEYS = SCHEDULING_SETTING_KEYS.filter(
  (key): key is DeckSettingOverrideKey => key !== "newReviewUnitsPerDay",
);

export type DeckSettingsOverrides = {
  [K in DeckSettingOverrideKey]: SchedulingSettings[K] | null;
};

export function emptyDeckOverrides(): DeckSettingsOverrides {
  return {
    requestRetention: null,
    maximumInterval: null,
    enableFuzz: null,
    enableShortTerm: null,
    learningSteps: null,
    relearningSteps: null,
    weights: null,
    prereqStabilityFloor: null,
    keepSiblingReviewUnitsTogether: null,
  };
}

export function resolveEffectiveSettings(
  global: SchedulingSettings,
  overrides: DeckSettingsOverrides,
): SchedulingSettings {
  const effective = { ...global };
  for (const key of DECK_SETTING_OVERRIDE_KEYS) {
    const override = overrides[key];
    if (override !== null && override !== undefined) {
      effective[key] = override as never;
    }
  }
  return effective;
}

export function defaultSchedulingSettings(): SchedulingSettings & {
  schedulingPreset: SchedulingPreset;
} {
  return { ...PRESET_VALUES.balanced, weights: null, schedulingPreset: "balanced" };
}

// --- Account-local study day ---

export const DEFAULT_TIME_ZONE = "UTC";

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

function zonedParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(ms);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset (local − UTC) in milliseconds for `timeZone` at instant `ms`. */
function timeZoneOffsetMs(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (ms - (ms % 1000));
}

/** Calendar date (YYYY-MM-DD) of `ms` in `timeZone`. */
export function studyDayKey(ms: number, timeZone: string): string {
  const p = zonedParts(ms, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * Epoch milliseconds of local midnight that starts the study day containing
 * `ms` in `timeZone`. Handles DST by re-evaluating the offset at the guess.
 */
export function startOfStudyDayMs(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone);
  const localMidnightAsUtc = Date.UTC(p.year, p.month - 1, p.day);
  let guess = localMidnightAsUtc - timeZoneOffsetMs(ms, timeZone);
  guess = localMidnightAsUtc - timeZoneOffsetMs(guess, timeZone);
  return guess;
}

/** Epoch milliseconds of the next local midnight after `ms`. */
export function startOfNextStudyDayMs(ms: number, timeZone: string): number {
  const start = startOfStudyDayMs(ms, timeZone);
  // 26h always lands inside the next local day, even across DST changes.
  return startOfStudyDayMs(start + 26 * 3_600_000, timeZone);
}

// --- Frontier selection ---

/** In-place Fisher–Yates shuffle; `random` is injectable for determinism. */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Pick the Frontier review units admitted today. With sibling grouping, a
 * flashcard's eligible new review units enter together, and the cap counts
 * individual review units admitted. `arrange` orders the candidates (random
 * by default; pass an identity function when the caller pre-ranked them).
 */
export function selectFrontier<T extends { flashcardId: string }>(
  frontier: T[],
  remaining: number,
  keepSiblingsTogether: boolean,
  arrange: (items: T[]) => T[] = (items) => shuffle(items),
): T[] {
  if (remaining <= 0) return [];
  if (!keepSiblingsTogether) {
    return arrange([...frontier]).slice(0, remaining);
  }
  const byFlashcardId = new Map<string, T[]>();
  for (const unit of frontier) {
    const siblings = byFlashcardId.get(unit.flashcardId) ?? [];
    siblings.push(unit);
    byFlashcardId.set(unit.flashcardId, siblings);
  }
  const selected: T[] = [];
  const seen = new Set<string>();
  for (const unit of arrange([...frontier])) {
    if (selected.length >= remaining) break;
    if (seen.has(unit.flashcardId)) continue;
    seen.add(unit.flashcardId);
    selected.push(...(byFlashcardId.get(unit.flashcardId) ?? []));
  }
  return selected;
}

/** Compact interval label for rating previews (e.g. "10m", "3d"). */
export function formatInterval(fromMs: number, toMs: number): string {
  const ms = Math.max(0, toMs - fromMs);
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(ms / 3600000);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(ms / 86400000);
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

/** Lower values sort closer to the front of a due-soon list. */
export function dueSortPriority(
  row: { locked: boolean; state: number; due: number },
  nowMs: number,
): number {
  if (row.locked) return 95;
  if (row.state === 0) return 90;
  if (row.due <= nowMs) return 0;
  const ms = row.due - nowMs;
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return 1 + mins / 1000;
  const days = Math.ceil(ms / 86_400_000);
  if (days < 30) return 10 + days;
  const months = Math.ceil(days / 30);
  if (months < 12) return 50 + months;
  return 80;
}

export const BROWSE_PAGE_SIZE = 30;

export const BROWSE_SORT_KEYS = [
  "due-soon",
  "due-later",
  "created-new",
  "created-old",
  "front-asc",
  "front-desc",
  "back-asc",
  "back-desc",
  "state-asc",
  "state-desc",
  "locked-first",
  "locked-last",
  "deck-asc",
  "deck-desc",
] as const;

export type BrowseSortKey = (typeof BROWSE_SORT_KEYS)[number];

/** Normalize and de-duplicate tags case-insensitively, preserving first casing. */
export function normalizeTags(input: string[] = []): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input) {
    const tag = raw.trim().replace(/\s+/g, " ");
    if (!tag) continue;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}
