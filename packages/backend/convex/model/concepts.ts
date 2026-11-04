import type { ConceptPoolStatus } from "@armin/core/concept";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { MAX_VARIANTS_PER_CONCEPT } from "./limits";

/*
 * A concept card's variant pool (ADR 0023). Generation runs as a scheduled
 * action (`conceptGeneration.generate`), the only caller of the generator
 * module. Each job gets the next number in the card's `conceptPool`; only the
 * card's latest job may store variants or fail the pool, so a superseded job's
 * late result is dropped.
 */

/**
 * A job still "generating" after this long has stopped without reporting
 * back (an action timeout or a deploy mid-run), so it can be retried.
 */
export const GENERATION_STALL_MS = 10 * 60_000;

/** Start the card's next generation job and mark its pool as generating. */
export async function requestGeneration(
  ctx: MutationCtx,
  flashcard: Doc<"flashcards">,
  now: number,
) {
  const job = (flashcard.conceptPool?.job ?? 0) + 1;
  await ctx.db.patch(flashcard._id, {
    conceptPool: { status: "generating", job, requestedAt: now },
  });
  await ctx.scheduler.runAfter(0, internal.conceptGeneration.generate, {
    flashcardId: flashcard._id,
    job,
  });
}

/** The pool's state as the card editor shows it, with whether Retry applies. */
export function poolView(flashcard: Doc<"flashcards">, now: number) {
  const pool = flashcard.conceptPool;
  const status: ConceptPoolStatus = pool?.status ?? "failed";
  const stalled = pool?.status === "generating" && now - pool.requestedAt > GENERATION_STALL_MS;
  return {
    status: stalled ? ("failed" as const) : status,
    reason: stalled
      ? "Generating variants took too long."
      : pool
        ? (pool.reason ?? null)
        : "Variants have not been generated yet.",
    canRetry: status === "failed" || stalled,
  };
}

/** The card's variants, oldest first, within the per-card bound. */
export function variantsOf(ctx: QueryCtx, flashcardId: Id<"flashcards">) {
  return ctx.db
    .query("conceptVariants")
    .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcardId))
    .take(MAX_VARIANTS_PER_CONCEPT);
}

/** The card's latest job, if it is still running; null when it was superseded. */
export async function runningJob(ctx: QueryCtx, flashcardId: Id<"flashcards">, job: number) {
  const flashcard = await ctx.db.get(flashcardId);
  if (
    !flashcard ||
    flashcard.type !== "concept" ||
    flashcard.conceptPool?.job !== job ||
    flashcard.conceptPool.status !== "generating"
  )
    return null;
  return flashcard;
}
