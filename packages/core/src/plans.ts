/**
 * Account plans and their limits. The backend enforces these; the web pricing
 * page shows them. Pro's library caps stay at the current technical bounds
 * (see `packages/backend/convex/model/limits.ts`) until whole-library reads
 * are paginated; the pricing page advertises them as fair-use "unlimited".
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
    decks: 200,
    flashcards: 2000,
    reviewUnits: 10_000,
    mediaBytes: 80 * 1024 * 1024,
    agentCardsPerMonth: 5000,
    agentWritesPerHour: 300,
  },
} satisfies Record<PlanId, Record<string, number>>;

export const PLAN_PRICES = {
  pro: { monthlyUsd: 6, yearlyUsd: 48 },
};

export function planLimits(plan: PlanId | undefined) {
  return PLAN_LIMITS[plan ?? "free"];
}

/** UTC calendar month key for the monthly assistant card allowance, such as "2026-10". */
export function usageMonth(now: number) {
  return new Date(now).toISOString().slice(0, 7);
}
