import { v } from "convex/values";
import { State } from "@armin/core/scheduler";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { ownedOrFail, readableLibrary, writableLibrary } from "./model/access";
import { fail } from "./model/errors";
import { MAX_DECKS, MAX_DESCRIPTION_CHARS, MAX_NAME_CHARS } from "./model/limits";
import { selectSession } from "./model/queue";
import { adjustReviewUnitCount, bumpRevision, findRequest, recordRequest } from "./model/study";
import { internal } from "./_generated/api";

async function deckStats(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  deck: Doc<"decks">,
  now: number,
) {
  const units = await ctx.db
    .query("reviewUnits")
    .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
    .collect();
  const active = units.filter((unit) => !unit.archived);
  // Progress is counted in flashcards: a flashcard is learned only when every
  // review unit it generates (both directions, every cloze deletion) is in
  // FSRS Review state, so `learned` never exceeds `total`.
  const learnedByFlashcard = new Map<string, boolean>();
  for (const unit of active) {
    const learned = learnedByFlashcard.get(unit.flashcardId) ?? true;
    learnedByFlashcard.set(unit.flashcardId, learned && unit.state === State.Review);
  }
  const session = await selectSession(ctx, library, deck._id, now);
  return {
    id: deck._id,
    name: deck.name,
    description: deck.description,
    version: deck.version,
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
    total: learnedByFlashcard.size,
    due: session.reviews.length + session.frontier.length,
    newCount: active.filter((unit) => unit.state === State.New).length,
    learning: active.filter(
      (unit) => unit.state === State.Learning || unit.state === State.Relearning,
    ).length,
    learned: [...learnedByFlashcard.values()].filter(Boolean).length,
  };
}

export const list = query({
  args: { now: v.optional(v.number()) },
  handler: async (ctx) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const decks = await ctx.db
      .query("decks")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .collect();
    const now = Date.now();
    const out = [];
    for (const deck of decks) out.push(await deckStats(ctx, library, deck, now));
    return out;
  },
});

/** Deck names only, for pickers that don't need statistics. */
export const listNames = query({
  args: {},
  handler: async (ctx) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const decks = await ctx.db
      .query("decks")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .collect();
    return decks.map((deck) => ({ id: deck._id, name: deck.name }));
  },
});

export const get = query({
  args: { deckId: v.string(), now: v.optional(v.number()) },
  handler: async (ctx, { deckId }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const id = ctx.db.normalizeId("decks", deckId);
    if (!id) return null;
    const deck = await ctx.db.get(id);
    if (!deck || deck.libraryId !== library._id) return null;
    return deckStats(ctx, library, deck, Date.now());
  },
});

function cleanName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) fail("INVALID", "Deck name is required.");
  if (trimmed.length > MAX_NAME_CHARS) {
    fail("INVALID", `Deck names are limited to ${MAX_NAME_CHARS} characters.`);
  }
  return trimmed;
}

function cleanDescription(description: string | null | undefined) {
  const trimmed = description?.trim() ?? "";
  if (trimmed.length > MAX_DESCRIPTION_CHARS) {
    fail("INVALID", `Descriptions are limited to ${MAX_DESCRIPTION_CHARS} characters.`);
  }
  return trimmed || null;
}

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.union(v.string(), v.null())),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const library = await writableLibrary(ctx);
    const previous = await findRequest(ctx, library._id, args.requestId);
    if (previous) return previous.result as { id: string };
    const count = (
      await ctx.db
        .query("decks")
        .withIndex("by_library", (q) => q.eq("libraryId", library._id))
        .take(MAX_DECKS + 1)
    ).length;
    if (count >= MAX_DECKS) fail("QUOTA", `The beta allows ${MAX_DECKS} decks.`);
    const now = Date.now();
    const id = await ctx.db.insert("decks", {
      libraryId: library._id,
      name: cleanName(args.name),
      description: cleanDescription(args.description),
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await bumpRevision(ctx, library._id);
    const result = { id };
    await recordRequest(ctx, library._id, args.requestId, "decks.create", result, now);
    return result;
  },
});

export const update = mutation({
  args: {
    deckId: v.id("decks"),
    expectedVersion: v.number(),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const library = await writableLibrary(ctx);
    const deck = await ownedOrFail(ctx, library, args.deckId, "Deck");
    if (deck.version !== args.expectedVersion) {
      return { status: "conflict" as const, version: deck.version };
    }
    const now = Date.now();
    await ctx.db.patch(deck._id, {
      ...(args.name !== undefined ? { name: cleanName(args.name) } : {}),
      ...(args.description !== undefined
        ? { description: cleanDescription(args.description) }
        : {}),
      version: deck.version + 1,
      updatedAt: now,
    });
    await bumpRevision(ctx, library._id);
    return { status: "ok" as const, version: deck.version + 1 };
  },
});

/**
 * Delete a deck with its flashcards, review units, edges, image links, and
 * settings in one transaction, using deck-wide reads so the work fits Convex
 * limits at the beta quotas. Review history can be arbitrarily long, so it is
 * removed afterwards by a resumable batch job; queues and export ignore
 * history whose deck or review unit is gone.
 */
export const remove = mutation({
  args: { deckId: v.id("decks") },
  handler: async (ctx, { deckId }) => {
    const library = await writableLibrary(ctx);
    const deck = await ctx.db.get(deckId);
    // Deleting something already gone is a no-op, so retries are safe.
    if (!deck || deck.libraryId !== library._id) return { ok: true as const };
    const [flashcards, units, edges, settings] = await Promise.all([
      ctx.db.query("flashcards").withIndex("by_deck", (q) => q.eq("deckId", deck._id)).collect(),
      ctx.db.query("reviewUnits").withIndex("by_deck", (q) => q.eq("deckId", deck._id)).collect(),
      ctx.db.query("prereqs").withIndex("by_deck", (q) => q.eq("deckId", deck._id)).collect(),
      ctx.db.query("deckSettings").withIndex("by_deck", (q) => q.eq("deckId", deck._id)).unique(),
    ]);
    const flashcardIds = new Set(flashcards.map((flashcard) => flashcard._id));
    const links = (
      await ctx.db
        .query("flashcardMedia")
        .withIndex("by_library_file", (q) => q.eq("libraryId", library._id))
        .collect()
    ).filter((link) => flashcardIds.has(link.flashcardId));

    await adjustReviewUnitCount(ctx, library._id, -units.length);
    for (const edge of edges) await ctx.db.delete(edge._id);
    for (const unit of units) await ctx.db.delete(unit._id);
    for (const link of links) await ctx.db.delete(link._id);
    for (const flashcard of flashcards) await ctx.db.delete(flashcard._id);
    if (settings) await ctx.db.delete(settings._id);
    await ctx.db.delete(deck._id);

    const fileNames = [...new Set(links.map((link) => link.fileName))];
    if (fileNames.length > 0) {
      await ctx.scheduler.runAfter(60 * 60_000, internal.media.collectUnreferenced, {
        libraryId: library._id,
        fileNames,
      });
    }
    await ctx.scheduler.runAfter(0, internal.deletion.cleanupRemovedUnits, { unitIds: units.map(unit => unit._id) });
    await bumpRevision(ctx, library._id);
    return { ok: true as const };
  },
});
