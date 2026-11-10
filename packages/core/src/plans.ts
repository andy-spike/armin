export type PlanId = "free" | "pro";

export const PLAN_LIMITS = {
  free: {
    decks: 50,
    flashcards: 1000,
    reviewUnits: 5000,
    mediaBytes: 1024 * 1024 * 1024,
    agentCardsPerMonth: 300,
    agentWritesPerHour: 60,
    agentReadsPerHour: 2000,
    conceptVariantsPerMonth: 0,
  },
  pro: {
    decks: 1000,
    flashcards: 100_000,
    reviewUnits: 250_000,
    mediaBytes: 5 * 1024 * 1024 * 1024,
    agentCardsPerMonth: 10_000,
    agentWritesPerHour: 600,
    agentReadsPerHour: 6000,
    conceptVariantsPerMonth: 2000,
  },
} satisfies Record<PlanId, Record<string, number>>;

export const PLAN_PRICES = {
  pro: { monthlyUsd: 6, yearlyUsd: 48 },
};

export const MAX_FLASHCARDS_PER_DECK = 10_000;
export const MAX_REVIEW_UNITS_PER_DECK = 15_000;

export const MEDIA_STORAGE_FULL_MESSAGE = "Your storage for images and audio is full.";

export function planLimits(plan: PlanId | undefined) {
  return PLAN_LIMITS[plan ?? "free"];
}

export function usageMonth(now: number) {
  return new Date(now).toISOString().slice(0, 7);
}

export function nextUsageMonthStart(now: number) {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}
