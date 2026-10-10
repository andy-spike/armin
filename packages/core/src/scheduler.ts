import {
  createEmptyCard,
  fsrs,
  State,
  type Card as FsrsCard,
  type FSRS,
  type Steps,
} from "ts-fsrs";
import type { ReviewUnit as DbReviewUnit, Settings } from "./schema";

/** Review units awaiting prerequisite unlock use a far-future due date. */
export const PENDING_DUE = new Date("2099-01-01T00:00:00.000Z");

/** The subset of review-unit columns that hold FSRS scheduling state. */
export type FsrsFields = Pick<
  DbReviewUnit,
  | "due"
  | "stability"
  | "difficulty"
  | "elapsedDays"
  | "scheduledDays"
  | "learningSteps"
  | "reps"
  | "lapses"
  | "state"
  | "lastReview"
>;

function parseSteps(csv: string): Steps {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as Steps;
}

/** The settings an FSRS scheduler is built from. */
export type SchedulerParams = Pick<
  Settings,
  | "requestRetention"
  | "maximumInterval"
  | "enableFuzz"
  | "enableShortTerm"
  | "learningSteps"
  | "relearningSteps"
  | "weights"
>;

/** Build an FSRS scheduler from the user's saved parameters. */
export function createScheduler(params: SchedulerParams): FSRS {
  return fsrs({
    request_retention: params.requestRetention,
    maximum_interval: params.maximumInterval,
    enable_fuzz: params.enableFuzz,
    enable_short_term: params.enableShortTerm,
    learning_steps: parseSteps(params.learningSteps),
    relearning_steps: parseSteps(params.relearningSteps),
    ...(params.weights ? { w: JSON.parse(params.weights) as number[] } : {}),
  });
}

/** DB row → ts-fsrs `Card`. */
export function toFsrsCard(row: FsrsFields): FsrsCard {
  return {
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsedDays,
    scheduled_days: row.scheduledDays,
    learning_steps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.lastReview ?? undefined,
  };
}

/** ts-fsrs `Card` → DB columns. */
export function fromFsrsCard(card: FsrsCard): FsrsFields {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ?? null,
  };
}

/** Fresh FSRS state for a brand-new review unit ready to study. */
export function newReviewUnitFields(now: Date = new Date()): FsrsFields {
  return fromFsrsCard(createEmptyCard(now));
}

/** FSRS placeholder for review units blocked by unmet prerequisites. */
export function pendingReviewUnitFields(): FsrsFields {
  return {
    due: PENDING_DUE,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    state: State.New,
    lastReview: null,
  };
}

export function isPendingSchedule(
  reviewUnit: Pick<DbReviewUnit, "due" | "lastReview" | "reps">,
): boolean {
  return (
    reviewUnit.reps === 0 &&
    reviewUnit.lastReview == null &&
    reviewUnit.due.getTime() >= PENDING_DUE.getTime()
  );
}

/** A prerequisite is secured enough to unlock dependents. */
export function isPrereqSecured(
  reviewUnit: Pick<DbReviewUnit, "state" | "stability">,
  stabilityFloor: number,
): boolean {
  return (
    reviewUnit.state === State.Review && reviewUnit.stability >= stabilityFloor
  );
}

export { State };
