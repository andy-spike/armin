import type { CramFilters } from "@/lib/queries";

/** FSRS states a cram setup can include, in the order the dialog lists them. */
export const CRAM_STATE_OPTIONS = [
  { value: 0, label: "New" },
  { value: 1, label: "Learning" },
  { value: 3, label: "Relearning" },
  { value: 2, label: "Review" },
] as const;

export const ALL_CRAM_STATES: number[] = CRAM_STATE_OPTIONS.map((option) => option.value);

/** Cram's route search: the setup is part of the URL, so reloads and back work. */
export type CramSearch = {
  states?: string;
  tag?: string;
  forgotten?: number;
  locked?: boolean;
  max?: number;
};

function positiveInt(raw: unknown) {
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export function validateCramSearch(search: Record<string, unknown>): CramSearch {
  return {
    states: typeof search.states === "string" ? search.states : undefined,
    tag: typeof search.tag === "string" && search.tag.trim() ? search.tag : undefined,
    forgotten: positiveInt(search.forgotten),
    locked:
      search.locked === true || search.locked === "true" || search.locked === "1"
        ? true
        : undefined,
    max: positiveInt(search.max),
  };
}

/** A malformed or missing states list falls back to every state. */
export function cramStatesFromSearch(raw: string | undefined) {
  if (!raw) return [...ALL_CRAM_STATES];
  const states = raw
    .split(",")
    .map((part) => Number(part))
    .filter((value) => ALL_CRAM_STATES.includes(value));
  return states.length > 0 ? [...new Set(states)] : [...ALL_CRAM_STATES];
}

export function cramFiltersFromSearch(search: CramSearch): CramFilters {
  return {
    states: cramStatesFromSearch(search.states),
    tag: search.tag,
    forgottenWithinDays: search.forgotten,
    includeLocked: search.locked === true,
  };
}

/** Changing any setup field starts a fresh session. */
export function cramSessionKey(deckId: string, search: CramSearch) {
  return [
    deckId,
    search.states ?? "all",
    search.tag ?? "",
    search.forgotten ?? "",
    search.locked ? "1" : "0",
    search.max ?? "all",
  ].join("|");
}

/** Fisher–Yates, so a session order is not biased by due time. */
export function shuffleCramItems<T>(items: T[]) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}
