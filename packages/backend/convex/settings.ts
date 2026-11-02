import { v } from "convex/values";
import { SCHEDULING_PRESET_VALUES } from "@armin/core/scheduling-presets";
import { resolveEffectiveSettings } from "@armin/core/study";
import { query } from "./_generated/server";
import { internalMutation, mutation } from "./functions";
import { internal } from "./_generated/api";
import { ownedOrFail, readableLibrary, writableLibrary } from "./model/access";
import { fail } from "./model/errors";
import { checkRanges, checkSteps, checkWeights } from "./model/settingsChecks";
import {
  bumpRevision,
  getSettingsRow,
  overridesFrom,
  refreshAllLocks,
  schedulingFrom,
  SettingsCache,
} from "./model/study";
import type { Doc } from "./_generated/dataModel";

const nullable = <T extends ReturnType<typeof v.number>>(validator: T) =>
  v.optional(v.union(validator, v.null()));

function publicSettings(row: Omit<Doc<"settings">, "_id" | "_creationTime">) {
  return {
    ...schedulingFrom(row as Doc<"settings">),
    schedulingPreset: row.schedulingPreset,
    keybindings: row.keybindings,
    autoplayAudio: row.autoplayAudio ?? true,
  };
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    return {
      ...publicSettings(await getSettingsRow(ctx, library._id)),
      timeZone: library.timeZone,
    };
  },
});

export const update = mutation({
  args: {
    requestRetention: v.optional(v.number()),
    maximumInterval: v.optional(v.number()),
    enableFuzz: v.optional(v.boolean()),
    enableShortTerm: v.optional(v.boolean()),
    learningSteps: v.optional(v.string()),
    relearningSteps: v.optional(v.string()),
    weights: v.optional(v.union(v.string(), v.null())),
    prereqStabilityFloor: v.optional(v.number()),
    newReviewUnitsPerDay: v.optional(v.number()),
    reviewsPerDay: v.optional(v.union(v.number(), v.null())),
    keepSiblingReviewUnitsTogether: v.optional(v.boolean()),
    schedulingPreset: v.optional(v.string()),
    keybindings: v.optional(v.union(v.string(), v.null())),
    autoplayAudio: v.optional(v.boolean()),
  },
  handler: async (ctx, patch) => {
    const library = await writableLibrary(ctx);
    checkSteps(patch.learningSteps);
    checkSteps(patch.relearningSteps);
    checkWeights(patch.weights);
    checkRanges(patch);
    if (
      patch.schedulingPreset !== undefined &&
      !(SCHEDULING_PRESET_VALUES as string[]).includes(patch.schedulingPreset)
    ) {
      fail("INVALID", "Unknown scheduling preset.");
    }
    const row = await getSettingsRow(ctx, library._id);
    const now = Date.now();
    if (row._id) {
      await ctx.db.patch(row._id, { ...patch, updatedAt: now });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _id, ...rest } = row;
      await ctx.db.insert("settings", { ...rest, ...patch, updatedAt: now });
    }
    if (patch.prereqStabilityFloor !== undefined) {
      // A library can hold more cards than one transaction reads; walk it a
      // deck at a time. Locks catch up within moments of the settings change.
      await ctx.scheduler.runAfter(0, internal.settings.refreshLibraryLocks, {
        libraryId: library._id,
        cursor: null,
      });
    }
    await bumpRevision(ctx, library._id);
    return publicSettings(await getSettingsRow(ctx, library._id));
  },
});

async function deckSettingsView(
  ctx: Parameters<typeof readableLibrary>[0],
  libraryId: Doc<"libraries">["_id"],
  deckId: Doc<"decks">["_id"],
) {
  const global = schedulingFrom((await getSettingsRow(ctx, libraryId)) as Doc<"settings">);
  const row = await ctx.db
    .query("deckSettings")
    .withIndex("by_deck", (q) => q.eq("deckId", deckId))
    .unique();
  const overrides = overridesFrom(row);
  return { global, overrides, effective: resolveEffectiveSettings(global, overrides) };
}

export const getDeck = query({
  args: { deckId: v.id("decks") },
  handler: async (ctx, { deckId }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const deck = await ctx.db.get(deckId);
    if (!deck || deck.libraryId !== library._id) return null;
    return deckSettingsView(ctx, library._id, deck._id);
  },
});

export const updateDeck = mutation({
  args: {
    deckId: v.id("decks"),
    requestRetention: nullable(v.number()),
    maximumInterval: nullable(v.number()),
    enableFuzz: v.optional(v.union(v.boolean(), v.null())),
    enableShortTerm: v.optional(v.union(v.boolean(), v.null())),
    learningSteps: v.optional(v.union(v.string(), v.null())),
    relearningSteps: v.optional(v.union(v.string(), v.null())),
    weights: v.optional(v.union(v.string(), v.null())),
    prereqStabilityFloor: nullable(v.number()),
    keepSiblingReviewUnitsTogether: v.optional(v.union(v.boolean(), v.null())),
  },
  handler: async (ctx, { deckId, ...patch }) => {
    const library = await writableLibrary(ctx);
    const deck = await ownedOrFail(ctx, library, deckId, "Deck");
    checkSteps(patch.learningSteps);
    checkSteps(patch.relearningSteps);
    checkWeights(patch.weights);
    checkRanges(patch);
    const now = Date.now();
    const existing = await ctx.db
      .query("deckSettings")
      .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
    } else {
      await ctx.db.insert("deckSettings", {
        libraryId: library._id,
        deckId: deck._id,
        requestRetention: null,
        maximumInterval: null,
        enableFuzz: null,
        enableShortTerm: null,
        learningSteps: null,
        relearningSteps: null,
        weights: null,
        prereqStabilityFloor: null,
        keepSiblingReviewUnitsTogether: null,
        ...patch,
        updatedAt: now,
      });
    }
    if (patch.prereqStabilityFloor !== undefined) {
      await refreshAllLocks(ctx, { deckId: deck._id }, new SettingsCache(ctx, library._id), now);
    }
    await bumpRevision(ctx, library._id);
    return deckSettingsView(ctx, library._id, deck._id);
  },
});

/** Recompute prerequisite locks one deck per transaction, across a library. */
export const refreshLibraryLocks = internalMutation({
  args: { libraryId: v.id("libraries"), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { libraryId, cursor }) => {
    const library = await ctx.db.get(libraryId);
    if (!library || library.status !== "active") return null;
    const page = await ctx.db
      .query("decks")
      .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
      .paginate({ cursor, numItems: 1 });
    for (const deck of page.page) {
      await refreshAllLocks(
        ctx,
        { deckId: deck._id },
        new SettingsCache(ctx, libraryId),
        Date.now(),
      );
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.settings.refreshLibraryLocks, {
        libraryId,
        cursor: page.continueCursor,
      });
    return null;
  },
});
