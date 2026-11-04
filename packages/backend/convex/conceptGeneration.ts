import { v } from "convex/values";
import { CONCEPT_BATCH_SIZE } from "@armin/core/concept";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { GenerationError, generateVariants, selectProvider } from "./model/generator";

/**
 * One generation job for a concept card (ADR 0023): read the template and the
 * exercises to avoid, ask the generator module for a batch, and store what it
 * returns. Every failure ends in the pool's failed state with a reason, so the
 * card can offer Retry. A job that is no longer the card's latest does nothing.
 */
export const generate = internalAction({
  args: { flashcardId: v.id("flashcards"), job: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fail = (reason: string) =>
      ctx.runMutation(internal.concepts.failGeneration, { ...args, reason });
    const input = await ctx.runQuery(internal.concepts.generationInput, args);
    if (!input) return null;
    if (input.room <= 0) {
      await fail("This card already keeps as many variants as it can.");
      return null;
    }
    const { provider, unavailable } = selectProvider();
    if (!provider) {
      await fail(unavailable);
      return null;
    }
    try {
      const { variants, dropped } = await generateVariants(provider, {
        template: input.template,
        avoid: input.avoid,
        count: Math.min(CONCEPT_BATCH_SIZE, input.room),
      });
      if (dropped > 0)
        console.warn(`Generator ${provider.name} returned ${dropped} invalid variants.`);
      if (variants.length === 0) {
        await fail("The generator returned no usable exercises.");
        return null;
      }
      await ctx.runMutation(internal.concepts.storeVariants, { ...args, variants });
    } catch (error) {
      console.error(`Generator ${provider.name} failed`, error);
      await fail(
        error instanceof GenerationError ? error.message : "Generating variants failed. Try again.",
      );
    }
    return null;
  },
});
