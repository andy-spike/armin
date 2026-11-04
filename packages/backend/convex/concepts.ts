import { v } from "convex/values";
import { conceptVariantSchema, type ConceptContent } from "@armin/core/flashcard-types";
import { internalQuery, query } from "./_generated/server";
import { internalMutation, mutation } from "./functions";
import { owned, ownedOrFail, readableLibrary, writableLibrary } from "./model/access";
import { poolView, requestGeneration, runningJob, variantsOf } from "./model/concepts";
import { fail } from "./model/errors";
import { MAX_VARIANTS_PER_CONCEPT } from "./model/limits";
import { bumpRevision, parseFlashcard } from "./model/study";

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
    const variants = await variantsOf(ctx, flashcard._id);
    return {
      ...poolView(flashcard, Date.now()),
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

/** Run generation again after a failed (or stalled) job. Does nothing while a job runs. */
export const retryGeneration = mutation({
  args: { flashcardId: v.id("flashcards") },
  handler: async (ctx, { flashcardId }) => {
    const library = await writableLibrary(ctx);
    const flashcard = await ownedOrFail(ctx, library, flashcardId, "Flashcard");
    if (flashcard.type !== "concept") fail("INVALID", "Only concept cards generate variants.");
    const now = Date.now();
    if (!poolView(flashcard, now).canRetry) return { started: false };
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
 * left fails the pool instead.
 */
export const storeVariants = internalMutation({
  args: { flashcardId: v.id("flashcards"), job: v.number(), variants: v.array(variantInput) },
  handler: async (ctx, { flashcardId, job, variants }) => {
    const flashcard = await runningJob(ctx, flashcardId, job);
    if (!flashcard) return { stored: 0 };
    const room = MAX_VARIANTS_PER_CONCEPT - (await variantsOf(ctx, flashcardId)).length;
    const valid = variants
      .filter((variant) => conceptVariantSchema.safeParse(variant).success)
      .slice(0, Math.max(0, room));
    const now = Date.now();
    if (valid.length === 0) {
      await ctx.db.patch(flashcardId, {
        conceptPool: {
          ...flashcard.conceptPool!,
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
    await bumpRevision(ctx, flashcard.libraryId);
    return { stored: valid.length };
  },
});

/** Record why a job failed; the card offers Retry. */
export const failGeneration = internalMutation({
  args: { flashcardId: v.id("flashcards"), job: v.number(), reason: v.string() },
  handler: async (ctx, { flashcardId, job, reason }) => {
    const flashcard = await runningJob(ctx, flashcardId, job);
    if (!flashcard) return;
    await ctx.db.patch(flashcardId, {
      conceptPool: { ...flashcard.conceptPool!, status: "failed", reason },
    });
  },
});
