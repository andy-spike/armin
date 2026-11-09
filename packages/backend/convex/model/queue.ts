import { CONCEPT_SUBKEY, pickPracticeVariant } from "@armin/core/concept";
import { isPendingSchedule, State } from "@armin/core/scheduler";
import { selectFrontier, startOfStudyDayMs } from "@armin/core/study";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { activeDeckIds } from "./access";
import { MAX_REVIEW_UNITS_PER_FLASHCARD, MAX_SESSION_REVIEWS } from "./limits";
import { unitFrontierKey } from "./performance";
import { parseFlashcard, SettingsCache } from "./study";
import { conceptCardsAllowed } from "./usage";

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

const PRACTICE_VARIANT_SAMPLE = 40;

export async function toQueueItems(
  ctx: QueryCtx,
  units: QueueUnit[],
  options: { practiceSeed?: number } = {},
) {
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
    let { front, back } = unit;
    if (options.practiceSeed !== undefined && unit.subKey === CONCEPT_SUBKEY) {
      const variants = await ctx.db
        .query("conceptVariants")
        .withIndex("by_flashcard", (q) => q.eq("flashcardId", unit.flashcardId))
        .order("desc")
        .take(PRACTICE_VARIANT_SAMPLE);
      const practice = pickPracticeVariant(variants, options.practiceSeed, unit._id);
      if (practice) ({ exercise: front, solution: back } = practice);
    }
    items.push({
      reviewUnitId: unit._id,
      flashcardId: unit.flashcardId,
      deckId: unit.deckId,
      deckName: decks.get(unit.deckId) ?? "",
      type,
      content,
      subKey: unit.subKey,
      front,
      back,
      version: unit.version,
      flashcardVersion: flashcard.version,
      due: unit.due,
      isNew: unit.state === 0,
      hydrated: true,
    });
  }
  return items;
}

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

export function isBuried(unit: { buriedUntil?: number }, now: number) {
  return unit.buriedUntil != null && unit.buriedUntil > now;
}

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
      .take(limit + 1)
  ).length;
}

export function isWithheldConcept(
  unit: Pick<QueueUnit, "subKey">,
  library: Pick<Doc<"libraries">, "plan" | "complimentaryPro">,
) {
  return unit.subKey === CONCEPT_SUBKEY && !conceptCardsAllowed(library);
}

function isStudyable(unit: QueueUnit, library: Doc<"libraries">, now: number) {
  return (
    unit.libraryId === library._id &&
    !isWithheldConcept(unit, library) &&
    !unit.locked &&
    !unit.archived &&
    unit.due <= now &&
    !isPendingSchedule(unit) &&
    !isBuried(unit, now)
  );
}

const REVIEW_STATES = [State.Learning, State.Review, State.Relearning];
const SCAN_SLACK = 1000;

export async function scopeDecks(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  deckId: Id<"decks"> | null,
) {
  if (!deckId) return activeDeckIds(ctx, library._id);
  const deck = await ctx.db.get(deckId);
  return new Set(deck?.libraryId === library._id && !deck.staging ? [deckId] : []);
}

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
    const withheld = !conceptCardsAllowed(library);
    for (const state of REVIEW_STATES) {
      const rows = withheld
        ? deckId
          ? await ctx.db
              .query("unitSummaries")
              .withIndex("by_deck_kind_state_due", (q) =>
                q
                  .eq("deckId", deckId)
                  .eq("locked", false)
                  .eq("archived", false)
                  .eq("concept", undefined)
                  .eq("state", state)
                  .lte("due", now),
              )
              .take(limit + SCAN_SLACK)
          : await ctx.db
              .query("unitSummaries")
              .withIndex("by_library_kind_state_due", (q) =>
                q
                  .eq("libraryId", library._id)
                  .eq("locked", false)
                  .eq("archived", false)
                  .eq("concept", undefined)
                  .eq("state", state)
                  .lte("due", now),
              )
              .take(limit + SCAN_SLACK)
        : deckId
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
    .filter((unit) => decks.has(unit.deckId) && isStudyable(unit, library, now))
    .sort((a, b) => a.due - b.due)
    .slice(0, limit);
}

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
    isStudyable(unit, library, now);
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
          unitFrontierKey(a) - unitFrontierKey(b) ||
          a.flashcardId.localeCompare(b.flashcardId) ||
          a.subKey.localeCompare(b.subKey),
      )
      .slice(0, limit);
  }
  const withheld = !conceptCardsAllowed(library);
  const rows = withheld
    ? deckId
      ? ctx.db
          .query("unitSummaries")
          .withIndex("by_deck_kind_frontier", (q) =>
            q
              .eq("deckId", deckId)
              .eq("locked", false)
              .eq("archived", false)
              .eq("concept", undefined)
              .eq("state", State.New),
          )
      : ctx.db
          .query("unitSummaries")
          .withIndex("by_library_kind_frontier", (q) =>
            q
              .eq("libraryId", library._id)
              .eq("locked", false)
              .eq("archived", false)
              .eq("concept", undefined)
              .eq("state", State.New),
          )
    : deckId
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
        isStudyable(unit, library, now)
      )
        units.push(unit);
    }
  }
  return units.sort(
    (a, b) => unitFrontierKey(a) - unitFrontierKey(b) || a.subKey.localeCompare(b.subKey),
  );
}

export type SessionReads = {
  today?: Awaited<ReturnType<typeof introducedToday>>;
  reviewsDoneToday?: number;
  settings?: SettingsCache;
};

export type SessionSelection = {
  reviews: QueueUnit[];
  frontier: QueueUnit[];
};

async function dailyBudgets(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  now: number,
  reads: SessionReads,
) {
  const settings = reads.settings ?? new SettingsCache(ctx, library._id);
  const global = await settings.globalSettings();
  const today = reads.today ?? (await introducedToday(ctx, library, now));
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

  const continuing: QueueUnit[] = [];
  for (const unit of await continuingUnits(ctx, library, decks, today, now)) {
    if (continuing.length >= totalLeft) break;
    if (await keepSiblings(unit)) continuing.push(unit);
  }
  const frontierBudget = totalLeft - continuing.length;
  const newSlots = Math.min(newAllowance, frontierBudget);
  const candidates = await frontierCandidates(
    ctx,
    library,
    deckId,
    decks,
    now,
    Math.min(frontierBudget, newSlots + MAX_REVIEW_UNITS_PER_FLASHCARD),
    new Set(continuing.map((unit) => unit._id)),
  );
  const batches = [];
  for (const unit of candidates)
    batches.push({ flashcardId: (await keepSiblings(unit)) ? unit.flashcardId : unit._id, unit });
  const frontier = [
    ...continuing,
    ...selectFrontier(batches, newSlots, true, (items) => items)
      .map(({ unit }) => unit)
      .slice(0, frontierBudget),
  ];
  return { reviews, frontier };
}

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
  const withheld = !conceptCardsAllowed(library);
  const candidatesByDeck = new Map(
    counters.map((row) => [
      row.deckId,
      row.frontierCandidates - (withheld ? Math.max(0, row.conceptFrontierCandidates ?? 0) : 0),
    ]),
  );
  const tally = (units: { deckId: Id<"decks"> }[]) => {
    const out = new Map<Id<"decks">, number>();
    for (const unit of units) out.set(unit.deckId, (out.get(unit.deckId) ?? 0) + 1);
    return out;
  };
  const reviewsByDeck = tally(shared);
  const buriedByDeck = tally(
    buried.filter(
      (row) =>
        row.state === State.New &&
        row.lastReview == null &&
        !row.locked &&
        !row.archived &&
        !isWithheldConcept(row, library),
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
        ? (
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

export async function checkEligible(
  unit: Doc<"reviewUnits">,
  library: Doc<"libraries">,
  now: number,
): Promise<string | null> {
  if (unit.archived) return "This flashcard was archived.";
  if (isWithheldConcept(unit, library))
    return "Concept cards are a Pro feature. This card returns to your reviews when Pro does.";
  if (unit.locked || isPendingSchedule(unit)) {
    return "This flashcard is locked until its prerequisites are secured.";
  }
  if (isBuried(unit, now)) return "This flashcard is buried until the next study day.";
  if (unit.due > now + 60_000) return "This review unit is not due yet.";
  return null;
}

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
