import {
  createEmptyCard,
  fsrs,
  State,
  type Card as FsrsCard,
  type FSRS,
  type Steps,
} from "ts-fsrs";

/** Review units awaiting prerequisite unlock use a far-future due date. */
export const PENDING_DUE = new Date("2099-01-01T00:00:00.000Z");

/**
 * The FSRS scheduling state a review unit holds. This mirrors the persisted
 * review-unit columns structurally without depending on any database schema,
 * so every persistence layer (SQLite, Convex) can map to it.
 */
export type FsrsFields = {
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: Date | null;
};

/**
 * Transport-safe FSRS state: identical to {@link FsrsFields} with timestamps as
 * epoch milliseconds. Convex documents and API values use this shape; `Date`
 * objects only exist inside the scheduling algorithm boundary.
 */
export type FsrsFieldsMs = Omit<FsrsFields, "due" | "lastReview"> & {
  due: number;
  lastReview: number | null;
};

function parseSteps(csv: string): Steps {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as Steps;
}

/** The settings an FSRS scheduler is built from. */
export type SchedulerParams = {
  requestRetention: number;
  maximumInterval: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  learningSteps: string;
  relearningSteps: string;
  /** JSON array of FSRS weights; null = library defaults. */
  weights: string | null;
};

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

export function isPendingSchedule(reviewUnit: {
  due: Date | number;
  lastReview: Date | number | null;
  reps: number;
}): boolean {
  const due = typeof reviewUnit.due === "number" ? reviewUnit.due : reviewUnit.due.getTime();
  return reviewUnit.reps === 0 && reviewUnit.lastReview == null && due >= PENDING_DUE.getTime();
}

/** Epoch-millisecond FSRS state → `Date`-based fields. */
export function fsrsFieldsFromMs(row: FsrsFieldsMs): FsrsFields {
  return {
    ...row,
    due: new Date(row.due),
    lastReview: row.lastReview == null ? null : new Date(row.lastReview),
  };
}

/** `Date`-based FSRS fields → epoch-millisecond state. */
export function fsrsFieldsToMs(row: FsrsFields): FsrsFieldsMs {
  return {
    due: row.due.getTime(),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsedDays,
    scheduledDays: row.scheduledDays,
    learningSteps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    lastReview: row.lastReview == null ? null : row.lastReview.getTime(),
  };
}

/** Pick only the FSRS columns from a wider record. */
export function pickFsrsFieldsMs(row: FsrsFieldsMs): FsrsFieldsMs {
  return {
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsedDays,
    scheduledDays: row.scheduledDays,
    learningSteps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    lastReview: row.lastReview,
  };
}

/** A prerequisite is secured enough to unlock dependents. */
export function isPrereqSecured(
  reviewUnit: { state: number; stability: number },
  stabilityFloor: number,
): boolean {
  return reviewUnit.state === State.Review && reviewUnit.stability >= stabilityFloor;
}

export { State };
