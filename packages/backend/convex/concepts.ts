import { v } from "convex/values";
import { conceptVariantSchema, type ConceptContent } from "@armin/core/flashcard-types";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import { internalMutation, mutation } from "./functions";
import { owned, ownedOrFail, readableLibrary, writableLibrary } from "./model/access";
import {
  assignIfAwaiting,
  conceptUnit,
  curateVariant,
  poolView,
  requestGeneration,
  runningJob,
  variantsOf,
} from "./model/concepts";
import { fail } from "./model/errors";
import { selectProvider } from "./model/generator";
import { conceptCardsAllowed, requireConceptCards } from "./model/usage";
import { MAX_VARIANTS_PER_CONCEPT } from "./model/limits";
import { settleVariants, variantAllowance } from "./model/variantAllowance";
import { variantReservation } from "./schema";
import { bumpRevision, parseFlashcard } from "./model/study";

/*
 * Concept card variant pools (ADR 0023). The card editor reads a card's pool
 * and offers Retry; the generation action reads its input and reports back
 * through the internal functions here.
 */

/** Exercises a generation job is told to avoid: the pool's most recent ones. */
const AVOID_LIMIT = 50;

/** A concept card's pool state and variants, for the card editor's variants panel. */
export const pool = query({
  args: { flashcardId: v.string() },
  handler: async (ctx, { flashcardId }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const id = ctx.db.normalizeId("flashcards", flashcardId);
    const flashcard = id ? await owned(ctx, library, id) : null;
    if (!flashcard || flashcard.type !== "concept") return null;
    const now = Date.now();
    const [variants, allowance, unit] = await Promise.all([
      variantsOf(ctx, flashcard._id),
      variantAllowance(ctx, library._id, now),
      conceptUnit(ctx, flashcard._id),
    ]);
    // Outside Pro the card keeps its pool, but nothing generates until Pro returns.
    const requiresPro = !conceptCardsAllowed(library);
    const view = poolView(flashcard, now, allowance);
    return {
      ...view,
      canRetry: view.canRetry && !requiresPro,
      requiresPro,
      /** The variant the card's next review shows. */
      assignedVariantId: unit?.variantId ?? null,
      variants: variants.map((variant) => ({
        id: variant._id,
        exercise: variant.exercise,
        solution: variant.solution,
        status: variant.status,
        origin: variant.origin,
        version: variant.version,
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

export type EditVariantResult =
  | { status: "ok"; version: number }
  | { status: "conflict"; version: number; message: string };

/**
 * Save a learner's edit of a variant's exercise and solution, made against
 * `expectedVersion`. The first accepted edit wins: a later save from an older
 * version returns a conflict and changes nothing. The text is checked against
 * the variant schema (text and KaTeX, no images or audio). When the card's
 * review shows this variant, it shows the edit, under a new unit version.
 */
export const editVariant = mutation({
  args: {
    variantId: v.id("conceptVariants"),
    expectedVersion: v.number(),
    exercise: v.string(),
    solution: v.string(),
  },
  handler: async (ctx, args): Promise<EditVariantResult> => {
    const library = await writableLibrary(ctx);
    const { flashcard, variant } = await ownedVariant(ctx, library, args.variantId);
    requireConceptCards(library);
    if (variant.version !== args.expectedVersion) {
      return {
        status: "conflict",
        version: variant.version,
        message: "This variant was changed elsewhere after you started editing it.",
      };
    }
    const parsed = conceptVariantSchema.safeParse({
      exercise: args.exercise,
      solution: args.solution,
    });
    if (!parsed.success) fail("INVALID", parsed.error.issues[0]?.message ?? "Invalid variant.");
    const { variantVersion } = await curateVariant(
      ctx,
      flashcard,
      variant,
      { kind: "edit", ...parsed.data },
      Date.now(),
    );
    return { status: "ok", version: variantVersion! };
  },
});

/**
 * Delete a variant so no review shows it again. When the card's review
 * shows it, the next variant is assigned without rating the concept. The
 * card's only active variant can't be deleted.
 */
export const deleteVariant = mutation({
  args: { variantId: v.id("conceptVariants") },
  handler: async (ctx, { variantId }) => {
    const library = await writableLibrary(ctx);
    const { flashcard, variant } = await ownedVariant(ctx, library, variantId);
    requireConceptCards(library);
    await curateVariant(ctx, flashcard, variant, { kind: "delete" }, Date.now());
    return null;
  },
});

/** Return a flagged variant to selection. Does nothing for an active one. */
export const unflagVariant = mutation({
  args: { variantId: v.id("conceptVariants") },
  handler: async (ctx, { variantId }) => {
    const library = await writableLibrary(ctx);
    const { flashcard, variant } = await ownedVariant(ctx, library, variantId);
    requireConceptCards(library);
    if (variant.status === "active") return null;
    await curateVariant(ctx, flashcard, variant, { kind: "unflag" }, Date.now());
    return null;
  },
});

export type FlagShownResult =
  | { status: "ok"; version: number }
  | { status: "stale"; message: string };

/**
 * Flag the variant a review is showing as wrong or confusing, from the review
 * itself. `expectedVersion` is the unit version on screen, so the flag lands
 * on the exercise the learner saw. The variant is set aside and the next one
 * is assigned without rating the concept; the result is the unit's new
 * version, which shows that next variant.
 */
export const flagShownVariant = mutation({
  args: { reviewUnitId: v.id("reviewUnits"), expectedVersion: v.number() },
  handler: async (ctx, args): Promise<FlagShownResult> => {
    const library = await writableLibrary(ctx);
    const unit = await owned(ctx, library, args.reviewUnitId);
    if (!unit) return { status: "stale", message: "This review unit no longer exists." };
    if (unit.version !== args.expectedVersion) {
      return {
        status: "stale",
        message: "This card changed since it was shown. Reload it to continue.",
      };
    }
    const variant = unit.variantId ? await ctx.db.get(unit.variantId) : null;
    if (!variant || variant.flashcardId !== unit.flashcardId) {
      fail("INVALID", "Only a concept card's exercise can be flagged.");
    }
    const flashcard = await ownedOrFail(ctx, library, unit.flashcardId, "Flashcard");
    requireConceptCards(library);
    const { unitVersion } = await curateVariant(
      ctx,
      flashcard,
      variant,
      { kind: "flag" },
      Date.now(),
    );
    return { status: "ok", version: unitVersion ?? unit.version };
  },
});

/** A variant of a concept card in the caller's library, with its card; otherwise NOT_FOUND. */
async function ownedVariant(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  variantId: Id<"conceptVariants">,
) {
  const variant = await ctx.db.get(variantId);
  const flashcard =
    variant && variant.libraryId === library._id
      ? await owned(ctx, library, variant.flashcardId)
      : null;
  if (!variant || !flashcard || flashcard.type !== "concept")
    fail("NOT_FOUND", "Variant not found.");
  return { flashcard, variant };
}

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
  handler: async (ctx, { flashcardId, job, variants }) => {
    const flashcard = await runningJob(ctx, flashcardId, job);
    if (!flashcard) return { stored: 0 };
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
    await assignIfAwaiting(ctx, flashcard, now);
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
  handler: async (ctx, { flashcardId, job, reason }) => {
    const flashcard = await runningJob(ctx, flashcardId, job);
    if (!flashcard) return;
    const { requestedAt, reserved: held } = flashcard.conceptPool!;
    await settleVariants(ctx, held, 0);
    await ctx.db.patch(flashcardId, {
      conceptPool: { job, requestedAt, status: "failed", reason },
    });
  },
});

/**
 * The watchdog `requestGeneration` schedules with each job: a job still
 * running after `GENERATION_STALL_MS` stopped without reporting back, so its
 * pool fails with Retry and its reservation is released. Should the action
 * report later after all, `runningJob` no longer matches and its result is
 * dropped, so the batch is never charged twice.
 */
export const expireGeneration = internalMutation({
  args: { flashcardId: v.id("flashcards"), job: v.number() },
  handler: async (ctx, { flashcardId, job }) => {
    const flashcard = await runningJob(ctx, flashcardId, job);
    if (!flashcard) return;
    const { requestedAt, reserved } = flashcard.conceptPool!;
    await settleVariants(ctx, reserved, 0);
    await ctx.db.patch(flashcardId, {
      conceptPool: {
        job,
        requestedAt,
        status: "failed",
        reason: "Generating variants took too long.",
      },
    });
  },
});
