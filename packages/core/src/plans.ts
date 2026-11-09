/**
 * Account plans and their limits. The backend enforces these; the web pricing
 * page shows them. Pro's library limits are the technical bounds in
 * `packages/backend/convex/model/limits.ts`, advertised as fair-use
 * "unlimited". Every deck holds at most 10,000 cards on any plan.
 */
export type PlanId = "free" | "pro";

export const PLAN_LIMITS = {
  free: {
    decks: 50,
    flashcards: 1000,
    reviewUnits: 5000,
    /** One storage pool shared by images and audio. */
    mediaBytes: 1024 * 1024 * 1024,
    agentCardsPerMonth: 300,
    agentWritesPerHour: 60,
    /** Generated concept card variants; concept cards are a Pro feature. */
    conceptVariantsPerMonth: 0,
  },
  pro: {
    decks: 1000,
    flashcards: 100_000,
    reviewUnits: 250_000,
    mediaBytes: 5 * 1024 * 1024 * 1024,
    agentCardsPerMonth: 10_000,
    agentWritesPerHour: 600,
    conceptVariantsPerMonth: 2000,
  },
} satisfies Record<PlanId, Record<string, number>>;

export const PLAN_PRICES = {
  pro: { monthlyUsd: 6, yearlyUsd: 48 },
};

export const MAX_FLASHCARDS_PER_DECK = 10_000;

/**
 * The upload response when a file doesn't fit the library's image and audio
 * pool. Clients match it exactly to tell a full pool from a single file that
 * is too large (both are HTTP 413).
 */
export const MEDIA_STORAGE_FULL_MESSAGE = "Your storage for images and audio is full.";

export function planLimits(plan: PlanId | undefined) {
  return PLAN_LIMITS[plan ?? "free"];
}

/**
 * UTC calendar month key for the monthly allowances (assistant cards and
 * concept card variants), such as "2026-10".
 */
export function usageMonth(now: number) {
  return new Date(now).toISOString().slice(0, 7);
}

/** When the UTC month containing `now` ends and the monthly allowances reset. */
export function nextUsageMonthStart(now: number) {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}
