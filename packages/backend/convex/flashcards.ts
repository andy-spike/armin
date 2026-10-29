import { paginationOptsValidator, type PaginationOptions } from "convex/server";
import { v } from "convex/values";
import { mergedStream, stream, type QueryStream } from "convex-helpers/server/stream";
import { dueSortPriority, BROWSE_PAGE_SIZE, type BrowseSortKey } from "@armin/core/study";
import type { TypeAnswerContent } from "@armin/core/flashcard-types";
import { query, type QueryCtx } from "./_generated/server";
import { mutation } from "./functions";
import type { Doc, Id } from "./_generated/dataModel";
import {
  activeDeckIds,
  rowsInDecks,
  owned,
  ownedOrFail,
  readableLibrary,
  writableLibrary,
} from "./model/access";
import schema from "./schema";
import { checkCapacity } from "./model/usage";
import {
  deleteFlashcardCascade,
  editFlashcard,
  hydrateFlashcard,
  hydrateFromUnits,
  insertFlashcard,
  hydrateTile,
  moveFlashcard,
  setFlashcardArchived,
  validateFlashcardInput,
  type HydratedFlashcard,
  type ValidatedFlashcard,
} from "./model/flashcards";
import { bumpRevision, findRequest, parseFlashcard, recordRequest } from "./model/study";

export const listByDeck = query({
  args: { deckId: v.string(), now: v.optional(v.number()) },
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
    const flashcard = id ? await owned(ctx, library, id) : null;
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
    /** Rows to skip; older clients omit it and slice the first `limit` rows. */
    offset: v.optional(v.number()),
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
    const deckNames = new Map<Id<"decks">, string>();
    for (const deck of await ctx.db
      .query("decks")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .collect()) {
      deckNames.set(deck._id, deck.name);
    }
    const all = await rowsInDecks(ctx, "flashcards", deckNames.keys());
    const deckFilter = args.deckId ? ctx.db.normalizeId("decks", args.deckId) : null;
    const scoped = args.deckId ? all.filter((flashcard) => flashcard.deckId === deckFilter) : all;
    // One range per existing deck, rather than per card. Orphan payloads
    // must never consume this query's read budget during background cleanup.
    const unitsByFlashcard = new Map<Id<"flashcards">, Doc<"reviewUnits">[]>();
    for (const unit of await rowsInDecks(ctx, "reviewUnits", deckNames.keys())) {
      const list = unitsByFlashcard.get(unit.flashcardId);
      if (list) list.push(unit);
      else unitsByFlashcard.set(unit.flashcardId, [unit]);
    }
    const tagKeys = new Set((args.tags ?? []).map((tag) => tag.toLocaleLowerCase()));
    const libraryArchived = all.filter((flashcard) => flashcard.archived).length;
    const filtered: HydratedFlashcard[] = [];
    let filteredArchived = 0;
    for (const flashcard of scoped) {
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
    const offset = Math.max(args.offset ?? 0, 0);
    const limit = Math.min(Math.max(args.limit || BROWSE_PAGE_SIZE, 1), 500);
    return {
      flashcards: sorted.slice(offset, offset + limit),
      filteredTotal: filtered.length,
      filteredArchived,
      libraryTotal: all.length,
      libraryArchived,
    };
  },
});

type SummaryOrder = {
  field: "created" | "due" | "front" | "back" | "locked" | "state" | "deck";
  order: "asc" | "desc";
};

/**
 * Each Browse sort as an index walk. A descending sort reverses the whole
 * order, so ties within a group run Z to A; "due soon" orders scheduled cards
 * by due time, then new cards by creation, then locked cards.
 */
const BROWSE_ORDER: Record<BrowseSortKey, SummaryOrder> = {
  "due-soon": { field: "due", order: "asc" },
  "due-later": { field: "due", order: "desc" },
  "created-new": { field: "created", order: "desc" },
  "created-old": { field: "created", order: "asc" },
  "front-asc": { field: "front", order: "asc" },
  "front-desc": { field: "front", order: "desc" },
  "back-asc": { field: "back", order: "asc" },
  "back-desc": { field: "back", order: "desc" },
  "state-asc": { field: "state", order: "asc" },
  "state-desc": { field: "state", order: "desc" },
  "locked-first": { field: "locked", order: "desc" },
  "locked-last": { field: "locked", order: "asc" },
  "deck-asc": { field: "deck", order: "asc" },
  "deck-desc": { field: "deck", order: "desc" },
};

type Summary = Doc<"flashcardSummaries">;

function sortedSummaries(
  ctx: QueryCtx,
  deckIds: Id<"decks">[],
  sort: string,
): QueryStream<Summary> {
  const { field, order } = BROWSE_ORDER[sort as BrowseSortKey] ?? BROWSE_ORDER["created-new"];
  const rows = stream(ctx.db, schema).query("flashcardSummaries");
  const perDeck = deckIds.map((deckId) => {
    switch (field) {
      case "due":
        return rows.withIndex("by_deck_due", (q) => q.eq("deckId", deckId)).order(order);
      case "front":
        return rows.withIndex("by_deck_front", (q) => q.eq("deckId", deckId)).order(order);
      case "deck":
        return rows.withIndex("by_deck_name", (q) => q.eq("deckId", deckId)).order(order);
      case "back":
        return rows.withIndex("by_deck_back", (q) => q.eq("deckId", deckId)).order(order);
      case "locked":
        return rows.withIndex("by_deck_locked", (q) => q.eq("deckId", deckId)).order(order);
      case "state":
        return rows.withIndex("by_deck_state", (q) => q.eq("deckId", deckId)).order(order);
      default:
        return rows.withIndex("by_deck_created", (q) => q.eq("deckId", deckId)).order(order);
    }
  });
  const fields = {
    due: ["dueGroup", "due"],
    front: ["frontKey"],
    back: ["backKey"],
    locked: ["locked", "frontKey"],
    state: ["state", "frontKey"],
    deck: ["deckKey", "frontKey"],
    created: ["createdAt"],
  };
  // Walk only existing decks. Deleted-deck summaries may remain until bounded
  // cleanup finishes and must not consume Browse's read budget or appear in it.
  return mergedStream(perDeck, fields[field]);
}

const browseFilters = {
  state: v.optional(v.number()),
  deckId: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  search: v.optional(v.string()),
};

type BrowseFilters = { state?: number; tags?: string[]; search?: string };

/** The filter as a summary test, or null when nothing is filtered. */
function summaryMatcher({ state, tags, search }: BrowseFilters) {
  const tagKeys = new Set((tags ?? []).map((tag) => tag.toLocaleLowerCase()));
  const needle = search?.toLocaleLowerCase() ?? "";
  if (state === undefined && tagKeys.size === 0 && !needle) return null;
  return (summary: Summary) =>
    (tagKeys.size === 0 || summary.tagKeys.some((tag) => tagKeys.has(tag))) &&
    (state === undefined || (summary.stateMask & (1 << state)) !== 0) &&
    (!needle || summary.searchText.includes(needle));
}

/** The deck a Browse view is limited to: null for the library, false if not found. */
async function browseScope(ctx: QueryCtx, libraryId: Id<"libraries">, deckId?: string) {
  if (deckId === undefined) return null;
  const id = ctx.db.normalizeId("decks", deckId);
  const deck = id ? await ctx.db.get(id) : null;
  return deck && deck.libraryId === libraryId && !deck.staging ? deck._id : false;
}

type BrowsePageArgs = BrowseFilters & {
  deckId?: string;
  sort: string;
  paginationOpts: PaginationOptions & { endCursor?: string | null };
};

/** One page of a library's Browse view, walked through the summary index for the sort. */
export async function loadBrowsePage(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  args: BrowsePageArgs,
) {
  const scope = await browseScope(ctx, library._id, args.deckId);
  if (scope === false) return { page: [] as HydratedFlashcard[], isDone: true, continueCursor: "" };
  const deckIds = scope ? [scope] : [...(await activeDeckIds(ctx, library._id))];
  if (!deckIds.length) return { page: [] as HydratedFlashcard[], isDone: true, continueCursor: "" };
  const match = summaryMatcher(args);
  let rows = sortedSummaries(ctx, deckIds, args.sort);
  if (match) rows = rows.filterWith(async (summary) => match(summary));
  const result = await rows.paginate({
    ...args.paginationOpts,
    numItems: Math.min(Math.max(args.paginationOpts.numItems, 1), 100),
  });
  const deckNames = new Map<Id<"decks">, string>();
  const page: HydratedFlashcard[] = [];
  for (const summary of result.page) {
    const flashcard = await ctx.db.get(summary.flashcardId);
    if (!flashcard) continue;
    if (!deckNames.has(flashcard.deckId)) {
      deckNames.set(flashcard.deckId, (await ctx.db.get(flashcard.deckId))?.name ?? "");
    }
    page.push(hydrateTile(flashcard, summary, deckNames.get(flashcard.deckId)));
  }
  return { ...result, page };
}

/**
 * One page of Browse. Clients subscribe page by page with Convex cursors; a
 * filter skips non-matching rows without reading review units.
 */
export const browsePage = query({
  args: { paginationOpts: paginationOptsValidator, sort: v.string(), ...browseFilters },
  handler: async (ctx, args) => {
    const library = await readableLibrary(ctx);
    if (!library) return { page: [] as HydratedFlashcard[], isDone: true, continueCursor: "" };
    return loadBrowsePage(ctx, library, args);
  },
});

/** Totals for Browse's "N of M cards": counters, or a summary scan when filtered. */
export const browseCounts = query({
  args: browseFilters,
  handler: async (ctx, args) => {
    const library = await readableLibrary(ctx);
    const scope = library ? await browseScope(ctx, library._id, args.deckId) : false;
    if (!library || scope === false) return null;
    const counters = await ctx.db
      .query("deckCounters")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .collect();
    const sum = (rows: Doc<"deckCounters">[]) => ({
      total: rows.reduce((total, row) => total + row.flashcards, 0),
      archived: rows.reduce((total, row) => total + row.archivedFlashcards, 0),
    });
    const libraryCounts = sum(counters);
    const match = summaryMatcher(args);
    let filtered = scope ? sum(counters.filter((row) => row.deckId === scope)) : libraryCounts;
    if (match) {
      const deckIds = scope ? [scope] : [...(await activeDeckIds(ctx, library._id))];
      const summaries = (
        await Promise.all(
          deckIds.map((deckId) =>
            ctx.db
              .query("flashcardSummaries")
              .withIndex("by_deck_created", (q) => q.eq("deckId", deckId))
              .collect(),
          ),
        )
      ).flat();
      const matching = summaries.filter(match);
      filtered = {
        total: matching.length,
        archived: matching.filter((summary) => summary.archived).length,
      };
    }
    return {
      filteredTotal: filtered.total,
      filteredArchived: filtered.archived,
      libraryTotal: libraryCounts.total,
      libraryArchived: libraryCounts.archived,
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
    const decks = await activeDeckIds(ctx, library._id);
    const flashcards = await rowsInDecks(ctx, "flashcards", decks);
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
    if (!deck || deck.libraryId !== library._id || deck.staging) return null;
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
    await checkCapacity(ctx, library._id, { flashcards: 1 });
    const input = validateFlashcardInput(args.type, args.content);
    const now = Date.now();
    const id = await insertFlashcard(ctx, {
      libraryId: library._id,
      deckId: deck._id,
      input,
      tags: args.tags ?? [],
      now,
    });
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
    let input: ValidatedFlashcard | undefined;
    if (args.content !== undefined || args.type !== undefined) {
      const current = parseFlashcard(flashcard);
      input = validateFlashcardInput(args.type ?? current.type, args.content ?? current.content);
    }
    const version = await editFlashcard(ctx, flashcard, { input, tags: args.tags }, Date.now());
    await bumpRevision(ctx, library._id);
    return { status: "ok", version };
  },
});

export const remove = mutation({
  args: { flashcardId: v.id("flashcards") },
  handler: async (ctx, { flashcardId }) => {
    const library = await writableLibrary(ctx);
    const flashcard = await owned(ctx, library, flashcardId);
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
    const version = await setFlashcardArchived(ctx, flashcard, archived, Date.now());
    await bumpRevision(ctx, library._id);
    return { version };
  },
});

export const deleteConsequences = query({
  args: { flashcardId: v.id("flashcards") },
  handler: async (ctx, { flashcardId }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const flashcard = await owned(ctx, library, flashcardId);
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
    const flashcard = await owned(ctx, library, flashcardId);
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

/** Move a flashcard to another deck, removing its prerequisite links (see `moveFlashcard`). */
export const move = mutation({
  args: { flashcardId: v.id("flashcards"), targetDeckId: v.id("decks") },
  handler: async (ctx, { flashcardId, targetDeckId }) => {
    const library = await writableLibrary(ctx);
    const flashcard = await ownedOrFail(ctx, library, flashcardId, "Flashcard");
    const target = await ownedOrFail(ctx, library, targetDeckId, "Deck");
    if (flashcard.deckId === target._id) return { version: flashcard.version };
    const version = await moveFlashcard(ctx, flashcard, target._id, Date.now());
    await bumpRevision(ctx, library._id);
    return { version };
  },
});
