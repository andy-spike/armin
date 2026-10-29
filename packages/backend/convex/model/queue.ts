import { isPendingSchedule, State } from "@armin/core/scheduler";
import { selectFrontier, startOfStudyDayMs } from "@armin/core/study";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { activeDeckIds } from "./access";
import { MAX_REVIEW_UNITS_PER_FLASHCARD, MAX_SESSION_REVIEWS } from "./limits";
import { frontierKey } from "./performance";
import { parseFlashcard, SettingsCache } from "./study";

export type QueueUnit = Pick<
  Doc<"reviewUnits">,
  | "_id"
  | "libraryId"
  | "deckId"
  | "flashcardId"
  | "subKey"
  | "state"
  | "due"
  | "lastReview"
  | "reps"
  | "locked"
  | "archived"
  | "version"
  | "buriedUntil"
  | "createdAt"
>;
export const queueUnit = (row: Doc<"unitSummaries">) => ({
  ...row,
  _id: row.reviewUnitId,
});

/** Queue-shaped items for the review and cram renderers. */
export async function toQueueItems(ctx: QueryCtx, units: QueueUnit[]) {
  const flashcards = new Map<Id<"flashcards">, Doc<"flashcards"> | null>();
  const decks = new Map<Id<"decks">, string>();
  const items = [];
  for (const metadata of units) {
    const unit = await ctx.db.get(metadata._id);
    if (!unit) continue;
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
      hydrated: true,
    });
  }
  return items;
}

/**
 * Distinct review units first rated today (account time zone), across all
 * decks, plus the flashcards they belong to. This is the shared Frontier.
 */
export async function introducedToday(ctx: QueryCtx, library: Doc<"libraries">, now: number) {
  const since = startOfStudyDayMs(now, library.timeZone);
  const units = new Set<Id<"reviewUnits">>();
  const flashcards = new Set<Id<"flashcards">>();
  const decks = await activeDeckIds(ctx, library._id);
  if (library.statsReady) {
    const rows = await ctx.db
      .query("unitSummaries")
      .withIndex("by_library_introduced", (q) =>
        q.eq("libraryId", library._id).gte("introducedAt", since),
      )
      // Today's introductions are bounded by the daily new-unit cap.
      .take(MAX_SESSION_REVIEWS);
    for (const row of rows) {
      if (!decks.has(row.deckId)) continue;
      units.add(row.reviewUnitId);
      flashcards.add(row.flashcardId);
    }
  } else {
    const logs = await ctx.db
      .query("reviewLogs")
      .withIndex("by_library_state_review", (q) =>
        q.eq("libraryId", library._id).eq("state", State.New).gte("review", since),
      )
      .take(MAX_SESSION_REVIEWS);
    for (const log of logs) {
      const unit = await ctx.db.get(log.reviewUnitId);
      if (unit && decks.has(unit.deckId)) {
        units.add(unit._id);
        flashcards.add(unit.flashcardId);
      }
    }
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
function isStudyable(unit: QueueUnit, libraryId: Id<"libraries">, now: number) {
  return (
    unit.libraryId === libraryId &&
    !unit.locked &&
    !unit.archived &&
    unit.due <= now &&
    !isPendingSchedule(unit) &&
    !isBuried(unit, now)
  );
}

/** Learning, Review, and Relearning: every state a due review can be in. */
const REVIEW_STATES = [State.Learning, State.Review, State.Relearning];
/**
 * Rows read past a selection's size, so buried, pending, or out-of-scope rows
 * (a deck awaiting deletion or an import still staging) don't shorten it.
 */
const SCAN_SLACK = 1000;

/** The decks a selection may draw from: one deck, or every active deck. */
export async function scopeDecks(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  deckId: Id<"decks"> | null,
) {
  if (!deckId) return activeDeckIds(ctx, library._id);
  const deck = await ctx.db.get(deckId);
  return new Set(deck?.libraryId === library._id && !deck.staging ? [deckId] : []);
}

/** Studyable due reviews (not new units), oldest due first, at most `limit`. */
export async function dueReviewUnits(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  deckId: Id<"decks"> | null,
  decks: Set<Id<"decks">>,
  now: number,
  limit: number,
) {
  if (limit <= 0) return [];
  let units: QueueUnit[] = [];
  if (library.statsReady) {
    for (const state of REVIEW_STATES) {
      const rows = deckId
        ? await ctx.db
            .query("unitSummaries")
            .withIndex("by_deck_state_due", (q) =>
              q
                .eq("deckId", deckId)
                .eq("locked", false)
                .eq("archived", false)
                .eq("state", state)
                .lte("due", now),
            )
            .take(limit + SCAN_SLACK)
        : await ctx.db
            .query("unitSummaries")
            .withIndex("by_library_state_due", (q) =>
              q
                .eq("libraryId", library._id)
                .eq("locked", false)
                .eq("archived", false)
                .eq("state", state)
                .lte("due", now),
            )
            .take(limit + SCAN_SLACK);
      units.push(...rows.map(queueUnit));
    }
  } else {
    // Until the projections are built (a new library, or a timezone change),
    // read units per deck. Such libraries are small or briefly rebuilding.
    for (const id of decks) {
      units.push(
        ...(await ctx.db
          .query("reviewUnits")
          .withIndex("by_deck_eligible_due", (q) =>
            q.eq("deckId", id).eq("locked", false).eq("archived", false).lte("due", now),
          )
          .take(limit + SCAN_SLACK)),
      );
    }
    units = units.filter((unit) => unit.state !== State.New);
  }
  return units
    .filter((unit) => decks.has(unit.deckId) && isStudyable(unit, library._id, now))
    .sort((a, b) => a.due - b.due)
    .slice(0, limit);
}

/**
 * Studyable new units in their fixed Frontier order (`frontierKey`), at most
 * `limit`. Siblings share a key, so they come out together.
 */
export async function frontierCandidates(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  deckId: Id<"decks"> | null,
  decks: Set<Id<"decks">>,
  now: number,
  limit: number,
  exclude: Set<Id<"reviewUnits">> = new Set(),
) {
  if (limit <= 0) return [];
  const eligible = (unit: QueueUnit) =>
    unit.state === State.New &&
    unit.lastReview == null &&
    !exclude.has(unit._id) &&
    decks.has(unit.deckId) &&
    isStudyable(unit, library._id, now);
  if (!library.statsReady) {
    const units: QueueUnit[] = [];
    for (const id of decks) {
      units.push(
        ...(await ctx.db
          .query("reviewUnits")
          .withIndex("by_deck_eligible_due", (q) =>
            q.eq("deckId", id).eq("locked", false).eq("archived", false).lte("due", now),
          )
          .take(MAX_SESSION_REVIEWS + SCAN_SLACK)),
      );
    }
    return units
      .filter(eligible)
      .sort(
        (a, b) =>
          frontierKey(a.flashcardId) - frontierKey(b.flashcardId) ||
          a.flashcardId.localeCompare(b.flashcardId) ||
          a.subKey.localeCompare(b.subKey),
      )
      .slice(0, limit);
  }
  const rows = deckId
    ? ctx.db
        .query("unitSummaries")
        .withIndex("by_deck_frontier", (q) =>
          q.eq("deckId", deckId).eq("locked", false).eq("archived", false).eq("state", State.New),
        )
    : ctx.db
        .query("unitSummaries")
        .withIndex("by_library_frontier", (q) =>
          q
            .eq("libraryId", library._id)
            .eq("locked", false)
            .eq("archived", false)
            .eq("state", State.New),
        );
  const out: QueueUnit[] = [];
  let scanned = 0;
  for await (const row of rows) {
    if (++scanned > limit + SCAN_SLACK) break;
    const unit = queueUnit(row);
    if (!eligible(unit)) continue;
    out.push(unit);
    if (out.length >= limit) break;
  }
  return out;
}

/** New units of flashcards started today, which join today's session together. */
async function continuingUnits(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  decks: Set<Id<"decks">>,
  today: Awaited<ReturnType<typeof introducedToday>>,
  now: number,
) {
  const units: QueueUnit[] = [];
  for (const flashcardId of today.flashcards) {
    const rows = await ctx.db
      .query("unitSummaries")
      .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcardId))
      .take(MAX_REVIEW_UNITS_PER_FLASHCARD);
    for (const row of rows) {
      const unit = queueUnit(row);
      if (
        unit.state === State.New &&
        unit.lastReview == null &&
        decks.has(unit.deckId) &&
        isStudyable(unit, library._id, now)
      )
        units.push(unit);
    }
  }
  return units.sort(
    (a, b) =>
      frontierKey(a.flashcardId) - frontierKey(b.flashcardId) || a.subKey.localeCompare(b.subKey),
  );
}

/** Reads a caller has already made, so listing many decks repeats none of them. */
export type SessionReads = {
  today?: Awaited<ReturnType<typeof introducedToday>>;
  /** Review logs studied since the start of today, capped at the daily budget. */
  reviewsDoneToday?: number;
  settings?: SettingsCache;
};

export type SessionSelection = {
  reviews: QueueUnit[];
  frontier: QueueUnit[];
};

/** The account-wide daily allowances that every deck's selection shares. */
async function dailyBudgets(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  now: number,
  reads: SessionReads,
) {
  const settings = reads.settings ?? new SettingsCache(ctx, library._id);
  const global = await settings.globalSettings();
  const today = reads.today ?? (await introducedToday(ctx, library, now));
  // Budgets are Infinity when unlimited; slice() and arithmetic handle that.
  const reviewLimit = global.reviewsPerDay;
  let reviewBudget = Infinity;
  if (reviewLimit != null) {
    const done =
      reads.reviewsDoneToday ?? (await reviewsDoneToday(ctx, library, today.since, reviewLimit));
    reviewBudget = Math.max(0, reviewLimit - done);
  }
  const newAllowance = Math.max(0, global.newReviewUnitsPerDay - today.units.size);
  return { settings, today, reviewBudget, newAllowance };
}

/**
 * Due reviews plus today's capped Frontier. Both caps are account-wide: units
 * already introduced today count against the new-unit cap in every deck, and
 * reviews already logged today count against the daily review cap. Due
 * reviews (oldest due first) take the review budget first, then new units get
 * what is left of both allowances. New units from a flashcard already started
 * today are admitted with their siblings. Every read is an index range bounded
 * by the budgets, so selection cost does not grow with the library.
 */
export async function selectSession(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  deckId: Id<"decks"> | null,
  now: number,
  reads: SessionReads = {},
): Promise<SessionSelection> {
  const decks = await scopeDecks(ctx, library, deckId);
  const { settings, today, reviewBudget, newAllowance } = await dailyBudgets(
    ctx,
    library,
    now,
    reads,
  );
  const reviews = await dueReviewUnits(
    ctx,
    library,
    deckId,
    decks,
    now,
    Math.min(reviewBudget, MAX_SESSION_REVIEWS),
  );
  // New units share what is left of the daily total, so a spent review budget
  // leaves nothing for them.
  const totalLeft = reviewBudget - reviews.length;
  const keepSiblingsByDeck = new Map<Id<"decks">, boolean>();
  const keepSiblings = async (unit: QueueUnit) => {
    if (!keepSiblingsByDeck.has(unit.deckId))
      keepSiblingsByDeck.set(
        unit.deckId,
        (await settings.forDeck(unit.deckId)).keepSiblingReviewUnitsTogether,
      );
    return keepSiblingsByDeck.get(unit.deckId)!;
  };

  // Siblings of a flashcard started today skip the new-unit allowance, but
  // still count against the daily total.
  const continuing: QueueUnit[] = [];
  for (const unit of await continuingUnits(ctx, library, decks, today, now)) {
    if (continuing.length >= totalLeft) break;
    if (await keepSiblings(unit)) continuing.push(unit);
  }
  const frontierBudget = totalLeft - continuing.length;
  const newSlots = Math.min(newAllowance, frontierBudget);
  // Read enough candidates to finish the last flashcard's siblings.
  const candidates = await frontierCandidates(
    ctx,
    library,
    deckId,
    decks,
    now,
    Math.min(frontierBudget, newSlots + MAX_REVIEW_UNITS_PER_FLASHCARD),
    new Set(continuing.map((unit) => unit._id)),
  );
  // Represent each deck's grouping choice as a batch identity. Selecting all
  // batches together keeps one shared budget, including mixed deck settings.
  const batches = [];
  for (const unit of candidates)
    batches.push({ flashcardId: (await keepSiblings(unit)) ? unit.flashcardId : unit._id, unit });
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
 * Due counts for every active deck and for the whole library, for navigation.
 * The library total is an exact selection. Per-deck totals come from one
 * shared read of due reviews and the deck Frontier counters, so they cost the
 * same with one deck or a thousand; with more than `MAX_SESSION_REVIEWS` due
 * across the library, a deck's review count can read low.
 */
export async function dueCounts(ctx: QueryCtx, library: Doc<"libraries">, now: number) {
  const settings = new SettingsCache(ctx, library._id);
  await settings.preloadDecks();
  const reads = await dailyBudgets(ctx, library, now, { settings });
  const { today, reviewBudget, newAllowance } = reads;
  const whole = await selectSession(ctx, library, null, now, reads);
  const decks = await activeDeckIds(ctx, library._id);
  const shared = await dueReviewUnits(
    ctx,
    library,
    null,
    decks,
    now,
    Math.min(reviewBudget, MAX_SESSION_REVIEWS),
  );
  const continuing = await continuingUnits(ctx, library, decks, today, now);
  // Units the counters include but that cannot be studied right now.
  const buried = library.statsReady
    ? await ctx.db
        .query("unitSummaries")
        .withIndex("by_library_buried", (q) =>
          q.eq("libraryId", library._id).gt("buriedUntil", now),
        )
        .take(MAX_SESSION_REVIEWS)
    : [];
  const counters = await ctx.db
    .query("deckUnitCounts")
    .withIndex("by_library", (q) => q.eq("libraryId", library._id))
    .collect();
  const candidatesByDeck = new Map(counters.map((row) => [row.deckId, row.frontierCandidates]));
  const tally = (units: { deckId: Id<"decks"> }[]) => {
    const out = new Map<Id<"decks">, number>();
    for (const unit of units) out.set(unit.deckId, (out.get(unit.deckId) ?? 0) + 1);
    return out;
  };
  const reviewsByDeck = tally(shared);
  const buriedByDeck = tally(
    buried.filter(
      (row) => row.state === State.New && row.lastReview == null && !row.locked && !row.archived,
    ),
  );
  const perDeck: Record<string, number> = {};
  for (const deckId of decks) {
    const keep = (await settings.forDeck(deckId)).keepSiblingReviewUnitsTogether;
    const reviews = Math.min(reviewBudget, reviewsByDeck.get(deckId) ?? 0);
    const totalLeft = reviewBudget - reviews;
    const started = keep ? continuing.filter((unit) => unit.deckId === deckId).length : 0;
    const continued = Math.min(totalLeft, started);
    const frontierBudget = totalLeft - continued;
    const counted = candidatesByDeck.get(deckId);
    const available =
      counted === undefined
        ? // A deck untouched since its counters were introduced: read just enough.
          (
            await frontierCandidates(
              ctx,
              library,
              deckId,
              new Set([deckId]),
              now,
              Math.min(frontierBudget, newAllowance) + started,
            )
          ).length - started
        : counted - (buriedByDeck.get(deckId) ?? 0) - started;
    perDeck[deckId] =
      reviews + continued + Math.max(0, Math.min(newAllowance, frontierBudget, available));
  }
  return {
    perDeck,
    due: whole.reviews.length + whole.frontier.length,
  };
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

/** Stable descriptors keep admission/progress intact without sending card text. */
export function queueDescriptors(units: QueueUnit[]) {
  return units.map((unit) => ({
    reviewUnitId: unit._id,
    flashcardId: unit.flashcardId,
    deckId: unit.deckId,
    subKey: unit.subKey,
    version: unit.version,
    due: unit.due,
    isNew: unit.state === 0,
    hydrated: false as const,
  }));
}
