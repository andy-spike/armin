"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { variantReservation } from "./schema";
import { GenerationError, generateVariants, selectProvider } from "./model/generator";

/**
 * One generation job for a concept card (ADR 0023): read the template and the
 * exercises to avoid, ask the generator module for a batch, and store what it
 * returns. Every failure ends in the pool's failed state with a reason, so the
 * card can offer Retry. A job that is no longer the card's latest does nothing.
 *
 * `count` is the batch `requestGeneration` reserved from the monthly variant
 * allowance (`reserved`) before scheduling this job. Storing or failing
 * settles that reservation, charging only the variants stored.
 *
 * A Node action: the gateway provider's streamed model response needs Node's
 * fetch and streams (see `model/generator.ts`).
 */
export const generate = internalAction({
  args: {
    flashcardId: v.id("flashcards"),
    job: v.number(),
    count: v.number(),
    reserved: v.optional(variantReservation),
  },
  returns: v.null(),
  handler: async (ctx, { count, ...args }) => {
    const fail = (reason: string) =>
      ctx.runMutation(internal.concepts.failGeneration, { ...args, reason });
    const input = await ctx.runQuery(internal.concepts.generationInput, {
      flashcardId: args.flashcardId,
      job: args.job,
    });
    if (!input) {
      // Deletion or supersession already settled the reservation.
      await fail("This job is no longer current.");
      return null;
    }
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
        count: Math.min(count, input.room),
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
