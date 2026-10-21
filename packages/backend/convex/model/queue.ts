import { isPendingSchedule, State } from "@armin/core/scheduler";
import { selectFrontier, startOfStudyDayMs } from "@armin/core/study";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { SettingsCache } from "./study";

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
export async function introducedToday(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  now: number,
) {
  const since = startOfStudyDayMs(now, library.timeZone);
  const logs = await ctx.db
    .query("reviewLogs")
    .withIndex("by_library_state_review", (q) =>
      q.eq("libraryId", library._id).eq("state", State.New).gte("review", since),
    )
    .collect();
  const units = new Set<Id<"reviewUnits">>();
  const flashcards = new Set<Id<"flashcards">>();
  for (const log of logs) {
    // Deleted units stop counting immediately, before their history cleanup.
    if (!(await ctx.db.get(log.reviewUnitId))) continue;
    units.add(log.reviewUnitId);
    flashcards.add(log.flashcardId);
  }
  return { units, flashcards, since };
}

/** Eligible (unlocked, unarchived) units due by `now`, optionally per deck. */
export async function dueEligibleUnits(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  deckId: Id<"decks"> | null,
  now: number,
) {
  const units = deckId
    ? await ctx.db
        .query("reviewUnits")
        .withIndex("by_deck_eligible_due", (q) =>
          q.eq("deckId", deckId).eq("locked", false).eq("archived", false).lte("due", now),
        )
        .collect()
    : await ctx.db
        .query("reviewUnits")
        .withIndex("by_library_eligible_due", (q) =>
          q
            .eq("libraryId", library._id)
            .eq("locked", false)
            .eq("archived", false)
            .lte("due", now),
        )
        .collect();
  return units.filter(
    (unit) => unit.libraryId === library._id && !isPendingSchedule(unit),
  );
}

export type SessionSelection = {
  reviews: Doc<"reviewUnits">[];
  frontier: Doc<"reviewUnits">[];
};

/**
 * Due reviews plus today's capped Frontier. The cap is account-wide: units
 * already introduced today count against it in every deck. New units from a
 * flashcard already started today are admitted with their siblings.
 */
export async function selectSession(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  deckId: Id<"decks"> | null,
  now: number,
): Promise<SessionSelection> {
  const units = await dueEligibleUnits(ctx, library, deckId, now);
  const reviews = units
    .filter((unit) => unit.state !== State.New)
    .sort((a, b) => a.due - b.due);
  const newUnits = units.filter(
    (unit) => unit.state === State.New && unit.lastReview == null,
  );

  const settings = new SettingsCache(ctx, library._id);
  const global = await settings.globalSettings();
  const siblingGrouping = new Map<Id<"decks">, boolean>();
  for (const id of new Set(newUnits.map((unit) => unit.deckId))) {
    siblingGrouping.set(
      id,
      (await settings.forDeck(id)).keepSiblingReviewUnitsTogether,
    );
  }
  const keepSiblings = (unit: Doc<"reviewUnits">) =>
    siblingGrouping.get(unit.deckId) ?? false;
  const today = await introducedToday(ctx, library, now);
  const remaining = Math.max(0, global.newReviewUnitsPerDay - today.units.size);

  const continuing = newUnits.filter(
    (unit) => keepSiblings(unit) && today.flashcards.has(unit.flashcardId),
  );
  const continuingIds = new Set(continuing.map((unit) => unit._id));
  const candidates = newUnits.filter((unit) => !continuingIds.has(unit._id));

  // Rank candidates by a hash seeded with the account and study day, so the
  // chosen Frontier stays the same all day and rating one unit never
  // reshuffles which other units were admitted.
  const seed = `${library._id}:${today.since}:`;
  const keyOf = (unit: Doc<"reviewUnits">) =>
    keepSiblings(unit) ? unit.flashcardId : unit._id;
  const ordered = [...candidates].sort(
    (a, b) =>
      rank(seed + keyOf(a)) - rank(seed + keyOf(b)) ||
      a.subKey.localeCompare(b.subKey),
  );
  // Represent each deck's grouping choice as a batch identity. Selecting all
  // batches together keeps one shared budget, including mixed deck settings.
  const batches = ordered.map((unit) => ({ flashcardId: keyOf(unit), unit }));
  const frontier = [
    ...continuing,
    ...selectFrontier(
      batches,
      remaining,
      true,
      (items) => items,
    ).map(({ unit }) => unit),
  ];
  return { reviews, frontier };
}

/** May this unit be rated now? Mirrors queue eligibility at accept time. */
export async function checkEligible(
  ctx: QueryCtx,
  library: Doc<"libraries">,
  unit: Doc<"reviewUnits">,
  now: number,
): Promise<string | null> {
  if (unit.archived) return "This flashcard was archived.";
  if (unit.locked || isPendingSchedule(unit)) {
    return "This flashcard is locked until its prerequisites are secured.";
  }
  // Allow small clock skew between the displayed queue and acceptance.
  if (unit.due > now + 60_000) return "This review unit is not due yet.";
  if (unit.state === State.New && unit.lastReview == null) {
    const selection = await selectSession(ctx, library, unit.deckId, now);
    if (!selection.frontier.some((candidate) => candidate._id === unit._id)) {
      return "Today's new review unit limit is reached.";
    }
  }
  return null;
}
