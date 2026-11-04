import {
  CONCEPT_BATCH_SIZE,
  CONCEPT_SUBKEY,
  pickNextVariant,
  type ConceptPoolStatus,
} from "@armin/core/concept";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { selectProvider } from "./generator";
import { MAX_VARIANTS_PER_CONCEPT } from "./limits";
import { reserveVariants, settleVariants } from "./variantAllowance";

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

/**
 * Start the card's next generation job and mark its pool as generating. The
 * job's batch is reserved from the monthly variant allowance here, in the
 * mutation, before the action can call the model; a superseded job's
 * reservation is released first. With no allowance left, no job is scheduled
 * and the pool shows that the allowance is used, until a later request (Retry,
 * or a refill) finds room again in a new month or on a larger plan. When the
 * deployment has no generator, the pool fails with that reason instead, so no
 * allowance is reserved for a job that can't run.
 */
export async function requestGeneration(
  ctx: MutationCtx,
  flashcard: Doc<"flashcards">,
  now: number,
) {
  const previous = flashcard.conceptPool;
  if (previous?.status === "generating") await settleVariants(ctx, previous.reserved, 0);
  const job = (previous?.job ?? 0) + 1;
  const { unavailable } = selectProvider();
  if (unavailable) {
    await ctx.db.patch(flashcard._id, {
      conceptPool: { status: "failed", job, requestedAt: now, reason: unavailable },
    });
    return;
  }
  const room = MAX_VARIANTS_PER_CONCEPT - (await variantsOf(ctx, flashcard._id)).length;
  if (room <= 0) {
    await ctx.db.patch(flashcard._id, {
      conceptPool: {
        status: "failed",
        job,
        requestedAt: now,
        reason: "This card already keeps as many variants as it can.",
      },
    });
    return;
  }
  const { count, reservation } = await reserveVariants(
    ctx,
    flashcard.libraryId,
    Math.min(CONCEPT_BATCH_SIZE, room),
    now,
  );
  if (count === 0) {
    await ctx.db.patch(flashcard._id, {
      conceptPool: { status: "allowanceUsed", job, requestedAt: now },
    });
    return;
  }
  await ctx.db.patch(flashcard._id, {
    conceptPool: { status: "generating", job, requestedAt: now, reserved: reservation },
  });
  await ctx.scheduler.runAfter(0, internal.conceptGeneration.generate, {
    flashcardId: flashcard._id,
    job,
    count,
    reserved: reservation,
  });
}

/**
 * The pool's state as the card editor shows it, with whether Retry applies.
 * `allowance` is the library's current month (null where none applies): a
 * pool stopped by the allowance offers Retry again once it has room.
 */
export function poolView(
  flashcard: Doc<"flashcards">,
  now: number,
  allowance: { remaining: number; limit: number; resetsAt: number } | null,
) {
  const pool = flashcard.conceptPool;
  if (pool?.status === "allowanceUsed")
    return {
      status: "allowanceUsed" as const,
      reason: null,
      canRetry: !allowance || allowance.remaining > 0,
      allowance: allowance && { limit: allowance.limit, resetsAt: allowance.resetsAt },
    };
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
    allowance: null,
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

/** A concept card's one review unit, by its fixed subKey. */
export async function conceptUnit(ctx: QueryCtx, flashcardId: Id<"flashcards">) {
  const units = await ctx.db
    .query("reviewUnits")
    .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcardId))
    .collect();
  return units.find((unit) => unit.subKey === CONCEPT_SUBKEY) ?? null;
}

/**
 * The display half of assigning a variant: the unit's front and back become
 * the variant's exercise and solution. Callers write it in the same patch as
 * the version bump, so an open review of the previous variant goes stale.
 */
export function showVariant(variant: Doc<"conceptVariants">) {
  return { variantId: variant._id, front: variant.exercise, back: variant.solution };
}

/**
 * Pick the variant a concept unit shows next (`pickNextVariant`). Inside a
 * mutation Convex seeds `Math.random` per mutation, so the choice is
 * deterministic for a given transaction yet varies between reviews; that is
 * all a varied exercise needs.
 */
export async function nextVariant(ctx: QueryCtx, flashcardId: Id<"flashcards">) {
  return pickNextVariant(await variantsOf(ctx, flashcardId), Math.random);
}

/**
 * A concept card's part of a rating, written in the rating mutation (ADR
 * 0023): mark the shown variant seen and assign the next one. Returns the
 * unit's new display, to patch together with its schedule and version, and
 * the shown variant's prior state for the review log, so Undo can restore
 * both. Null for any other unit. When no variant is active the unit keeps
 * showing what it showed.
 */
export async function advanceVariant(ctx: MutationCtx, unit: Doc<"reviewUnits">, now: number) {
  if (!unit.variantId) return null;
  const shown = await ctx.db.get(unit.variantId);
  const beforeVariant =
    shown && shown.flashcardId === unit.flashcardId
      ? { variantId: shown._id, lastShownAt: shown.lastShownAt }
      : undefined;
  if (beforeVariant) await ctx.db.patch(beforeVariant.variantId, { lastShownAt: now });
  const next = await nextVariant(ctx, unit.flashcardId);
  return { display: next ? showVariant(next) : {}, beforeVariant };
}

/**
 * Undo's counterpart of `advanceVariant`: give the shown variant back its
 * previous last-shown time and reassign it. Null when that variant was
 * deleted or set aside since, so the review can no longer be undone exactly.
 */
export async function restoreVariant(
  ctx: MutationCtx,
  unit: Doc<"reviewUnits">,
  before: NonNullable<Doc<"reviewLogs">["beforeVariant"]>,
) {
  const variant = await ctx.db.get(before.variantId);
  if (!variant || variant.flashcardId !== unit.flashcardId || variant.status !== "active")
    return null;
  await ctx.db.patch(variant._id, { lastShownAt: before.lastShownAt });
  return showVariant(variant);
}
