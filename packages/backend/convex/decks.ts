import { v } from "convex/values";
import { State } from "@armin/core/scheduler";
import { query, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import type { Doc } from "./_generated/dataModel";
import { ownedOrFail, readableLibrary, writableLibrary } from "./model/access";
import { fail } from "./model/errors";
import { insertDeck, updateDeckDetails } from "./model/decks";
import { checkCapacity } from "./model/usage";
import { deleteDeckCascade } from "./model/deletion";
import { introducedToday, reviewsDoneToday, selectSession, type SessionReads } from "./model/queue";
import { bumpRevision, findRequest, recordRequest, SettingsCache } from "./model/study";

/** The deck's totals the slow way, for a deck whose counters aren't built yet. */
async function countFromUnits(ctx: QueryCtx, deck: Doc<"decks">) {
  const units = await ctx.db
    .query("reviewUnits")
    .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
    .collect();
  const active = units.filter((unit) => !unit.archived);
  const learnedByFlashcard = new Map<string, boolean>();
  for (const unit of active) {
    const learned = learnedByFlashcard.get(unit.flashcardId) ?? true;
    learnedByFlashcard.set(unit.flashcardId, learned && unit.state === State.Review);
  }
  return {
    active: learnedByFlashcard.size,
    archived: new Set(units.filter((unit) => unit.archived).map((unit) => unit.flashcardId)).size,
    learned: [...learnedByFlashcard.values()].filter(Boolean).length,
    newUnits: active.filter((unit) => unit.state === State.New).length,
    learningUnits: active.filter(
      (unit) => unit.state === State.Learning || unit.state === State.Relearning,
    ).length,
  };
}

async function deckStats(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  deck: Doc<"decks">,
  now: number,
  shared: SessionReads = {},
) {
  // Archived cards stay out of the deck's card and progress totals, but the
  // header names their count separately so the footer and tile grid agree.
  // Progress is counted in flashcards: a flashcard is learned only when every
  // review unit it generates (both directions, every cloze deletion) is in
  // FSRS Review state, so `learned` never exceeds `total`.
  const counts =
    (await ctx.db
      .query("deckCounters")
      .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
      .unique()) ?? (await countFromUnits(ctx, deck));
  const session = await selectSession(ctx, library, deck._id, now, shared);
  return {
    id: deck._id,
    name: deck.name,
    slug: deck.slug ?? deck._id,
    description: deck.description,
    version: deck.version,
    pinnedAt: deck.pinnedAt ?? null,
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
    total: counts.active,
    archived: counts.archived,
    due: session.reviews.length + session.frontier.length,
    newCount: counts.newUnits,
    learning: counts.learningUnits,
    learned: counts.learned,
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
    // Today's introductions, reviews, and the settings are account-wide; read
    // them once and share them across every deck's session selection.
    const settings = new SettingsCache(ctx, library._id);
    const today = await introducedToday(ctx, library, now);
    const reviewsPerDay = (await settings.globalSettings()).reviewsPerDay;
    const shared: SessionReads = {
      today,
      settings,
      reviewsDoneToday:
        reviewsPerDay == null
          ? 0
          : await reviewsDoneToday(ctx, library, today.since, reviewsPerDay),
    };
    const out = [];
    for (const deck of decks) {
      if (!deck.staging) out.push(await deckStats(ctx, library, deck, now, shared));
    }
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
    return decks.filter((deck) => !deck.staging).map((deck) => ({ id: deck._id, name: deck.name }));
  },
});

export const get = query({
  args: { deckId: v.string(), now: v.optional(v.number()) },
  handler: async (ctx, { deckId }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const id = ctx.db.normalizeId("decks", deckId);
    const deck = id
      ? await ctx.db.get(id)
      : await ctx.db
          .query("decks")
          .withIndex("by_library_slug", (q) => q.eq("libraryId", library._id).eq("slug", deckId))
          .unique();
    if (!deck || deck.libraryId !== library._id || deck.staging) return null;
    return deckStats(ctx, library, deck, Date.now());
  },
});

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
    await checkCapacity(ctx, library._id, { decks: 1 });
    const now = Date.now();
    const id = await insertDeck(ctx, {
      libraryId: library._id,
      name: args.name,
      description: args.description,
      now,
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
    const version = await updateDeckDetails(ctx, deck, args, Date.now());
    await bumpRevision(ctx, library._id);
    return { status: "ok" as const, version };
  },
});

/**
 * Pins or unpins a deck in the sidebar. A display preference, not an edit: it
 * leaves the deck's version and the library revision alone, so an open rename
 * or graph edit never conflicts with it.
 */
export const setPinned = mutation({
  args: { deckId: v.id("decks"), pinned: v.boolean() },
  handler: async (ctx, { deckId, pinned }) => {
    const library = await writableLibrary(ctx);
    const deck = await ownedOrFail(ctx, library, deckId, "Deck");
    if (pinned === (deck.pinnedAt != null)) return { ok: true as const };
    await ctx.db.patch(deck._id, { pinnedAt: pinned ? Date.now() : undefined });
    return { ok: true as const };
  },
});

/** Removes the deck from active use at once, then cleans its rows in batches. */
export const remove = mutation({
  args: { deckId: v.id("decks") },
  handler: async (ctx, { deckId }) => {
    const library = await writableLibrary(ctx);
    const deck = await ctx.db.get(deckId);
    // Deleting something already gone is a no-op, so retries are safe.
    if (!deck || deck.libraryId !== library._id) return { ok: true as const };
    // Staging decks belong to an import that publishes or cleans them up itself.
    if (deck.staging) fail("CONFLICT", "This import is still finishing. Try again in a moment.");
    await deleteDeckCascade(ctx, deck);
    await bumpRevision(ctx, library._id);
    return { ok: true as const };
  },
});
