import { v } from "convex/values";
import { State } from "@armin/core/scheduler";
import { query, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import type { Doc } from "./_generated/dataModel";
import { ownedOrFail, readableLibrary, writableLibrary } from "./model/access";
import { fail } from "./model/errors";
import { MAX_DECKS, MAX_DESCRIPTION_CHARS, MAX_NAME_CHARS } from "./model/limits";
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
    description: deck.description,
    version: deck.version,
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
    for (const deck of decks) out.push(await deckStats(ctx, library, deck, now, shared));
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

/** Removes the deck from active use at once, then cleans its rows in batches. */
export const remove = mutation({
  args: { deckId: v.id("decks") },
  handler: async (ctx, { deckId }) => {
    const library = await writableLibrary(ctx);
    const deck = await ctx.db.get(deckId);
    // Deleting something already gone is a no-op, so retries are safe.
    if (!deck || deck.libraryId !== library._id) return { ok: true as const };
    await deleteDeckCascade(ctx, deck);
    await bumpRevision(ctx, library._id);
    return { ok: true as const };
  },
});
