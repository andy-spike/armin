import { isPendingSchedule, State } from "@armin/core/scheduler";
import { selectFrontier, startOfStudyDayMs } from "@armin/core/study";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { activeDeckIds } from "./access";
import { parseFlashcard, SettingsCache } from "./study";

/** Queue-shaped items for the review and cram renderers. */
export async function toQueueItems(ctx: QueryCtx, units: Doc<"reviewUnits">[]) {
  const flashcards = new Map<Id<"flashcards">, Doc<"flashcards"> | null>();
  const decks = new Map<Id<"decks">, string>();
  const items = [];
  for (const unit of units) {
    if (!flashcards.has(unit.flashcardId)) {
      flashcards.set(unit.flashcardId, await ctx.db.get(unit.flashcardId));
    }
    const flashcard = flashcards.get(unit.flashcardId);
    if (!flashcard) continue;
    if (!decks.has(unit.deckId)) {
      decks.set(unit.deckId, (await ctx.db.get(unit.deckId))?.name ?? "");
    }
    const { type, content } = parseFlashcard(flashcard);
    items.push({
      reviewUnitId: unit._id,
      flashcardId: unit.flashcardId,
      deckId: unit.deckId,
      deckName: decks.get(unit.deckId) ?? "",
      type,
      content,
      subKey: unit.subKey,
      front: unit.front,
      back: unit.back,
      version: unit.version,
      flashcardVersion: flashcard.version,
      due: unit.due,
      isNew: unit.state === 0,
    });
  }
  return items;
}

/** Stable 32-bit hash used to rank Frontier candidates for a study day. */
function rank(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Distinct review units first rated today (account time zone), across all
 * decks, plus the flashcards they belong to. This is the shared Frontier.
 */
export async function introducedToday(ctx: QueryCtx, library: Doc<"libraries">, now: number) {
  const since = startOfStudyDayMs(now, library.timeZone);
  const logs = await ctx.db
    .query("reviewLogs")
    .withIndex("by_library_state_review", (q) =>
      q.eq("libraryId", library._id).eq("state", State.New).gte("review", since),
    )
    .collect();
  const units = new Set<Id<"reviewUnits">>();
  const flashcards = new Set<Id<"flashcards">>();
  if (!logs.length) return { units, flashcards, since };
  const decks = await activeDeckIds(ctx, library._id);
  for (const log of logs) {
    // A moved card may retain the deleted deck's ID in its history. Check its
    // current card before reading the potentially large unit payload.
    if (!decks.has(log.deckId)) {
      const card = await ctx.db.get(log.flashcardId);
      if (!card || !decks.has(card.deckId)) continue;
    }
    // Deleted units stop counting immediately, before their history cleanup.
    const unit = await ctx.db.get(log.reviewUnitId);
    if (!unit || !decks.has(unit.deckId)) continue;
    units.add(log.reviewUnitId);
    flashcards.add(log.flashcardId);
  }
  return { units, flashcards, since };
}

/** True while a bury hides the unit. It reappears once `buriedUntil` passes. */
export function isBuried(unit: { buriedUntil?: number }, now: number) {
  return unit.buriedUntil != null && unit.buriedUntil > now;
}

/**
 * Review logs recorded since the start of the library's study day, across
 * every deck. Each counts against the account-wide daily review budget.
 */
export async function reviewsDoneToday(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  since: number,
  limit: number,
) {
  return (
    await ctx.db
      .query("reviewLogs")
      .withIndex("by_library_review", (q) => q.eq("libraryId", library._id).gte("review", since))
      // One past the budget is enough to know it is spent.
      .take(limit + 1)
  ).length;
}

/** Unlocked, unarchived, unburied, and due by `now`: the unit can be studied. */
function isStudyable(unit: Doc<"reviewUnits">, libraryId: Id<"libraries">, now: number) {
  return (
    unit.libraryId === libraryId &&
    !unit.locked &&
    !unit.archived &&
    unit.due <= now &&
    !isPendingSchedule(unit) &&
    !isBuried(unit, now)
  );
}

/** Studyable units in one deck, or in every active deck when `deckId` is null. */
export async function dueEligibleUnits(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  deckId: Id<"decks"> | null,
  now: number,
) {
  let deckIds: Set<Id<"decks">>;
  if (deckId) {
    const deck = await ctx.db.get(deckId);
    deckIds = new Set(deck?.libraryId === library._id ? [deckId] : []);
  } else {
    deckIds = await activeDeckIds(ctx, library._id);
  }
  const units: Doc<"reviewUnits">[] = [];
  for (const id of deckIds) {
    const due = await ctx.db
      .query("reviewUnits")
      .withIndex("by_deck_eligible_due", (q) =>
        q.eq("deckId", id).eq("locked", false).eq("archived", false).lte("due", now),
      )
      .collect();
    units.push(...due);
  }
  return units.filter((unit) => deckIds.has(unit.deckId) && isStudyable(unit, library._id, now));
}

/** Reads a caller has already made, so listing many decks repeats none of them. */
export type SessionReads = {
  /** Every unit of the selected deck, from which the due ones are taken. */
  deckUnits?: Doc<"reviewUnits">[];
  today?: Awaited<ReturnType<typeof introducedToday>>;
  /** Review logs studied since the start of today, capped at the daily budget. */
  reviewsDoneToday?: number;
  settings?: SettingsCache;
};

export type SessionSelection = {
  reviews: Doc<"reviewUnits">[];
  frontier: Doc<"reviewUnits">[];
};

/**
 * Due reviews plus today's capped Frontier. Both caps are account-wide: units
 * already introduced today count against the new-unit cap in every deck, and
 * reviews already logged today count against the daily review cap. Due
 * reviews (oldest due first) take the review budget first, then new units get
 * what is left of both allowances. New units from a flashcard already started
 * today are admitted with their siblings.
 */
export async function selectSession(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  deckId: Id<"decks"> | null,
  now: number,
  reads: SessionReads = {},
): Promise<SessionSelection> {
  const units = reads.deckUnits
    ? reads.deckUnits.filter((unit) => isStudyable(unit, library._id, now))
    : await dueEligibleUnits(ctx, library, deckId, now);
  const dueReviews = units.filter((unit) => unit.state !== State.New).sort((a, b) => a.due - b.due);
  const newUnits = units.filter((unit) => unit.state === State.New && unit.lastReview == null);

  const settings = reads.settings ?? new SettingsCache(ctx, library._id);
  const global = await settings.globalSettings();
  const keepSiblingsByDeck = new Map<Id<"decks">, boolean>();
  for (const id of new Set(newUnits.map((unit) => unit.deckId))) {
    keepSiblingsByDeck.set(id, (await settings.forDeck(id)).keepSiblingReviewUnitsTogether);
  }
  const keepSiblings = (unit: Doc<"reviewUnits">) => keepSiblingsByDeck.get(unit.deckId) ?? false;
  const today = reads.today ?? (await introducedToday(ctx, library, now));

  // Budgets are Infinity when unlimited; slice() and arithmetic handle that.
  const reviewLimit = global.reviewsPerDay;
  let reviewBudget = Infinity;
  if (reviewLimit != null) {
    const done =
      reads.reviewsDoneToday ?? (await reviewsDoneToday(ctx, library, today.since, reviewLimit));
    reviewBudget = Math.max(0, reviewLimit - done);
  }
  const reviews = dueReviews.slice(0, reviewBudget);
  // New units share what is left of the daily total, so a spent review budget
  // leaves nothing for them.
  const totalLeft = reviewBudget - reviews.length;
  const newAllowance = Math.max(0, global.newReviewUnitsPerDay - today.units.size);

  // Siblings of a flashcard started today skip the new-unit allowance, but
  // still count against the daily total.
  const continuing = newUnits
    .filter((unit) => keepSiblings(unit) && today.flashcards.has(unit.flashcardId))
    .slice(0, totalLeft);
  const frontierBudget = totalLeft - continuing.length;
  const newSlots = Math.min(newAllowance, frontierBudget);
  const continuingIds = new Set(continuing.map((unit) => unit._id));
  const candidates = newUnits.filter((unit) => !continuingIds.has(unit._id));

  // Rank candidates by a hash seeded with the account and study day, so the
  // chosen Frontier stays the same all day and rating one unit never
  // reshuffles which other units were admitted.
  const seed = `${library._id}:${today.since}:`;
  const keyOf = (unit: Doc<"reviewUnits">) => (keepSiblings(unit) ? unit.flashcardId : unit._id);
  const ordered = [...candidates].sort(
    (a, b) => rank(seed + keyOf(a)) - rank(seed + keyOf(b)) || a.subKey.localeCompare(b.subKey),
  );
  // Represent each deck's grouping choice as a batch identity. Selecting all
  // batches together keeps one shared budget, including mixed deck settings.
  const batches = ordered.map((unit) => ({ flashcardId: keyOf(unit), unit }));
  // Grouping may overshoot a unit budget by a flashcard's siblings; the daily
  // total is a hard cap, so trim the last group at the budget boundary.
  const frontier = [
    ...continuing,
    ...selectFrontier(batches, newSlots, true, (items) => items)
      .map(({ unit }) => unit)
      .slice(0, frontierBudget),
  ];
  return { reviews, frontier };
}

/**
 * May this unit be rated now? Mirrors queue eligibility at accept time.
 *
 * The daily Frontier and review caps are admission budgets, not rating gates:
 * the queue selects at most the remaining capacity (`selectSession`), and a
 * unit admitted to a session stays answerable. Recomputing the selection here
 * would reject a card already on screen when other ratings, an unlock, or a
 * settings change exhausts a budget (ADR 0021 keeps both caps account-wide and
 * lets the chosen view consume what remains).
 */
export async function checkEligible(unit: Doc<"reviewUnits">, now: number): Promise<string | null> {
  if (unit.archived) return "This flashcard was archived.";
  if (unit.locked || isPendingSchedule(unit)) {
    return "This flashcard is locked until its prerequisites are secured.";
  }
  if (isBuried(unit, now)) return "This flashcard is buried until the next study day.";
  // Allow small clock skew between the displayed queue and acceptance.
  if (unit.due > now + 60_000) return "This review unit is not due yet.";
  return null;
}
