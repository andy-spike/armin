import type { Grade } from "ts-fsrs";
import {
  fsrsFieldsFromMs,
  fsrsFieldsToMs,
  fromFsrsCard,
  isPrereqSecured,
  toFsrsCard,
} from "@armin/core/scheduler";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { owned } from "./access";
import { advanceVariant, refillIfLow } from "./concepts";
import { checkEligible } from "./queue";
import { fsrsSnapshot, refreshAfterPrereqChange, schedulerFor, SettingsCache } from "./study";

export type RateResult =
  | {
      status: "ok";
      reviewLogId: Id<"reviewLogs">;
      reviewUnitId: Id<"reviewUnits">;
      deckId: Id<"decks">;
      version: number;
      unlockedFlashcardIds: Id<"flashcards">[];
    }
  | { status: "stale"; message: string }
  | { status: "ineligible"; message: string };

export async function rateReviewUnit(
  ctx: MutationCtx,
  library: Doc<"libraries">,
  args: {
    reviewUnitId: Id<"reviewUnits">;
    rating: Grade;
    expectedVersion: number;
  },
) {
  const now = Date.now();
  const unit = await owned(ctx, library, args.reviewUnitId);
  if (!unit) {
    return { status: "stale", message: "This review unit no longer exists." } satisfies RateResult;
  }
  if (unit.version !== args.expectedVersion) {
    return {
      status: "stale",
      message: "This card changed since it was shown. Reload it to continue.",
    } satisfies RateResult;
  }
  const ineligible = await checkEligible(unit, library, now);
  if (ineligible) return { status: "ineligible", message: ineligible } satisfies RateResult;

  const settings = new SettingsCache(ctx, library._id);
  const deckSettings = await settings.forDeck(unit.deckId);
  const scheduler = schedulerFor(deckSettings);
  const { card: next, log } = scheduler.next(
    toFsrsCard(fsrsFieldsFromMs(unit)),
    new Date(now),
    args.rating,
  );
  const version = unit.version + 1;
  const fields = fsrsFieldsToMs(fromFsrsCard(next));
  const concept = await advanceVariant(ctx, unit, now);
  await ctx.db.patch(unit._id, {
    ...fields,
    ...concept?.display,
    version,
    updatedAt: now,
  });
  const flashcard = await ctx.db.get(unit.flashcardId);
  if (flashcard && !flashcard.prerequisiteAccessGranted) {
    await ctx.db.patch(flashcard._id, { prerequisiteAccessGranted: true });
  }
  if (flashcard && concept) await refillIfLow(ctx, flashcard, concept.pool, now);
  const reviewLogId = await ctx.db.insert("reviewLogs", {
    libraryId: library._id,
    deckId: unit.deckId,
    flashcardId: unit.flashcardId,
    reviewUnitId: unit._id,
    rating: log.rating,
    state: log.state,
    due: log.due.getTime(),
    stability: log.stability,
    difficulty: log.difficulty,
    elapsedDays: log.elapsed_days,
    lastElapsedDays: log.last_elapsed_days,
    scheduledDays: log.scheduled_days,
    learningSteps: log.learning_steps,
    review: log.review.getTime(),
    before: fsrsSnapshot(unit),
    ...(concept?.beforeVariant ? { beforeVariant: concept.beforeVariant } : {}),
    unitVersionAfter: version,
  });
  const floor = deckSettings.prereqStabilityFloor;
  const unlockedFlashcardIds =
    isPrereqSecured(unit, floor) !== isPrereqSecured(fields, floor)
      ? await refreshAfterPrereqChange(ctx, unit.flashcardId, settings, now)
      : [];

  return {
    status: "ok",
    reviewLogId,
    reviewUnitId: unit._id,
    deckId: unit.deckId,
    version,
    unlockedFlashcardIds,
  } satisfies RateResult;
}
