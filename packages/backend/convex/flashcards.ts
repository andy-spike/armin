import { v } from "convex/values";
import { dueSortPriority, BROWSE_PAGE_SIZE, type BrowseSortKey } from "@armin/core/study";
import type { TypeAnswerContent } from "@armin/core/flashcard-types";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ownedOrFail, readableLibrary, writableLibrary } from "./model/access";
import { fail } from "./model/errors";
import { MAX_FLASHCARDS } from "./model/limits";
import {
  deleteFlashcardCascade,
  hydrateFlashcard,
  hydrateFromUnits,
  prepareTags,
  syncFlashcardMedia,
  validateFlashcardInput,
  type HydratedFlashcard,
} from "./model/flashcards";
import {
  bumpRevision,
  findRequest,
  parseFlashcard,
  reconcileReviewUnits,
  recordRequest,
  refreshAfterPrereqChange,
  refreshDependentSubgraph,
  rememberTags,
  SettingsCache,
} from "./model/study";

export const listByDeck = query({
  args: { deckId: v.string(), now: v.optional(v.number()) },
  handler: async (ctx, { deckId }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const id = ctx.db.normalizeId("decks", deckId);
    const deck = id ? await ctx.db.get(id) : null;
    if (!deck || deck.libraryId !== library._id) return null;
    const flashcards = await ctx.db
      .query("flashcards")
      .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
      .collect();
    const units = await ctx.db
      .query("reviewUnits")
      .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
      .collect();
    const unitsByFlashcard = new Map<Id<"flashcards">, Doc<"reviewUnits">[]>();
    for (const unit of units) {
      const list = unitsByFlashcard.get(unit.flashcardId);
      if (list) list.push(unit);
      else unitsByFlashcard.set(unit.flashcardId, [unit]);
    }
    return flashcards.map((flashcard) =>
      hydrateFromUnits(flashcard, unitsByFlashcard.get(flashcard._id) ?? [], deck.name),
    );
  },
});

export const get = query({
  args: { flashcardId: v.string() },
  handler: async (ctx, { flashcardId }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const id = ctx.db.normalizeId("flashcards", flashcardId);
    const flashcard = id ? await ctx.db.get(id) : null;
    if (!flashcard || flashcard.libraryId !== library._id) return null;
    const deck = await ctx.db.get(flashcard.deckId);
    return hydrateFlashcard(ctx, flashcard, deck?.name);
  },
});

/** Text that Browse search matches beyond the tile's front, back, and tags. */
function searchExtraText(flashcard: HydratedFlashcard) {
  if (flashcard.type !== "type_answer") return "";
  return (flashcard.content as TypeAnswerContent).acceptedAnswers.join("\n");
}

function sortBrowse(items: HydratedFlashcard[], sort: BrowseSortKey, now: number) {
  const byFront = (a: HydratedFlashcard, b: HydratedFlashcard) => a.front.localeCompare(b.front);
  const next = [...items];
  switch (sort) {
    case "due-soon":
      return next.sort(
        (a, b) => dueSortPriority(a, now) - dueSortPriority(b, now) || byFront(a, b),
      );
    case "due-later":
      return next.sort(
        (a, b) => dueSortPriority(b, now) - dueSortPriority(a, now) || byFront(a, b),
      );
    case "locked-first":
      return next.sort((a, b) => Number(b.locked) - Number(a.locked) || byFront(a, b));
    case "locked-last":
      return next.sort((a, b) => Number(a.locked) - Number(b.locked) || byFront(a, b));
    case "created-old":
      return next.sort((a, b) => a.createdAt - b.createdAt);
    case "front-asc":
      return next.sort(byFront);
    case "front-desc":
      return next.sort((a, b) => b.front.localeCompare(a.front));
    case "back-asc":
      return next.sort((a, b) => a.back.localeCompare(b.back));
    case "back-desc":
      return next.sort((a, b) => b.back.localeCompare(a.back));
    case "state-asc":
      return next.sort((a, b) => a.state - b.state || byFront(a, b));
    case "state-desc":
      return next.sort((a, b) => b.state - a.state || byFront(a, b));
    case "deck-asc":
      return next.sort((a, b) => a.deckName.localeCompare(b.deckName) || byFront(a, b));
    case "deck-desc":
      return next.sort((a, b) => b.deckName.localeCompare(a.deckName) || byFront(a, b));
    case "created-new":
    default:
      return next.sort((a, b) => b.createdAt - a.createdAt);
  }
}

/**
 * Filtered, sorted page of the library. Bounded by the beta flashcard quota;
 * the client loads more by increasing `limit`.
 */
export const browse = query({
  args: {
    limit: v.number(),
    sort: v.string(),
    state: v.optional(v.number()),
    deckId: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    search: v.optional(v.string()),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const all = await ctx.db
      .query("flashcards")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .collect();
    const deckNames = new Map<Id<"decks">, string>();
    for (const deck of await ctx.db
      .query("decks")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .collect()) {
      deckNames.set(deck._id, deck.name);
    }
    // One read for all units: per-flashcard queries would exceed Convex's
    // per-function index-range limit on large libraries.
    const unitsByFlashcard = new Map<Id<"flashcards">, Doc<"reviewUnits">[]>();
    for (const unit of await ctx.db
      .query("reviewUnits")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .collect()) {
      const list = unitsByFlashcard.get(unit.flashcardId);
      if (list) list.push(unit);
      else unitsByFlashcard.set(unit.flashcardId, [unit]);
    }
    const tagKeys = new Set((args.tags ?? []).map((tag) => tag.toLocaleLowerCase()));
    const deckFilter = args.deckId ? ctx.db.normalizeId("decks", args.deckId) : null;
    const libraryArchived = all.filter((flashcard) => flashcard.archived).length;
    const filtered: HydratedFlashcard[] = [];
    let filteredArchived = 0;
    for (const flashcard of all) {
      if (deckFilter && flashcard.deckId !== deckFilter) continue;
      if (tagKeys.size > 0 && !flashcard.tags.some((tag) => tagKeys.has(tag.toLocaleLowerCase()))) {
        continue;
      }
      const units = unitsByFlashcard.get(flashcard._id) ?? [];
      if (args.state !== undefined && !units.some((unit) => unit.state === args.state)) {
        continue;
      }
      const hydrated = hydrateFromUnits(flashcard, units, deckNames.get(flashcard.deckId));
      if (args.search) {
        const needle = args.search.toLocaleLowerCase();
        const haystack =
          `${hydrated.front}\n${hydrated.back}\n${hydrated.tags.join(" ")}\n${searchExtraText(hydrated)}`.toLocaleLowerCase();
        if (!haystack.includes(needle)) continue;
      }
      if (hydrated.archived) filteredArchived += 1;
      filtered.push(hydrated);
    }
    const sorted = sortBrowse(filtered, args.sort as BrowseSortKey, Date.now());
    const limit = Math.min(Math.max(args.limit || BROWSE_PAGE_SIZE, 1), 500);
    return {
      flashcards: sorted.slice(0, limit),
      filteredTotal: filtered.length,
      filteredArchived,
      libraryTotal: all.length,
      libraryArchived,
    };
  },
});

export const listTags = query({
  args: {},
  handler: async (ctx) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    // Derive options from the cards that currently carry each tag rather than
    // the library's remembered tag names, so a removed tag leaves the filter.
    const flashcards = await ctx.db
      .query("flashcards")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .collect();
    const names = new Map<string, string>();
    for (const flashcard of flashcards) {
      for (const tag of flashcard.tags) names.set(tag.toLocaleLowerCase(), tag);
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b));
  },
});

export const listDeckTags = query({
  args: { deckId: v.string() },
  handler: async (ctx, { deckId }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const id = ctx.db.normalizeId("decks", deckId);
    const deck = id ? await ctx.db.get(id) : null;
    if (!deck || deck.libraryId !== library._id) return null;
    const flashcards = await ctx.db
      .query("flashcards")
      .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
      .collect();
    const names = new Map<string, string>();
    for (const flashcard of flashcards) {
      for (const tag of flashcard.tags) names.set(tag.toLocaleLowerCase(), tag);
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b));
  },
});

const contentArgs = {
  type: v.string(),
  // Validated by the shared core schema for the flashcard type.
  content: v.any(),
};

export const create = mutation({
  args: {
    deckId: v.id("decks"),
    ...contentArgs,
    tags: v.optional(v.array(v.string())),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const library = await writableLibrary(ctx);
    const previous = await findRequest(ctx, library._id, args.requestId);
    if (previous) return previous.result as { id: Id<"flashcards"> };
    const deck = await ownedOrFail(ctx, library, args.deckId, "Deck");
    const count = (
      await ctx.db
        .query("flashcards")
        .withIndex("by_library", (q) => q.eq("libraryId", library._id))
        .take(MAX_FLASHCARDS + 1)
    ).length;
    if (count >= MAX_FLASHCARDS) {
      fail("QUOTA", `The beta allows ${MAX_FLASHCARDS} flashcards per account.`);
    }
    const input = validateFlashcardInput(args.type, args.content);
    const tags = await prepareTags(ctx, library._id, args.tags ?? []);
    const now = Date.now();
    const id = await ctx.db.insert("flashcards", {
      libraryId: library._id,
      deckId: deck._id,
      type: input.type,
      content: input.serialized,
      tags,
      posX: null,
      posY: null,
      locked: false,
      prerequisiteAccessGranted: false,
      archived: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    const flashcard = (await ctx.db.get(id))!;
    await reconcileReviewUnits(ctx, flashcard, input.type, input.content, now);
    await syncFlashcardMedia(ctx, flashcard, input.mediaFiles);
    await rememberTags(ctx, library._id, tags);
    await bumpRevision(ctx, library._id);
    const result = { id };
    await recordRequest(ctx, library._id, args.requestId, "flashcards.create", result, now);
    return result;
  },
});

export type UpdateResult =
  | { status: "ok"; version: number }
  | { status: "conflict"; version: number; message: string };

/**
 * Save an edit made against `expectedVersion`. The first accepted edit wins:
 * a later save from an older version returns a conflict and changes nothing,
 * so the client can keep the user's draft and let them decide.
 */
export const update = mutation({
  args: {
    flashcardId: v.id("flashcards"),
    expectedVersion: v.number(),
    type: v.optional(v.string()),
    content: v.optional(v.any()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<UpdateResult> => {
    const library = await writableLibrary(ctx);
    const flashcard = await ownedOrFail(ctx, library, args.flashcardId, "Flashcard");
    if (flashcard.version !== args.expectedVersion) {
      return {
        status: "conflict",
        version: flashcard.version,
        message: "This flashcard was changed elsewhere after you opened it.",
      };
    }
    const now = Date.now();
    const contentChanged = args.content !== undefined || args.type !== undefined;
    const patch: Partial<Doc<"flashcards">> = {};
    if (contentChanged) {
      const current = parseFlashcard(flashcard);
      const input = validateFlashcardInput(
        args.type ?? current.type,
        args.content ?? current.content,
      );
      patch.type = input.type;
      patch.content = input.serialized;
      const next = { ...flashcard, ...patch };
      await reconcileReviewUnits(ctx, next, input.type, input.content, now);
      await syncFlashcardMedia(ctx, flashcard, input.mediaFiles);
    }
    if (args.tags) {
      patch.tags = await prepareTags(ctx, library._id, args.tags);
      await rememberTags(ctx, library._id, patch.tags);
    }
    const version = flashcard.version + 1;
    await ctx.db.patch(flashcard._id, { ...patch, version, updatedAt: now });
    if (contentChanged) {
      // Removing or adding review units can change whether dependents are secured.
      const settings = new SettingsCache(ctx, library._id);
      await refreshAfterPrereqChange(ctx, flashcard._id, settings, now);
    }
    await bumpRevision(ctx, library._id);
    return { status: "ok", version };
  },
});

export const remove = mutation({
  args: { flashcardId: v.id("flashcards") },
  handler: async (ctx, { flashcardId }) => {
    const library = await writableLibrary(ctx);
    const flashcard = await ctx.db.get(flashcardId);
    // Deleting something already gone is a no-op, so retries are safe.
    if (!flashcard || flashcard.libraryId !== library._id) return { ok: true as const };
    await deleteFlashcardCascade(ctx, flashcard, { refreshDependents: true });
    await bumpRevision(ctx, library._id);
    return { ok: true as const };
  },
});

/** Archived flashcards leave queues and stop gating dependents. */
export const setArchived = mutation({
  args: { flashcardId: v.id("flashcards"), archived: v.boolean() },
  handler: async (ctx, { flashcardId, archived }) => {
    const library = await writableLibrary(ctx);
    const flashcard = await ownedOrFail(ctx, library, flashcardId, "Flashcard");
    if (flashcard.archived === archived) return { version: flashcard.version };
    const now = Date.now();
    const version = flashcard.version + 1;
    await ctx.db.patch(flashcard._id, { archived, version, updatedAt: now });
    const units = await ctx.db
      .query("reviewUnits")
      .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcard._id))
      .collect();
    for (const unit of units) {
      await ctx.db.patch(unit._id, { archived, version: unit.version + 1, updatedAt: now });
    }
    const settings = new SettingsCache(ctx, library._id);
    await refreshAfterPrereqChange(ctx, flashcard._id, settings, now);
    await bumpRevision(ctx, library._id);
    return { version };
  },
});

export const deleteConsequences = query({
  args: { flashcardId: v.id("flashcards") },
  handler: async (ctx, { flashcardId }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const flashcard = await ctx.db.get(flashcardId);
    if (!flashcard || flashcard.libraryId !== library._id) return null;
    const dependents = await ctx.db
      .query("prereqs")
      .withIndex("by_prereq", (q) => q.eq("prereqId", flashcard._id))
      .collect();
    const units = await ctx.db
      .query("reviewUnits")
      .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcard._id))
      .collect();
    // FSRS reps counts accepted reviews, and undo restores the previous reps.
    // Read only the two boundary logs per unit, never its lifetime history.
    const boundaries = await Promise.all(
      units.map(async (unit) => {
        const history = () =>
          ctx.db
            .query("reviewLogs")
            .withIndex("by_unit_review", (q) => q.eq("reviewUnitId", unit._id));
        return [await history().first(), await history().order("desc").first()];
      }),
    );
    const times = boundaries.flat().flatMap((log) => (log ? [log.review] : []));
    return {
      dependentCount: dependents.length,
      reviewUnitCount: units.length,
      reviewLogCount: units.reduce((sum, unit) => sum + unit.reps, 0),
      firstReviewAt: times.length ? Math.min(...times) : null,
      lastReviewAt: times.length ? Math.max(...times) : null,
    };
  },
});

export const moveConsequences = query({
  args: { flashcardId: v.id("flashcards") },
  handler: async (ctx, { flashcardId }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const flashcard = await ctx.db.get(flashcardId);
    if (!flashcard || flashcard.libraryId !== library._id) return null;
    const prereqs = await ctx.db
      .query("prereqs")
      .withIndex("by_dependent", (q) => q.eq("dependentId", flashcard._id))
      .collect();
    const dependents = await ctx.db
      .query("prereqs")
      .withIndex("by_prereq", (q) => q.eq("prereqId", flashcard._id))
      .collect();
    return { prerequisiteCount: prereqs.length, dependentCount: dependents.length };
  },
});

/**
 * Move a flashcard to another deck. Prerequisite edges cannot cross decks,
 * so all its edges are removed, its units follow it, its canvas position is
 * cleared, and lock state is recomputed for it and its former dependents.
 */
export const move = mutation({
  args: { flashcardId: v.id("flashcards"), targetDeckId: v.id("decks") },
  handler: async (ctx, { flashcardId, targetDeckId }) => {
    const library = await writableLibrary(ctx);
    const flashcard = await ownedOrFail(ctx, library, flashcardId, "Flashcard");
    const target = await ownedOrFail(ctx, library, targetDeckId, "Deck");
    if (flashcard.deckId === target._id) return { version: flashcard.version };
    const now = Date.now();
    const outgoing = await ctx.db
      .query("prereqs")
      .withIndex("by_prereq", (q) => q.eq("prereqId", flashcard._id))
      .collect();
    const incoming = await ctx.db
      .query("prereqs")
      .withIndex("by_dependent", (q) => q.eq("dependentId", flashcard._id))
      .collect();
    for (const edge of [...outgoing, ...incoming]) await ctx.db.delete(edge._id);
    const version = flashcard.version + 1;
    await ctx.db.patch(flashcard._id, {
      deckId: target._id,
      posX: null,
      posY: null,
      version,
      updatedAt: now,
    });
    const units = await ctx.db
      .query("reviewUnits")
      .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcard._id))
      .collect();
    for (const unit of units) {
      await ctx.db.patch(unit._id, {
        deckId: target._id,
        version: unit.version + 1,
        updatedAt: now,
      });
    }
    const settings = new SettingsCache(ctx, library._id);
    await refreshDependentSubgraph(
      ctx,
      [flashcard._id, ...outgoing.map((edge) => edge.dependentId)],
      settings,
      now,
    );
    await bumpRevision(ctx, library._id);
    return { version };
  },
});
