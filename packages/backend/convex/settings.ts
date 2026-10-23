import { v } from "convex/values";
import { checkParameters } from "ts-fsrs";
import { SCHEDULING_PRESET_VALUES } from "@armin/core/scheduling-presets";
import { resolveEffectiveSettings } from "@armin/core/study";
import { mutation, query } from "./_generated/server";
import { ownedOrFail, readableLibrary, writableLibrary } from "./model/access";
import { fail } from "./model/errors";
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

function checkSteps(value: string | null | undefined) {
  if (value == null) return;
  const steps = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (steps.some((step) => !/^\d+(?:\.\d+)?[mhd]$/.test(step))) {
    fail("INVALID", "Steps use units like 10m, 1h, or 1d separated by commas.");
  }
}

function checkWeights(value: string | null | undefined) {
  if (value == null) return;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.some((n) => typeof n !== "number")) throw 0;
    checkParameters(parsed);
  } catch {
    fail("INVALID", "FSRS weights must be a JSON array of 17, 19, or 21 finite numbers.");
  }
}

function checkRanges(patch: {
  requestRetention?: number | null;
  maximumInterval?: number | null;
  prereqStabilityFloor?: number | null;
  newReviewUnitsPerDay?: number | null;
}) {
  const r = patch.requestRetention;
  if (r != null && !(r >= 0.7 && r <= 0.99)) {
    fail("INVALID", "Desired retention must be between 0.70 and 0.99.");
  }
  const m = patch.maximumInterval;
  if (m != null && !(Number.isInteger(m) && m >= 1 && m <= 36500)) {
    fail("INVALID", "Maximum interval must be 1–36500 days.");
  }
  const f = patch.prereqStabilityFloor;
  if (f != null && !(f >= 0 && f <= 365)) {
    fail("INVALID", "Prerequisite stability floor must be 0–365 days.");
  }
  const n = patch.newReviewUnitsPerDay;
  if (n != null && !(Number.isInteger(n) && n >= 0 && n <= 1000)) {
    fail("INVALID", "New review units per day must be 0–1000.");
  }
}

function publicSettings(row: Omit<Doc<"settings">, "_id" | "_creationTime">) {
  return {
    ...schedulingFrom(row as Doc<"settings">),
    schedulingPreset: row.schedulingPreset,
    keybindings: row.keybindings,
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
    keepSiblingReviewUnitsTogether: v.optional(v.boolean()),
    schedulingPreset: v.optional(v.string()),
    keybindings: v.optional(v.union(v.string(), v.null())),
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
      await refreshAllLocks(
        ctx,
        { libraryId: library._id },
        new SettingsCache(ctx, library._id),
        now,
      );
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
