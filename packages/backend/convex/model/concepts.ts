import {
  CONCEPT_BATCH_SIZE,
  CONCEPT_LOW_WATER_MARK,
  CONCEPT_SUBKEY,
  isAwaitingVariant,
  pickNextVariant,
  unseenVariantCount,
  type ConceptPoolStatus,
} from "@armin/core/concept";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail } from "./errors";
import { selectProvider } from "./generator";
import { MAX_VARIANTS_PER_CONCEPT } from "./limits";
import { bumpRevision, waitingSchedule } from "./study";
import { requireConceptCards } from "./usage";
import { reserveVariants, settleVariants, variantAllowance } from "./variantAllowance";

/*
 * A concept card's variant pool. Generation runs as a scheduled
 * action (`conceptGeneration.generate`), the only caller of the generator
 * module. Each job gets the next number in the card's `conceptPool`; only the
 * card's latest job may store variants or fail the pool, so a superseded job's
 * late result is dropped.
 */

/**
 * A job still "generating" after this long has stopped without reporting
 * back (an action timeout or a deploy mid-run). Convex actions run at most 10
 * minutes, so `concepts.expireGeneration` then fails it and releases its
 * reservation, and the card offers Retry.
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
 * allowance is reserved for a job that can't run. A library without Pro is
 * refused outright.
 */
export async function requestGeneration(
  ctx: MutationCtx,
  flashcard: Doc<"flashcards">,
  now: number,
) {
  // Generation is a Pro feature; every request (create, Retry, refill) passes here.
  requireConceptCards(await ctx.db.get(flashcard.libraryId));
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
  // An action can stop without reporting back (a timeout or a deploy
  // mid-run). The watchdog then fails the pool and releases the batch, so the
  // allowance isn't held and the card offers Retry; it does nothing once the
  // job has stored, failed, or been superseded.
  await ctx.scheduler.runAfter(GENERATION_STALL_MS, internal.concepts.expireGeneration, {
    flashcardId: flashcard._id,
    job,
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
  // Deck deletion and reviewer reset hide cards before their bounded cleanup
  // reaches them. Do not store or charge a result during that interval.
  const [deck, library] = await Promise.all([
    ctx.db.get(flashcard.deckId),
    ctx.db.get(flashcard.libraryId),
  ]);
  if (!deck || library?.status !== "active") return null;
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
 * A concept card's part of a rating, written in the rating mutation: mark the shown variant seen and assign the next one. Returns the
 * unit's new display, to patch together with its schedule and version, and
 * the shown variant's prior state for the review log, so Undo can restore
 * both. Null for any other unit. When no variant is active the unit keeps
 * showing what it showed. `pool` is the pool after the rating, for
 * `refillIfLow`.
 */
export async function advanceVariant(ctx: MutationCtx, unit: Doc<"reviewUnits">, now: number) {
  if (!unit.variantId) return null;
  const shown = await ctx.db.get(unit.variantId);
  const beforeVariant =
    shown && shown.flashcardId === unit.flashcardId
      ? { variantId: shown._id, lastShownAt: shown.lastShownAt }
      : undefined;
  if (beforeVariant) await ctx.db.patch(beforeVariant.variantId, { lastShownAt: now });
  const variants = await variantsOf(ctx, unit.flashcardId);
  const next = pickNextVariant(variants, Math.random);
  return {
    display: next ? showVariant(next) : {},
    beforeVariant,
    pool: { size: variants.length, unseen: unseenVariantCount(variants) },
  };
}

/**
 * After a rating, refill a concept card whose pool is below the low-water mark
 * with one more batch through `requestGeneration`, so the monthly allowance
 * applies. Only a `ready` pool refills, or an `allowanceUsed` one whose
 * allowance has room again: a `generating` pool already has its job (a
 * stalled one counts as failed), and a failed pool waits for Retry rather
 * than calling a failing generator on every review. Because a refill moves
 * the pool to `generating` in the rating's own transaction, and Convex
 * mutations are serializable, any later rating sees that job and schedules
 * none, however fast a session rates. A full pool doesn't refill.
 */
export async function refillIfLow(
  ctx: MutationCtx,
  flashcard: Doc<"flashcards">,
  pool: { size: number; unseen: number },
  now: number,
) {
  if (pool.unseen >= CONCEPT_LOW_WATER_MARK || pool.size >= MAX_VARIANTS_PER_CONCEPT) return;
  const status = flashcard.conceptPool?.status;
  if (status === "allowanceUsed") {
    const allowance = await variantAllowance(ctx, flashcard.libraryId, now);
    if (!poolView(flashcard, now, allowance).canRetry) return;
  } else if (status !== "ready") return;
  await requestGeneration(ctx, flashcard, now);
}

/**
 * Undo's counterpart of `advanceVariant`: give the shown variant back its
 * previous last-shown time and reassign it. When the learner has since
 * deleted or flagged that variant, Undo still restores the schedule but
 * keeps the unit on the active variant it shows now, so a removed exercise
 * never comes back; a flagged one still gets its last-shown time
 * back. Returns the display to write, or undefined to keep the current one.
 */
export async function restoreVariant(
  ctx: MutationCtx,
  unit: Doc<"reviewUnits">,
  before: NonNullable<Doc<"reviewLogs">["beforeVariant"]>,
) {
  const variant = await ctx.db.get(before.variantId);
  if (!variant || variant.flashcardId !== unit.flashcardId) return undefined;
  await ctx.db.patch(variant._id, { lastShownAt: before.lastShownAt });
  return variant.status === "active" ? showVariant(variant) : undefined;
}

/**
 * Assign a variant to a concept unit that has none yet (its first batch, or a
 * variant restored to a pool that had none active). The unit moves off the
 * pending schedule to New in the same patch, unless prerequisites still lock
 * the card. Does nothing when the unit already shows a variant.
 */
export async function assignIfAwaiting(
  ctx: MutationCtx,
  flashcard: Doc<"flashcards">,
  now: number,
) {
  const unit = await conceptUnit(ctx, flashcard._id);
  if (!unit || !isAwaitingVariant(unit)) return;
  const variant = await nextVariant(ctx, flashcard._id);
  if (!variant) return;
  await ctx.db.patch(unit._id, {
    ...showVariant(variant),
    ...waitingSchedule({ ...unit, variantId: variant._id }, flashcard.locked, now),
    version: unit.version + 1,
    updatedAt: now,
  });
}

/**
 * A learner's change to one variant (curation): `edit` replaces its
 * text, `flag` sets it aside, `unflag` returns it to selection, and `delete`
 * removes it. One transaction keeps the review in step: when the card's unit
 * shows this variant, an edit rewrites what it shows, and a flag or delete
 * assigns the next variant without rating the concept; either way the unit's
 * version is bumped, so an open review of the old text goes stale. A change
 * that leaves fewer than `CONCEPT_LOW_WATER_MARK` unseen variants refills the
 * pool, as a rating does.
 *
 * A concept card always keeps one active variant once it has one: flagging or
 * deleting the last is refused. A reviewed unit has no pending schedule to
 * fall back on, so an empty pool would leave a due card with no exercise.
 */
export async function curateVariant(
  ctx: MutationCtx,
  flashcard: Doc<"flashcards">,
  variant: Doc<"conceptVariants">,
  change:
    | { kind: "edit"; exercise: string; solution: string }
    | { kind: "flag" }
    | { kind: "unflag" }
    | { kind: "delete" },
  now: number,
) {
  requireConceptCards(await ctx.db.get(flashcard.libraryId));
  const variants = await variantsOf(ctx, flashcard._id);
  const removes = change.kind === "flag" || change.kind === "delete";
  if (
    removes &&
    variant.status === "active" &&
    !variants.some((other) => other._id !== variant._id && other.status === "active")
  ) {
    fail(
      "CONFLICT",
      "This is the card's only active variant, so reviews still need it. Edit it instead, or unflag another variant first.",
    );
  }

  let updated: Doc<"conceptVariants"> | null = null;
  if (change.kind === "delete") {
    await ctx.db.delete(variant._id);
  } else {
    const patch =
      change.kind === "edit"
        ? { exercise: change.exercise, solution: change.solution, origin: "edited" as const }
        : { status: change.kind === "flag" ? ("flagged" as const) : ("active" as const) };
    updated = { ...variant, ...patch, version: variant.version + 1, updatedAt: now };
    await ctx.db.patch(variant._id, { ...patch, version: updated.version, updatedAt: now });
  }
  const remaining = variants.flatMap((row) =>
    row._id !== variant._id ? [row] : updated ? [updated] : [],
  );

  const unit = await conceptUnit(ctx, flashcard._id);
  let unitVersion = unit?.version ?? null;
  if (unit && unit.variantId === variant._id) {
    const display = removes
      ? pickNextVariant(remaining, Math.random)
      : (updated as Doc<"conceptVariants">);
    if (display) {
      unitVersion = unit.version + 1;
      await ctx.db.patch(unit._id, {
        ...showVariant(display),
        version: unitVersion,
        updatedAt: now,
      });
    }
  } else if (unit && isAwaitingVariant(unit) && change.kind === "unflag") {
    await assignIfAwaiting(ctx, flashcard, now);
    unitVersion = (await ctx.db.get(unit._id))?.version ?? unitVersion;
  }

  if (removes) {
    await refillIfLow(
      ctx,
      flashcard,
      { size: remaining.length, unseen: unseenVariantCount(remaining) },
      now,
    );
  }
  await bumpRevision(ctx, flashcard.libraryId);
  return { variantVersion: updated?.version ?? null, unitVersion };
}
