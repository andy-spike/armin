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
    mediaBytes: 50 * 1024 * 1024,
    agentCardsPerMonth: 300,
    agentWritesPerHour: 60,
  },
  pro: {
    decks: 1000,
    flashcards: 100_000,
    reviewUnits: 250_000,
    mediaBytes: 80 * 1024 * 1024,
    agentCardsPerMonth: 10_000,
    agentWritesPerHour: 600,
  },
} satisfies Record<PlanId, Record<string, number>>;

export const PLAN_PRICES = {
  pro: { monthlyUsd: 6, yearlyUsd: 48 },
};

export const MAX_FLASHCARDS_PER_DECK = 10_000;

export function planLimits(plan: PlanId | undefined) {
  return PLAN_LIMITS[plan ?? "free"];
}

/** UTC calendar month key for the monthly assistant card allowance, such as "2026-10". */
export function usageMonth(now: number) {
  return new Date(now).toISOString().slice(0, 7);
}
