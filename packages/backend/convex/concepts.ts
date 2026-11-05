import { v } from "convex/values";
import { isAwaitingVariant } from "@armin/core/concept";
import { conceptVariantSchema, type ConceptContent } from "@armin/core/flashcard-types";
import type { Id } from "./_generated/dataModel";
import { internalQuery, query, type MutationCtx } from "./_generated/server";
import { internalMutation, mutation } from "./functions";
import { owned, ownedOrFail, readableLibrary, writableLibrary } from "./model/access";
import {
  conceptUnit,
  nextVariant,
  poolView,
  requestGeneration,
  runningJob,
  showVariant,
  variantsOf,
} from "./model/concepts";
import { fail } from "./model/errors";
import { selectProvider } from "./model/generator";
import { conceptCardsAllowed, requireConceptCards } from "./model/usage";
import { MAX_VARIANTS_PER_CONCEPT } from "./model/limits";
import {
  settleVariants,
  variantAllowance,
  type VariantReservation,
} from "./model/variantAllowance";
import { variantReservation } from "./schema";
import { bumpRevision, parseFlashcard, waitingSchedule } from "./model/study";

/*
 * Concept card variant pools (ADR 0023). The card editor reads a card's pool
 * and offers Retry; the generation action reads its input and reports back
 * through the internal functions here.
 */

/** Exercises a generation job is told to avoid: the pool's most recent ones. */
const AVOID_LIMIT = 50;

/** A concept card's pool state and variants, for the card editor's read-only panel. */
export const pool = query({
  args: { flashcardId: v.string() },
  handler: async (ctx, { flashcardId }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const id = ctx.db.normalizeId("flashcards", flashcardId);
    const flashcard = id ? await owned(ctx, library, id) : null;
    if (!flashcard || flashcard.type !== "concept") return null;
    const now = Date.now();
    const [variants, allowance] = await Promise.all([
      variantsOf(ctx, flashcard._id),
      variantAllowance(ctx, library._id, now),
    ]);
    // Outside Pro the card keeps its pool, but nothing generates until Pro returns.
    const requiresPro = !conceptCardsAllowed(library);
    const view = poolView(flashcard, now, allowance);
    return {
      ...view,
      canRetry: view.canRetry && !requiresPro,
      requiresPro,
      variants: variants.map((variant) => ({
        id: variant._id,
        exercise: variant.exercise,
        solution: variant.solution,
        status: variant.status,
        origin: variant.origin,
        lastShownAt: variant.lastShownAt ?? null,
        createdAt: variant.createdAt,
      })),
    };
  },
});

/**
 * Whether this deployment can generate variants, so the card editor can offer
 * the Concept type or explain why not. A deployment setting: it needs no
 * session and is the same for every account.
 */
export const availability = query({
  args: {},
  handler: async () => {
    const { unavailable } = selectProvider();
    return { available: unavailable === null, reason: unavailable };
  },
});

/**
 * This month's concept card variant allowance, for the account page. Null
 * when signed out or on a self-hosted instance, which has no allowance.
 */
export const allowance = query({
  args: {},
  handler: async (ctx) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const allowance = await variantAllowance(ctx, library._id, Date.now());
    if (!allowance) return null;
    const { plan, used, reserved, limit, resetsAt } = allowance;
    return { plan, used, reserved, limit, resetsAt };
  },
});

/**
 * Run generation again after a failed (or stalled) job, or after the monthly
 * allowance has room again. Does nothing while a job runs.
 */
export const retryGeneration = mutation({
  args: { flashcardId: v.id("flashcards") },
  handler: async (ctx, { flashcardId }) => {
    const library = await writableLibrary(ctx);
    const flashcard = await ownedOrFail(ctx, library, flashcardId, "Flashcard");
    if (flashcard.type !== "concept") fail("INVALID", "Only concept cards generate variants.");
    requireConceptCards(library);
    const now = Date.now();
    const allowance = await variantAllowance(ctx, library._id, now);
    if (!poolView(flashcard, now, allowance).canRetry) return { started: false };
    await requestGeneration(ctx, flashcard, now);
    return { started: true };
  },
});

/** The template and recent exercises for a job, or null when the job is no longer current. */
export const generationInput = internalQuery({
  args: { flashcardId: v.id("flashcards"), job: v.number() },
  handler: async (ctx, { flashcardId, job }) => {
    const flashcard = await runningJob(ctx, flashcardId, job);
    if (!flashcard) return null;
    const pooled = await variantsOf(ctx, flashcardId);
    return {
      template: parseFlashcard(flashcard).content as ConceptContent,
      avoid: pooled.slice(-AVOID_LIMIT).map((variant) => variant.exercise),
      room: MAX_VARIANTS_PER_CONCEPT - pooled.length,
    };
  },
});

const variantInput = v.object({ exercise: v.string(), solution: v.string() });

/**
 * Store a job's variants and mark the pool ready. Each variant is checked
 * against the core schema again at this storage boundary; a batch with none
 * left fails the pool instead. When the card's unit has no variant yet, the
 * batch assigns one, which moves the unit off the pending schedule to New in
 * the same patch unless prerequisites still lock the card.
 */
export const storeVariants = internalMutation({
  args: {
    flashcardId: v.id("flashcards"),
    job: v.number(),
    reserved: v.optional(variantReservation),
    variants: v.array(variantInput),
  },
  handler: async (ctx, { flashcardId, job, reserved, variants }) => {
    const flashcard = await runningJob(ctx, flashcardId, job);
    if (!flashcard) {
      await releaseOrphaned(ctx, flashcardId, reserved);
      return { stored: 0 };
    }
    const held = flashcard.conceptPool!.reserved;
    const room = MAX_VARIANTS_PER_CONCEPT - (await variantsOf(ctx, flashcardId)).length;
    const valid = variants
      .filter((variant) => conceptVariantSchema.safeParse(variant).success)
      .slice(0, Math.max(0, Math.min(room, held?.count ?? room)));
    const now = Date.now();
    // Charge what is stored here, in the same transaction as the variants.
    await settleVariants(ctx, held, valid.length);
    if (valid.length === 0) {
      await ctx.db.patch(flashcardId, {
        conceptPool: {
          job,
          requestedAt: flashcard.conceptPool!.requestedAt,
          status: "failed",
          reason: "The generator returned no usable exercises.",
        },
      });
      return { stored: 0 };
    }
    for (const variant of valid) {
      await ctx.db.insert("conceptVariants", {
        libraryId: flashcard.libraryId,
        flashcardId,
        exercise: variant.exercise,
        solution: variant.solution,
        status: "active",
        origin: "generated",
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.patch(flashcardId, {
      conceptPool: { job, status: "ready", requestedAt: flashcard.conceptPool!.requestedAt },
    });
    const unit = await conceptUnit(ctx, flashcardId);
    if (unit && isAwaitingVariant(unit)) {
      const variant = await nextVariant(ctx, flashcardId);
      if (variant) {
        await ctx.db.patch(unit._id, {
          ...showVariant(variant),
          ...waitingSchedule({ ...unit, variantId: variant._id }, flashcard.locked, now),
          version: unit.version + 1,
          updatedAt: now,
        });
      }
    }
    await bumpRevision(ctx, flashcard.libraryId);
    return { stored: valid.length };
  },
});

/** Record why a job failed and release its reservation; the card offers Retry. */
export const failGeneration = internalMutation({
  args: {
    flashcardId: v.id("flashcards"),
    job: v.number(),
    reserved: v.optional(variantReservation),
    reason: v.string(),
  },
  handler: async (ctx, { flashcardId, job, reserved, reason }) => {
    const flashcard = await runningJob(ctx, flashcardId, job);
    if (!flashcard) {
      await releaseOrphaned(ctx, flashcardId, reserved);
      return;
    }
    const { requestedAt, reserved: held } = flashcard.conceptPool!;
    await settleVariants(ctx, held, 0);
    await ctx.db.patch(flashcardId, {
      conceptPool: { job, requestedAt, status: "failed", reason },
    });
  },
});

/**
 * A job that finds its card deleted still holds its reservation; nothing else
 * can release it. A superseded job's reservation was already released by the
 * request that replaced it, so a card that still exists releases nothing.
 */
async function releaseOrphaned(
  ctx: MutationCtx,
  flashcardId: Id<"flashcards">,
  reserved: VariantReservation,
) {
  if (reserved && !(await ctx.db.get(flashcardId))) await settleVariants(ctx, reserved, 0);
}
