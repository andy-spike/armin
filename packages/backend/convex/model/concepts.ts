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

export const GENERATION_STALL_MS = 10 * 60_000;

export async function requestGeneration(
  ctx: MutationCtx,
  flashcard: Doc<"flashcards">,
  now: number,
) {
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
  await ctx.scheduler.runAfter(GENERATION_STALL_MS, internal.concepts.expireGeneration, {
    flashcardId: flashcard._id,
    job,
  });
}

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

export function variantsOf(ctx: QueryCtx, flashcardId: Id<"flashcards">) {
  return ctx.db
    .query("conceptVariants")
    .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcardId))
    .take(MAX_VARIANTS_PER_CONCEPT);
}

export async function runningJob(ctx: QueryCtx, flashcardId: Id<"flashcards">, job: number) {
  const flashcard = await ctx.db.get(flashcardId);
  if (
    !flashcard ||
    flashcard.type !== "concept" ||
    flashcard.conceptPool?.job !== job ||
    flashcard.conceptPool.status !== "generating"
  )
    return null;
  const [deck, library] = await Promise.all([
    ctx.db.get(flashcard.deckId),
    ctx.db.get(flashcard.libraryId),
  ]);
  if (!deck || library?.status !== "active") return null;
  return flashcard;
}

export async function conceptUnit(ctx: QueryCtx, flashcardId: Id<"flashcards">) {
  const units = await ctx.db
    .query("reviewUnits")
    .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcardId))
    .collect();
  return units.find((unit) => unit.subKey === CONCEPT_SUBKEY) ?? null;
}

export function showVariant(variant: Doc<"conceptVariants">) {
  return { variantId: variant._id, front: variant.exercise, back: variant.solution };
}

export async function nextVariant(ctx: QueryCtx, flashcardId: Id<"flashcards">) {
  return pickNextVariant(await variantsOf(ctx, flashcardId), Math.random);
}

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
