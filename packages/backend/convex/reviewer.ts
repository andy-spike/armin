import { v } from "convex/values";
import { defaultSchedulingSettings } from "@armin/core/study";
import { internalMutation } from "./functions";
import { components, internal } from "./_generated/api";
import { cleanupLibraryData } from "./deletion";
import { insertDeck } from "./model/decks";
import { reviewerResetHours } from "./model/reviewer";
import { bumpRevision, reconcileReviewUnits } from "./model/study";

/** Operator/cron only. No client can select an account to erase. */
export const reset = internalMutation({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, { force }) => {
    const ownerId = process.env.REVIEWER_ACCOUNT_USER_ID;
    if (!ownerId) return { status: "disabled" };
    const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "_id", operator: "eq", value: ownerId }],
    });
    if (!user || user.email !== "reviewer@armincards.app" || !user.emailVerified) {
      throw new Error("Reviewer reset requires the verified reviewer@armincards.app account.");
    }
    const library = await ctx.db
      .query("libraries")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    if (!library) throw new Error("Provision the reviewer library before enabling resets.");
    if (library.status === "deleting") return { status: "deleting" };
    if (library.status === "resetting") {
      // Also recovers a cleanup whose scheduled run failed.
      await ctx.scheduler.runAfter(0, internal.reviewer.finishReset, { libraryId: library._id });
      return { status: "resetting" };
    }
    const interval = reviewerResetHours() * 3_600_000;
    if (!force && library.reviewerResetAt && Date.now() < library.reviewerResetAt + interval) {
      return { status: "not_due", nextResetAt: library.reviewerResetAt + interval };
    }
    // Freeze all study and MCP writes before the first cleanup batch.
    await ctx.db.patch(library._id, { status: "resetting" });
    await ctx.scheduler.runAfter(0, internal.reviewer.finishReset, { libraryId: library._id });
    return { status: "resetting" };
  },
});

export const finishReset = internalMutation({
  args: { libraryId: v.id("libraries") },
  handler: async (ctx, { libraryId }) => {
    const library = await ctx.db.get(libraryId);
    if (!library || library.status !== "resetting") return;
    if (!(await cleanupLibraryData(ctx, libraryId, true))) {
      await ctx.scheduler.runAfter(0, internal.reviewer.finishReset, { libraryId });
      return;
    }
    const now = Date.now();
    const counters = await ctx.db
      .query("libraryCounters")
      .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
      .unique();
    if (counters) await ctx.db.patch(counters._id, { mediaBytes: 0, reviewUnits: 0 });
    await bumpRevision(ctx, libraryId);
    await ctx.db.insert("settings", {
      libraryId,
      ...defaultSchedulingSettings(),
      keybindings: null,
      updatedAt: now,
    });
    const deckId = await insertDeck(ctx, {
      libraryId,
      name: "Armin sample library",
      description: `Shared public test data. Changes are erased every ${reviewerResetHours()} hours. Do not add private material.`,
      now,
    });
    const samples = [
      {
        type: "basic" as const,
        content: {
          front: "What does a prerequisite link represent in Armin?",
          back: "Knowledge to learn before studying the dependent card.",
        },
      },
      {
        type: "basic" as const,
        content: {
          front: "When does a card blocked by a prerequisite become eligible for study?",
          back: "When its active prerequisites are secured.",
        },
      },
      { type: "cloze" as const, content: { text: "Armin schedules reviews using {{1::FSRS}}." } },
      {
        type: "type_answer" as const,
        content: {
          prompt: "What abbreviation names Armin's review scheduler?",
          answer: "FSRS",
          acceptedAnswers: [],
        },
      },
    ];
    const ids = [];
    for (const [index, sample] of samples.entries()) {
      const locked = index === 1;
      const id = await ctx.db.insert("flashcards", {
        libraryId,
        deckId,
        type: sample.type,
        content: JSON.stringify(sample.content),
        tags: ["demo"],
        posX: null,
        posY: null,
        locked,
        prerequisiteAccessGranted: !locked,
        archived: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      const card = await ctx.db.get(id);
      await reconcileReviewUnits(ctx, card!, sample.type, sample.content, now);
      ids.push(id);
    }
    await ctx.db.insert("prereqs", { libraryId, deckId, prereqId: ids[0]!, dependentId: ids[1]! });
    await ctx.db.insert("tags", { libraryId, name: "demo", key: "demo" });
    // Selected grants still contain only removed deck IDs. Do not expand them
    // to the new sample deck or otherwise broaden an existing consent.
    await ctx.db.patch(libraryId, { status: "active", timeZone: "UTC", reviewerResetAt: now });
  },
});
