import { v } from "convex/values";
import { flashcardDisplay } from "@armin/core/flashcard-types";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import type { Id } from "./_generated/dataModel";
import { ownedOrFail, readableLibrary, writableLibrary } from "./model/access";
import { fail } from "./model/errors";
import { linkPrerequisites, unlinkPrerequisite } from "./model/prereqs";
import { bumpRevision, libraryRevision, parseFlashcard } from "./model/study";

export const getDeck = query({
  args: { deckId: v.string() },
  handler: async (ctx, { deckId }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const id = ctx.db.normalizeId("decks", deckId);
    const deck = id ? await ctx.db.get(id) : null;
    if (!deck || deck.libraryId !== library._id || deck.staging) return null;
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
    return {
      version: await libraryRevision(ctx, library._id),
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

async function checkVersion(
  ctx: Parameters<typeof writableLibrary>[0],
  libraryId: Id<"libraries">,
  expectedVersion: number,
) {
  if ((await libraryRevision(ctx, libraryId)) !== expectedVersion) {
    fail("CONFLICT", "This graph changed elsewhere. Reload it and retry your change.");
  }
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
    const prereq = await ownedOrFail(ctx, library, prereqId, "Flashcard");
    const dependent = await ownedOrFail(ctx, library, dependentId, "Flashcard");
    if (prereq.deckId !== dependent.deckId) {
      fail("INVALID", "Prerequisites can only connect flashcards in the same deck.");
    }
    const deck = await ownedOrFail(ctx, library, prereq.deckId, "Deck");
    const added = await linkPrerequisites(ctx, deck, [{ prereqId, dependentId }], Date.now());
    if (added.length === 0) return { ok: true as const, version: expectedVersion };
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
    await unlinkPrerequisite(ctx, edge, Date.now());
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
    const current = (await libraryRevision(ctx, library._id)) === expectedVersion;
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
