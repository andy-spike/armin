import { v } from "convex/values";
import { flashcardDisplay } from "@armin/core/flashcard-types";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import type { Id } from "./_generated/dataModel";
import { ownedOrFail, readableLibrary, writableLibrary } from "./model/access";
import { fail } from "./model/errors";
import { MAX_PREREQS_PER_DECK } from "./model/limits";
import {
  bumpRevision,
  parseFlashcard,
  refreshDependentSubgraph,
  SettingsCache,
} from "./model/study";

export const getDeck = query({
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
    const units = await ctx.db
      .query("reviewUnits")
      .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
      .collect();
    const minState = new Map<string, number>();
    for (const unit of units) {
      const current = minState.get(unit.flashcardId);
      if (current === undefined || unit.state < current) {
        minState.set(unit.flashcardId, unit.state);
      }
    }
    const edges = await ctx.db
      .query("prereqs")
      .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
      .collect();
    const counters = await ctx.db
      .query("libraryCounters")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .unique();
    return {
      version: counters?.revision ?? 0,
      nodes: flashcards.map((flashcard) => {
        const { type, content } = parseFlashcard(flashcard);
        const display = flashcardDisplay(type, content);
        return {
          id: flashcard._id,
          front: display.front,
          back: display.back,
          type,
          state: minState.get(flashcard._id) ?? 0,
          locked: flashcard.locked,
          archived: flashcard.archived,
          x: flashcard.posX,
          y: flashcard.posY,
        };
      }),
      edges: edges.map((edge) => ({
        prereqId: edge.prereqId,
        dependentId: edge.dependentId,
      })),
    };
  },
});

/** Does `from` reach `target` following prerequisite → dependent edges? */
async function checkVersion(
  ctx: Parameters<typeof writableLibrary>[0],
  libraryId: Id<"libraries">,
  expectedVersion: number,
) {
  const counters = await ctx.db
    .query("libraryCounters")
    .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
    .unique();
  if ((counters?.revision ?? 0) !== expectedVersion) {
    fail("CONFLICT", "This graph changed elsewhere. Reload it and retry your change.");
  }
}

async function reaches(
  ctx: Parameters<typeof readableLibrary>[0],
  from: Id<"flashcards">,
  target: Id<"flashcards">,
) {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const node = stack.pop()!;
    if (node === target) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    const edges = await ctx.db
      .query("prereqs")
      .withIndex("by_prereq", (q) => q.eq("prereqId", node))
      .collect();
    stack.push(...edges.map((edge) => edge.dependentId));
  }
  return false;
}

/**
 * Add a prerequisite edge. Rejected when the cards are in different decks or
 * the edge would close a cycle. Every write checks the displayed graph revision.
 */
export const addPrereq = mutation({
  args: {
    prereqId: v.id("flashcards"),
    dependentId: v.id("flashcards"),
    expectedVersion: v.number(),
  },
  handler: async (ctx, { prereqId, dependentId, expectedVersion }) => {
    const library = await writableLibrary(ctx);
    await checkVersion(ctx, library._id, expectedVersion);
    if (prereqId === dependentId) {
      fail("INVALID", "A flashcard cannot be its own prerequisite.");
    }
    const prereq = await ownedOrFail(ctx, library, prereqId, "Flashcard");
    const dependent = await ownedOrFail(ctx, library, dependentId, "Flashcard");
    if (prereq.deckId !== dependent.deckId) {
      fail("INVALID", "Prerequisites can only connect flashcards in the same deck.");
    }
    const existing = await ctx.db
      .query("prereqs")
      .withIndex("by_pair", (q) => q.eq("prereqId", prereqId).eq("dependentId", dependentId))
      .unique();
    if (existing) return { ok: true as const, version: expectedVersion };
    const deckEdges = await ctx.db
      .query("prereqs")
      .withIndex("by_deck", (q) => q.eq("deckId", prereq.deckId))
      .take(MAX_PREREQS_PER_DECK);
    if (deckEdges.length >= MAX_PREREQS_PER_DECK) {
      fail("QUOTA", `The beta allows ${MAX_PREREQS_PER_DECK} prerequisite links per deck.`);
    }
    if (await reaches(ctx, dependentId, prereqId)) {
      fail("INVALID", "That edge would create a cycle in the prerequisite graph.");
    }
    await ctx.db.insert("prereqs", {
      libraryId: library._id,
      deckId: prereq.deckId,
      prereqId,
      dependentId,
    });
    const settings = new SettingsCache(ctx, library._id);
    await refreshDependentSubgraph(ctx, [dependentId], settings, Date.now());
    await bumpRevision(ctx, library._id);
    return { ok: true as const, version: expectedVersion + 1 };
  },
});

export const removePrereq = mutation({
  args: {
    prereqId: v.id("flashcards"),
    dependentId: v.id("flashcards"),
    expectedVersion: v.number(),
  },
  handler: async (ctx, { prereqId, dependentId, expectedVersion }) => {
    const library = await writableLibrary(ctx);
    await checkVersion(ctx, library._id, expectedVersion);
    const edge = await ctx.db
      .query("prereqs")
      .withIndex("by_pair", (q) => q.eq("prereqId", prereqId).eq("dependentId", dependentId))
      .unique();
    if (!edge || edge.libraryId !== library._id)
      return { ok: true as const, version: expectedVersion };
    await ownedOrFail(ctx, library, edge.deckId, "Deck");
    await ctx.db.delete(edge._id);
    const settings = new SettingsCache(ctx, library._id);
    await refreshDependentSubgraph(ctx, [dependentId], settings, Date.now());
    await bumpRevision(ctx, library._id);
    return { ok: true as const, version: expectedVersion + 1 };
  },
});

/** Persist canvas positions for the supplied flashcards of one deck. */
export const saveLayout = mutation({
  args: {
    deckId: v.id("decks"),
    expectedVersion: v.number(),
    placements: v.array(v.object({ flashcardId: v.string(), x: v.number(), y: v.number() })),
  },
  // Positions are last-write-wins and can't break graph rules, so a layout
  // save never conflicts. When the library changed elsewhere, return the
  // caller's version unchanged so its next link edit still detects that.
  handler: async (ctx, { deckId, placements, expectedVersion }) => {
    const library = await writableLibrary(ctx);
    const counters = await ctx.db
      .query("libraryCounters")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .unique();
    const current = (counters?.revision ?? 0) === expectedVersion;
    const deck = await ownedOrFail(ctx, library, deckId, "Deck");
    if (placements.length > 2000) fail("INVALID", "Too many placements.");
    for (const placement of placements) {
      const id = ctx.db.normalizeId("flashcards", placement.flashcardId);
      const flashcard = id ? await ctx.db.get(id) : null;
      if (!flashcard || flashcard.deckId !== deck._id) continue;
      if (!Number.isFinite(placement.x) || !Number.isFinite(placement.y)) continue;
      await ctx.db.patch(flashcard._id, { posX: placement.x, posY: placement.y });
    }
    await bumpRevision(ctx, library._id);
    return { ok: true as const, version: current ? expectedVersion + 1 : expectedVersion };
  },
});
