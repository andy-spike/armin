import { v } from "convex/values";
import { generateReviewUnits } from "@armin/core/flashcard-types";
import { pickFsrsFieldsMs, PENDING_DUE, type FsrsFieldsMs } from "@armin/core/scheduler";
import { internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { fsrsSnapshot } from "./schema";
import { readableLibrary, writableLibrary } from "./model/access";
import { deleteDeckCascade } from "./model/deletion";
import { fail } from "./model/errors";
import { insertFlashcard, validateFlashcardInput } from "./model/flashcards";
import { MAX_DECKS, MAX_FLASHCARDS, MAX_NAME_CHARS, MAX_REVIEW_UNITS } from "./model/limits";
import { bumpRevision, findRequest, recordRequest, type TagCache } from "./model/study";

// Per-call caps keep every mutation inside Convex's write and read limits even
// when each card is a 60-deletion cloze.
const MAX_CARDS_PER_CALL = 100;
const MAX_UNITS_PER_CALL = 1500;
const MAX_LOGS_PER_CALL = 1000;
/** Review history has no library quota, so an import bounds it itself. */
const MAX_IMPORT_REVIEW_LOGS = 300_000;
/** A running import that makes no progress for this long is treated as abandoned. */
const ABANDON_AFTER_MS = 60 * 60_000;
/** Finished, cancelled, and failed import records are kept this long. */
const RECORD_RETENTION_MS = 30 * 24 * 3_600_000;
const DAY_MS = 24 * 3_600_000;

const counts = v.object({
  flashcards: v.number(),
  reviewUnits: v.number(),
  reviewLogs: v.number(),
});

function view(row: Doc<"imports">) {
  return {
    id: row._id,
    status: row.status,
    fileName: row.fileName,
    decks: row.decks,
    totals: row.totals,
    counts: row.counts,
    error: row.error ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function wholeNumber(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) fail("INVALID", `${label} must be a whole number.`);
  return value;
}

/** A repeated request id returns the first outcome, but only for the same operation. */
async function replay(
  ctx: MutationCtx,
  libraryId: Id<"libraries">,
  requestId: string,
  kind: string,
) {
  const previous = await findRequest(ctx, libraryId, requestId);
  if (!previous) return null;
  if (previous.kind !== kind)
    fail("INVALID", "This request ID was already used for a different operation.");
  return previous.result;
}

async function runningImport(ctx: MutationCtx, library: Doc<"libraries">, importId: Id<"imports">) {
  const row = await ownedImport(ctx, library, importId);
  if (row.status === "finished") fail("CONFLICT", "This import already finished.");
  if (row.status !== "running") fail("CONFLICT", "This import was cancelled.");
  for (const { deckId } of row.decks) {
    const deck = await ctx.db.get(deckId);
    if (!deck || deck.libraryId !== library._id)
      fail("CONFLICT", "An imported deck was deleted. Cancel this import and start again.");
  }
  return row;
}

async function reviewUnitTotal(ctx: Pick<QueryCtx, "db">, libraryId: Id<"libraries">) {
  const counter = await ctx.db
    .query("libraryCounters")
    .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
    .unique();
  if (counter?.reviewUnits !== undefined) return counter.reviewUnits;
  // Libraries created before the counter existed: count once.
  return (
    await ctx.db
      .query("reviewUnits")
      .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
      .collect()
  ).length;
}

function checkSchedule(schedule: FsrsFieldsMs, now: number, label: string) {
  const bad = (reason: string) => fail("INVALID", `${label}: ${reason}`);
  const numbers = [
    schedule.due,
    schedule.stability,
    schedule.difficulty,
    schedule.elapsedDays,
    schedule.scheduledDays,
    schedule.learningSteps,
    schedule.reps,
    schedule.lapses,
    schedule.state,
  ];
  if (!numbers.every(Number.isFinite)) bad("schedule values must be finite numbers.");
  if (![0, 1, 2, 3].includes(schedule.state)) bad("state must be 0 to 3.");
  for (const count of [schedule.learningSteps, schedule.reps, schedule.lapses])
    if (!Number.isInteger(count) || count < 0) bad("counts must be whole numbers.");
  for (const amount of [
    schedule.stability,
    schedule.difficulty,
    schedule.elapsedDays,
    schedule.scheduledDays,
  ])
    if (amount < 0) bad("schedule values cannot be negative.");
  if (schedule.due < 0 || schedule.due > now + 200 * 365 * DAY_MS) bad("due date is out of range.");
  if (schedule.lastReview !== null) {
    if (!Number.isFinite(schedule.lastReview) || schedule.lastReview < 0)
      bad("last review is out of range.");
    // A little slack for a client clock that runs ahead of the server.
    if (schedule.lastReview > now + DAY_MS) bad("last review is in the future.");
  } else if (schedule.reps === 0 && schedule.due >= PENDING_DUE.getTime()) {
    // The app reads this exact shape as "waiting on prerequisites".
    bad("a never-reviewed card cannot be due that far ahead.");
  }
}

function cleanDeckName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) fail("INVALID", "Deck name is required.");
  if (trimmed.length > MAX_NAME_CHARS)
    fail("INVALID", `Deck names are limited to ${MAX_NAME_CHARS} characters.`);
  return trimmed;
}

/**
 * Begin an import: reject plans that cannot fit the beta limits, then create
 * one deck per plan deck. Cards and history follow in `addCards` and
 * `addReviewLogs`; `finish` closes the import and `cancel` removes what it made.
 */
export const start = mutation({
  args: {
    requestId: v.string(),
    fileName: v.string(),
    decks: v.array(v.object({ key: v.string(), name: v.string() })),
    totals: counts,
  },
  handler: async (ctx, args) => {
    const library = await writableLibrary(ctx);
    const previous = await replay(ctx, library._id, args.requestId, "imports.start");
    if (previous) return previous as { importId: Id<"imports">; decks: StartedDeck[] };

    if (args.decks.length === 0) fail("INVALID", "There are no decks to import.");
    if (args.decks.length > MAX_DECKS)
      fail("QUOTA", `The beta allows ${MAX_DECKS} decks, and this file has ${args.decks.length}.`);
    const keys = new Set(args.decks.map((deck) => deck.key));
    if (keys.has("") || keys.size !== args.decks.length)
      fail("INVALID", "Each deck needs a unique key.");
    const names = args.decks.map((deck) => cleanDeckName(deck.name));
    const totals = {
      flashcards: wholeNumber(args.totals.flashcards, "Card total"),
      reviewUnits: wholeNumber(args.totals.reviewUnits, "Review unit total"),
      reviewLogs: wholeNumber(args.totals.reviewLogs, "Review history total"),
    };
    if (totals.reviewLogs > MAX_IMPORT_REVIEW_LOGS)
      fail(
        "QUOTA",
        `An import can carry at most ${MAX_IMPORT_REVIEW_LOGS} past reviews. Import without review history instead.`,
      );

    const running = await ctx.db
      .query("imports")
      .withIndex("by_library_status", (q) => q.eq("libraryId", library._id).eq("status", "running"))
      .first();
    if (running)
      fail(
        "CONFLICT",
        "Another import is still in progress. Wait for it to finish or cancel it first.",
      );

    const [decks, flashcards, reviewUnits] = await Promise.all([
      ctx.db
        .query("decks")
        .withIndex("by_library", (q) => q.eq("libraryId", library._id))
        .take(MAX_DECKS + 1),
      ctx.db
        .query("flashcards")
        .withIndex("by_library", (q) => q.eq("libraryId", library._id))
        .take(MAX_FLASHCARDS + 1),
      reviewUnitTotal(ctx, library._id),
    ]);
    if (decks.length + names.length > MAX_DECKS)
      fail(
        "QUOTA",
        `This import adds ${names.length} decks, but the beta allows ${MAX_DECKS} and you have ${decks.length}.`,
      );
    if (flashcards.length + totals.flashcards > MAX_FLASHCARDS)
      fail(
        "QUOTA",
        `This import adds ${totals.flashcards} cards, but the beta allows ${MAX_FLASHCARDS} and you have ${flashcards.length}.`,
      );
    if (reviewUnits + totals.reviewUnits > MAX_REVIEW_UNITS)
      fail(
        "QUOTA",
        `This import adds ${totals.reviewUnits} review items, but the beta allows ${MAX_REVIEW_UNITS} and you have ${reviewUnits}.`,
      );

    const now = Date.now();
    const created: StartedDeck[] = [];
    for (const [index, deck] of args.decks.entries()) {
      const deckId = await ctx.db.insert("decks", {
        libraryId: library._id,
        name: names[index]!,
        description: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      created.push({ key: deck.key, deckId });
    }
    const importId = await ctx.db.insert("imports", {
      libraryId: library._id,
      status: "running",
      fileName: args.fileName.trim().slice(0, 255),
      decks: created,
      totals,
      counts: { flashcards: 0, reviewUnits: 0, reviewLogs: 0 },
      createdAt: now,
      updatedAt: now,
    });
    await bumpRevision(ctx, library._id);
    const result = { importId, decks: created };
    await recordRequest(ctx, library._id, args.requestId, "imports.start", result, now);
    return result;
  },
});

type StartedDeck = { key: string; deckId: Id<"decks"> };

/**
 * Add up to 100 flashcards (and 1,500 review items) to a running import. The
 * batch is all-or-nothing. A unit's `schedule` replaces its new-card state; a
 * `subKey` the card doesn't generate is ignored.
 */
export const addCards = mutation({
  args: {
    importId: v.id("imports"),
    requestId: v.string(),
    cards: v.array(
      v.object({
        key: v.string(),
        deckKey: v.string(),
        type: v.string(),
        content: v.any(),
        tags: v.array(v.string()),
        archived: v.boolean(),
        units: v.array(v.object({ subKey: v.string(), schedule: v.union(v.null(), fsrsSnapshot) })),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const library = await writableLibrary(ctx);
    const previous = await replay(ctx, library._id, args.requestId, "imports.addCards");
    if (previous) return previous as { cards: { key: string; flashcardId: Id<"flashcards"> }[] };
    const row = await runningImport(ctx, library, args.importId);

    if (args.cards.length === 0 || args.cards.length > MAX_CARDS_PER_CALL)
      fail("INVALID", `Send between 1 and ${MAX_CARDS_PER_CALL} cards per call.`);
    const now = Date.now();
    const deckIds = new Map(row.decks.map((deck) => [deck.key, deck.deckId]));
    const keys = new Set<string>();
    let unitCount = 0;
    const parsed = args.cards.map((card) => {
      if (keys.has(card.key)) fail("INVALID", "Each card key must be unique within the call.");
      keys.add(card.key);
      const deckId = deckIds.get(card.deckKey);
      if (!deckId) fail("INVALID", "A card names a deck that is not part of this import.");
      const input = validateFlashcardInput(card.type, card.content);
      unitCount += generateReviewUnits(input.type, input.content).length;
      const subKeys = new Set<string>();
      for (const unit of card.units) {
        if (subKeys.has(unit.subKey)) fail("INVALID", "Each review item may appear once per card.");
        subKeys.add(unit.subKey);
        if (unit.schedule) checkSchedule(unit.schedule, now, "Imported schedule");
      }
      return { card, deckId, input };
    });
    if (unitCount > MAX_UNITS_PER_CALL)
      fail("INVALID", `Send at most ${MAX_UNITS_PER_CALL} review items per call.`);

    // Library limits can change while a long import runs, so check them again.
    const existing = await ctx.db
      .query("flashcards")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .take(MAX_FLASHCARDS + 1);
    if (existing.length + parsed.length > MAX_FLASHCARDS)
      fail("QUOTA", `The beta allows ${MAX_FLASHCARDS} flashcards per account.`);

    // A deck deleted mid-import (from another tab) would leave its cards with no deck.
    for (const deckId of new Set(parsed.map((item) => item.deckId))) {
      const deck = await ctx.db.get(deckId);
      if (!deck || deck.libraryId !== library._id)
        fail("CONFLICT", "A deck this import created was deleted. Start the import again.");
    }

    const added: { key: string; flashcardId: Id<"flashcards"> }[] = [];
    let addedUnits = 0;
    const tagCache: TagCache = new Map();
    for (const { card, deckId, input } of parsed) {
      // An accepted review proves access, so reviewed cards keep it for good.
      const studied = card.units.some(
        (unit) => unit.schedule && (unit.schedule.reps > 0 || unit.schedule.lastReview !== null),
      );
      const flashcardId = await insertFlashcard(ctx, {
        libraryId: library._id,
        deckId,
        input,
        tags: card.tags,
        archived: card.archived,
        prerequisiteAccessGranted: studied,
        now,
        tagCache,
      });
      const units = await ctx.db
        .query("reviewUnits")
        .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcardId))
        .collect();
      const bySubKey = new Map(units.map((unit) => [unit.subKey, unit]));
      for (const unit of card.units) {
        const target = unit.schedule ? bySubKey.get(unit.subKey) : undefined;
        if (target && unit.schedule)
          await ctx.db.patch(target._id, pickFsrsFieldsMs(unit.schedule));
      }
      addedUnits += units.length;
      added.push({ key: card.key, flashcardId });
    }

    const next = {
      flashcards: row.counts.flashcards + added.length,
      reviewUnits: row.counts.reviewUnits + addedUnits,
      reviewLogs: row.counts.reviewLogs,
    };
    if (next.flashcards > row.totals.flashcards || next.reviewUnits > row.totals.reviewUnits)
      fail("INVALID", "This import received more cards than it declared when it started.");
    await ctx.db.patch(row._id, { counts: next, updatedAt: now });
    await bumpRevision(ctx, library._id);
    const result = { cards: added };
    await recordRequest(ctx, library._id, args.requestId, "imports.addCards", result, now);
    return result;
  },
});

/**
 * Add up to 1,000 past reviews for cards this import created. They are history
 * only: they never change a unit's schedule, and `unitVersionAfter: 0` can never
 * match a unit (versions start at 1), so Undo refuses them.
 */
export const addReviewLogs = mutation({
  args: {
    importId: v.id("imports"),
    requestId: v.string(),
    logs: v.array(
      v.object({
        flashcardId: v.id("flashcards"),
        subKey: v.string(),
        rating: v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4)),
        review: v.number(),
        before: fsrsSnapshot,
        after: fsrsSnapshot,
      }),
    ),
  },
  handler: async (ctx, args) => {
    const library = await writableLibrary(ctx);
    const previous = await replay(ctx, library._id, args.requestId, "imports.addReviewLogs");
    if (previous) return previous as { added: number };
    const row = await runningImport(ctx, library, args.importId);

    if (args.logs.length === 0 || args.logs.length > MAX_LOGS_PER_CALL)
      fail("INVALID", `Send between 1 and ${MAX_LOGS_PER_CALL} reviews per call.`);
    if (row.counts.reviewLogs + args.logs.length > row.totals.reviewLogs)
      fail("INVALID", "This import received more reviews than it declared when it started.");

    const now = Date.now();
    const deckIds = new Set<Id<"decks">>(row.decks.map((deck) => deck.deckId));
    const cards = new Map<Id<"flashcards">, Map<string, Doc<"reviewUnits">>>();
    for (const log of args.logs) {
      let units = cards.get(log.flashcardId);
      if (!units) {
        const flashcard = await ctx.db.get(log.flashcardId);
        if (!flashcard || flashcard.libraryId !== library._id || !deckIds.has(flashcard.deckId))
          fail("NOT_FOUND", "A review names a card that is not part of this import.");
        units = new Map(
          (
            await ctx.db
              .query("reviewUnits")
              .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcard._id))
              .collect()
          ).map((unit) => [unit.subKey, unit]),
        );
        cards.set(log.flashcardId, units);
      }
      const unit = units.get(log.subKey);
      if (!unit) fail("INVALID", "A review names a review item its card does not have.");
      checkSchedule(log.before, now, "Review before-state");
      checkSchedule(log.after, now, "Review after-state");
      if (!Number.isFinite(log.review) || log.review < 0 || log.review > now + DAY_MS)
        fail("INVALID", "A review time is out of range.");
      // Same columns `review.rate` stores: the state the card was in going into
      // the review, plus the elapsed days the review itself measured.
      await ctx.db.insert("reviewLogs", {
        libraryId: library._id,
        deckId: unit.deckId,
        flashcardId: unit.flashcardId,
        reviewUnitId: unit._id,
        rating: log.rating,
        state: log.before.state,
        due: log.before.lastReview ?? log.before.due,
        stability: log.before.stability,
        difficulty: log.before.difficulty,
        elapsedDays: log.after.elapsedDays,
        lastElapsedDays: log.before.elapsedDays,
        scheduledDays: log.before.scheduledDays,
        learningSteps: log.before.learningSteps,
        review: log.review,
        before: pickFsrsFieldsMs(log.before),
        unitVersionAfter: 0,
      });
    }
    await ctx.db.patch(row._id, {
      counts: { ...row.counts, reviewLogs: row.counts.reviewLogs + args.logs.length },
      updatedAt: now,
    });
    await bumpRevision(ctx, library._id);
    const result = { added: args.logs.length };
    await recordRequest(ctx, library._id, args.requestId, "imports.addReviewLogs", result, now);
    return result;
  },
});

/** Close a running import once every declared card and review has arrived. */
export const finish = mutation({
  args: { importId: v.id("imports") },
  handler: async (ctx, { importId }) => {
    const library = await writableLibrary(ctx);
    const row = await ownedImport(ctx, library, importId);
    // Finishing twice is a no-op, so a retried call is safe.
    if (row.status === "finished") return view(row);
    await runningImport(ctx, library, importId);
    if (
      row.counts.flashcards !== row.totals.flashcards ||
      row.counts.reviewLogs !== row.totals.reviewLogs
    )
      fail(
        "INVALID",
        `The import is incomplete: ${row.counts.flashcards} of ${row.totals.flashcards} cards and ${row.counts.reviewLogs} of ${row.totals.reviewLogs} reviews arrived.`,
      );
    // Imported cards have no prerequisites, so no lock needs refreshing.
    await ctx.db.patch(row._id, { status: "finished", updatedAt: Date.now() });
    await bumpRevision(ctx, library._id);
    return view({ ...row, status: "finished" });
  },
});

async function ownedImport(ctx: MutationCtx, library: Doc<"libraries">, importId: Id<"imports">) {
  const row = await ctx.db.get(importId);
  if (!row || row.libraryId !== library._id) fail("NOT_FOUND", "Import not found.");
  return row;
}

/**
 * Delete the first of an import's decks that still exists. Returns whether
 * another remains, so callers can schedule the next one.
 */
async function removeNextDeck(ctx: MutationCtx, row: Doc<"imports">) {
  let removed = false;
  for (const { deckId } of row.decks) {
    const deck = await ctx.db.get(deckId);
    if (!deck || deck.libraryId !== row.libraryId) continue;
    if (removed) return true;
    await deleteDeckCascade(ctx, deck);
    removed = true;
  }
  return false;
}

/** Remove a cancelled or failed import's decks, one deck per transaction. */
export const removeDecks = internalMutation({
  args: { importId: v.id("imports") },
  handler: async (ctx, { importId }) => {
    const row = await ctx.db.get(importId);
    if (!row || (row.status !== "cancelled" && row.status !== "failed")) return;
    const more = await removeNextDeck(ctx, row);
    await bumpRevision(ctx, row.libraryId);
    if (more) await ctx.scheduler.runAfter(0, internal.imports.removeDecks, { importId });
  },
});

/**
 * Stop a running import and delete every deck it created, with their cards,
 * review items, and history. The import stops accepting batches immediately;
 * decks are removed right after, one per transaction, so even a 200-deck
 * import stays within Convex limits.
 */
export const cancel = mutation({
  args: { importId: v.id("imports"), reason: v.optional(v.string()) },
  handler: async (ctx, { importId, reason }) => {
    const library = await writableLibrary(ctx);
    const row = await ownedImport(ctx, library, importId);
    if (row.status === "finished")
      fail("CONFLICT", "This import already finished. Delete its decks instead.");
    if (row.status !== "running") return view(row);
    const patch = {
      status: "cancelled" as const,
      updatedAt: Date.now(),
      ...(reason ? { error: reason.slice(0, 500) } : {}),
    };
    // Decks are removed in their own transactions, so a large deck can't make
    // the cancel itself fail and leave the import running.
    await ctx.db.patch(row._id, patch);
    await ctx.scheduler.runAfter(0, internal.imports.removeDecks, { importId });
    await bumpRevision(ctx, library._id);
    return view({ ...row, ...patch });
  },
});

export const get = query({
  args: { importId: v.string() },
  handler: async (ctx, { importId }) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const id = ctx.db.normalizeId("imports", importId);
    const row = id ? await ctx.db.get(id) : null;
    if (!row || row.libraryId !== library._id) return null;
    return view(row);
  },
});

/** What the library already holds, so an import preview can check the beta limits up front. */
export const usage = query({
  args: {},
  handler: async (ctx) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const [decks, flashcards, reviewUnits] = await Promise.all([
      ctx.db
        .query("decks")
        .withIndex("by_library", (q) => q.eq("libraryId", library._id))
        .take(MAX_DECKS + 1),
      ctx.db
        .query("flashcards")
        .withIndex("by_library", (q) => q.eq("libraryId", library._id))
        .take(MAX_FLASHCARDS + 1),
      reviewUnitTotal(ctx, library._id),
    ]);
    return {
      decks: decks.length,
      flashcards: flashcards.length,
      reviewUnits,
      limits: {
        decks: MAX_DECKS,
        flashcards: MAX_FLASHCARDS,
        reviewUnits: MAX_REVIEW_UNITS,
        reviewLogs: MAX_IMPORT_REVIEW_LOGS,
      },
    };
  },
});

/** The import still running, if any, so a client can resume or cancel it. */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const row = await ctx.db
      .query("imports")
      .withIndex("by_library_status", (q) => q.eq("libraryId", library._id).eq("status", "running"))
      .first();
    return row ? view(row) : null;
  },
});

/**
 * Cron: fail running imports that stopped making progress (a closed tab) and
 * remove their decks, and forget old import records. Bounded per run.
 */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const stale = await ctx.db
      .query("imports")
      .withIndex("by_status_updated", (q) =>
        q.eq("status", "running").lt("updatedAt", now - ABANDON_AFTER_MS),
      )
      .take(20);
    for (const row of stale) {
      await ctx.db.patch(row._id, {
        status: "failed",
        error: "The import stopped making progress and was removed.",
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.imports.removeDecks, { importId: row._id });
    }
    for (const status of ["finished", "cancelled", "failed"] as const) {
      const old = await ctx.db
        .query("imports")
        .withIndex("by_status_updated", (q) =>
          q.eq("status", status).lt("updatedAt", now - RECORD_RETENTION_MS),
        )
        .take(100);
      // A failed import may still be removing decks; the record is long gone by then.
      for (const row of old) await ctx.db.delete(row._id);
    }
  },
});
