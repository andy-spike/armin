import { createEmptyCard, State, type Grade } from "ts-fsrs";
import { createScheduler, fromFsrsCard, fsrsFieldsToMs, newReviewUnitFields } from "../scheduler";
import { PRESET_VALUES } from "../scheduling-presets";
import type { AnkiCard, AnkiReview, ImportReviewLog, ImportReviewUnit } from "./types";

/**
 * Anki scheduling → Armin FSRS state. Review history is replayed through FSRS
 * (default "balanced" preset, no fuzz so the result is deterministic); Anki's
 * own due date, state, and FSRS memory state (when present) then override the
 * replayed result, so the imported card is due exactly when Anki says.
 */

const DAY_MS = 86_400_000;

const scheduler = createScheduler({
  ...PRESET_VALUES.balanced,
  enableFuzz: false,
  weights: null,
});

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Anki ease (permille) → FSRS difficulty 1–10, with the default 250% at 5. */
function difficultyFromEase(factor: number) {
  if (!factor) return 5;
  const ease = clamp(factor, 1300, 3500);
  return ease >= 2500 ? 5 - ((ease - 2500) / 1000) * 4 : 5 + ((2500 - ease) / 1200) * 5;
}

function memoryState(data: string) {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as { s?: unknown; d?: unknown };
    if (typeof parsed.s === "number" && typeof parsed.d === "number" && parsed.s > 0) {
      return { stability: parsed.s, difficulty: clamp(parsed.d, 1, 10) };
    }
  } catch {
    // `cards.data` is optional and sometimes not JSON.
  }
  return null;
}

/** When Anki says the card is due, epoch ms. */
export function ankiDueMs(card: AnkiCard, createdAt: number) {
  // The queue decides the unit: (re)learning and preview cards due in minutes
  // (queues 1 and 4) carry epoch seconds; day-learning (queue 3) and review
  // cards carry days since the collection was created. Suspended and buried
  // cards keep the due of the queue they left, so fall back to its magnitude.
  const inSeconds =
    card.queue === 1 ||
    card.queue === 4 ||
    (card.queue < 0 && (card.type === 1 || card.type === 3) && card.due > 1_000_000_000);
  return inSeconds ? card.due * 1000 : (createdAt + card.due * 86_400) * 1000;
}

type Replay = { state: ReturnType<typeof fromFsrsCard>; logs: ImportReviewLog[] };

function replay(reviews: AnkiReview[]): Replay | null {
  const usable = reviews
    .filter(
      (review) => review.ease >= 1 && review.ease <= 4 && review.type !== 4 && review.type !== 5,
    )
    .sort((a, b) => a.id - b.id);
  if (usable.length === 0) return null;
  const logs: ImportReviewLog[] = [];
  try {
    let card = createEmptyCard(new Date(usable[0].id));
    for (const review of usable) {
      const before = fromFsrsCard(card);
      const next = scheduler.next(card, new Date(review.id), review.ease as Grade).card;
      logs.push({
        rating: review.ease,
        review: review.id,
        before: fsrsFieldsToMs(before),
        after: fsrsFieldsToMs(fromFsrsCard(next)),
      });
      card = next;
    }
    return { state: fromFsrsCard(card), logs };
  } catch {
    // Out-of-order or malformed history: fall back to Anki's own numbers.
    return null;
  }
}

/** The Armin schedule and review log for one Anki card. */
export function scheduleCard(
  card: AnkiCard,
  reviews: AnkiReview[],
  createdAt: number,
): Pick<ImportReviewUnit, "schedule" | "logs"> {
  if (card.type === 0 || card.type > 3) return { schedule: null, logs: [] };
  // A due date we can't read would fail the whole import; start the card fresh instead.
  if (!Number.isFinite(new Date(ankiDueMs(card, createdAt)).getTime()))
    return { schedule: null, logs: [] };

  const history = replay(reviews);
  const memory = memoryState(card.data);
  const due = ankiDueMs(card, createdAt);
  const state =
    card.type === 1 ? State.Learning : card.type === 3 ? State.Relearning : State.Review;
  const intervalDays = card.ivl > 0 ? card.ivl : 0;
  const lastReview =
    history?.logs[history.logs.length - 1].review ??
    (card.type === 2 || card.type === 3 ? due - Math.max(intervalDays, 1) * DAY_MS : null);

  const base = history
    ? history.state
    : {
        ...newReviewUnitFields(new Date(due)),
        stability: Math.max(intervalDays, 0.1),
        difficulty: difficultyFromEase(card.factor),
      };

  const schedule = {
    ...base,
    state,
    due: new Date(due),
    stability: memory?.stability ?? base.stability,
    difficulty: memory?.difficulty ?? base.difficulty,
    scheduledDays: intervalDays,
    reps: card.reps,
    lapses: card.lapses,
    learningSteps: history && history.state.state === state ? history.state.learningSteps : 0,
    lastReview: lastReview === null ? null : new Date(lastReview),
  };
  return {
    schedule: fsrsFieldsToMs(schedule),
    logs: history?.logs ?? [],
  };
}
