import { Triggers } from "convex-helpers/server/triggers";
import { flashcardDisplay, type TypeAnswerContent } from "@armin/core/flashcard-types";
import { State } from "@armin/core/scheduler";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { parseFlashcard } from "./study";

/*
 * Browse summaries and deck counters are derived data. Triggers note which
 * flashcards a mutation touched; when the mutation's handler succeeds, each
 * touched flashcard's summary is rebuilt once, in the same transaction, and
 * the summary's change moves the deck counters by its difference. Every
 * mutation gets this through `convex/functions.ts`.
 */

type SummaryCtx = MutationCtx & { touchedFlashcards: Set<Id<"flashcards">> };

/** Lowercase, accent-free, single-spaced, and short enough for an index key. */
export function sortKey(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

const KEY_FIELDS = [
  "type",
  "content",
  "tags",
  "locked",
  "archived",
  "deckId",
  "createdAt",
] as const satisfies (keyof Doc<"flashcards">)[];

const UNIT_FIELDS = [
  "state",
  "due",
  "locked",
  "archived",
  "flashcardId",
] as const satisfies (keyof Doc<"reviewUnits">)[];

function changed<T extends object>(a: T | null, b: T | null, fields: readonly (keyof T)[]) {
  if (!a || !b) return true;
  return fields.some((field) => JSON.stringify(a[field]) !== JSON.stringify(b[field]));
}

export const triggers = new Triggers<DataModel, SummaryCtx>();

triggers.register("flashcards", async (ctx, change) => {
  if (changed(change.oldDoc, change.newDoc, KEY_FIELDS)) ctx.touchedFlashcards.add(change.id);
});

triggers.register("reviewUnits", async (ctx, change) => {
  if (!changed(change.oldDoc, change.newDoc, UNIT_FIELDS)) return;
  for (const unit of [change.oldDoc, change.newDoc]) {
    if (unit) ctx.touchedFlashcards.add(unit.flashcardId);
  }
});

triggers.register("decks", async (ctx, change) => {
  if (change.operation === "delete") {
    const counters = await ctx.innerDb
      .query("deckCounters")
      .withIndex("by_deck", (q) => q.eq("deckId", change.id))
      .unique();
    if (counters) await ctx.innerDb.delete(counters._id);
    return;
  }
  if (change.operation !== "update" || change.oldDoc.name === change.newDoc.name) return;
  const deckKey = sortKey(change.newDoc.name);
  const summaries = await ctx.innerDb
    .query("flashcardSummaries")
    .withIndex("by_deck_created", (q) => q.eq("deckId", change.id))
    .collect();
  for (const summary of summaries) await ctx.innerDb.patch(summary._id, { deckKey });
});

triggers.register("flashcardSummaries", async (ctx, change) => {
  const before = change.oldDoc && contribution(change.oldDoc);
  const after = change.newDoc && contribution(change.newDoc);
  if (change.oldDoc && change.newDoc && change.oldDoc.deckId === change.newDoc.deckId) {
    await adjustCounters(ctx, change.newDoc, combine(after!, before!, -1));
    return;
  }
  if (change.oldDoc) await adjustCounters(ctx, change.oldDoc, combine(zero(), before!, -1));
  if (change.newDoc) await adjustCounters(ctx, change.newDoc, after!);
});

type Counts = Omit<Doc<"deckCounters">, "_id" | "_creationTime" | "libraryId" | "deckId">;

function zero(): Counts {
  return {
    flashcards: 0,
    archivedFlashcards: 0,
    active: 0,
    archived: 0,
    learned: 0,
    newUnits: 0,
    learningUnits: 0,
  };
}

/** What one flashcard adds to its deck's counters. */
function contribution(summary: Doc<"flashcardSummaries">): Counts {
  const hasUnits = summary.units > 0;
  return {
    flashcards: 1,
    archivedFlashcards: summary.archived ? 1 : 0,
    active: !summary.archived && hasUnits ? 1 : 0,
    archived: summary.archived && hasUnits ? 1 : 0,
    // Learned only when every unit is in Review: both directions, every gap.
    learned: !summary.archived && summary.stateMask === 1 << State.Review ? 1 : 0,
    newUnits: summary.archived ? 0 : summary.newUnits,
    learningUnits: summary.archived ? 0 : summary.learningUnits,
  };
}

/** Counters for a set of summaries, for repairs. */
export function countSummaries(summaries: Doc<"flashcardSummaries">[]) {
  return summaries.reduce((total, summary) => combine(total, contribution(summary), 1), zero());
}

function combine(a: Counts, b: Counts, sign: 1 | -1) {
  const out = zero();
  for (const key of Object.keys(out) as (keyof Counts)[]) out[key] = a[key] + sign * b[key];
  return out;
}

async function adjustCounters(
  ctx: SummaryCtx & { innerDb: MutationCtx["db"] },
  summary: Doc<"flashcardSummaries">,
  delta: Counts,
) {
  if (Object.values(delta).every((value) => value === 0)) return;
  const counters = await ctx.innerDb
    .query("deckCounters")
    .withIndex("by_deck", (q) => q.eq("deckId", summary.deckId))
    .unique();
  if (!counters) {
    // A deck deleted in this mutation already dropped its counters.
    if (!(await ctx.innerDb.get(summary.deckId))) return;
    await ctx.innerDb.insert("deckCounters", {
      libraryId: summary.libraryId,
      deckId: summary.deckId,
      ...delta,
    });
    return;
  }
  const next = { ...counters };
  for (const key of Object.keys(delta) as (keyof Counts)[]) next[key] += delta[key];
  const { _id, _creationTime, ...fields } = next;
  await ctx.innerDb.patch(_id, fields);
}

function searchExtraText(type: string, content: unknown) {
  if (type !== "type_answer") return "";
  return (content as TypeAnswerContent).acceptedAnswers.join("\n");
}

/** The summary a flashcard and its units should have right now. */
function summaryFor(
  flashcard: Doc<"flashcards">,
  units: Doc<"reviewUnits">[],
  deckName: string,
): Omit<Doc<"flashcardSummaries">, "_id" | "_creationTime"> {
  const { type, content } = parseFlashcard(flashcard);
  const display = flashcardDisplay(type, content);
  let state = units.length > 0 ? units[0].state : State.New;
  let due = units.length > 0 ? units[0].due : flashcard.createdAt;
  let stateMask = 0;
  let newUnits = 0;
  let learningUnits = 0;
  for (const unit of units) {
    if (unit.state < state) state = unit.state;
    if (unit.due < due) due = unit.due;
    stateMask |= 1 << unit.state;
    if (unit.archived) continue;
    if (unit.state === State.New) newUnits += 1;
    if (unit.state === State.Learning || unit.state === State.Relearning) learningUnits += 1;
  }
  return {
    libraryId: flashcard.libraryId,
    deckId: flashcard.deckId,
    flashcardId: flashcard._id,
    createdAt: flashcard.createdAt,
    locked: flashcard.locked,
    archived: flashcard.archived,
    tagKeys: flashcard.tags.map((tag) => tag.toLocaleLowerCase()),
    frontKey: sortKey(display.front),
    backKey: sortKey(display.back),
    deckKey: sortKey(deckName),
    searchText:
      `${display.front}\n${display.back}\n${flashcard.tags.join(" ")}\n${searchExtraText(type, content)}`.toLocaleLowerCase(),
    state,
    due,
    dueGroup: flashcard.locked ? 2 : state === State.New ? 1 : 0,
    stateMask,
    units: units.length,
    newUnits,
    learningUnits,
  };
}

/** Rebuild one flashcard's summary; `db` must fire the counter trigger. */
export async function syncSummary(
  db: MutationCtx["db"],
  flashcardId: Id<"flashcards">,
  deckNames = new Map<Id<"decks">, string>(),
) {
  const existing = await db
    .query("flashcardSummaries")
    .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcardId))
    .unique();
  const flashcard = await db.get(flashcardId);
  if (!flashcard) {
    if (existing) await db.delete(existing._id);
    return;
  }
  if (!deckNames.has(flashcard.deckId)) {
    deckNames.set(flashcard.deckId, (await db.get(flashcard.deckId))?.name ?? "");
  }
  const units = await db
    .query("reviewUnits")
    .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcardId))
    .collect();
  const next = summaryFor(flashcard, units, deckNames.get(flashcard.deckId)!);
  if (!existing) {
    await db.insert("flashcardSummaries", next);
    return;
  }
  const differs = (Object.keys(next) as (keyof typeof next)[]).some(
    (key) => JSON.stringify(next[key]) !== JSON.stringify(existing[key]),
  );
  if (differs) await db.patch(existing._id, next);
}

/**
 * Wrap a mutation context so its writes are tracked, and return the step that
 * rebuilds the touched summaries once the handler has finished.
 */
export function withSummaries<C extends MutationCtx>(ctx: C) {
  const touchedFlashcards = new Set<Id<"flashcards">>();
  const wrapped = triggers.wrapDB({ ...ctx, touchedFlashcards });
  return {
    db: wrapped.db,
    flush: async () => {
      const deckNames = new Map<Id<"decks">, string>();
      // Rebuilding writes summaries only, so it never touches more flashcards.
      for (const flashcardId of touchedFlashcards) {
        await syncSummary(wrapped.db, flashcardId, deckNames);
      }
    },
  };
}
