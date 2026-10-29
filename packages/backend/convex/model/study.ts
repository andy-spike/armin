import { internal } from "../_generated/api";
import {
  flashcardDisplay,
  generateReviewUnits,
  parseStoredContent,
  type FlashcardContent,
  type FlashcardType,
} from "@armin/core/flashcard-types";
import {
  createScheduler,
  fsrsFieldsToMs,
  isPendingSchedule,
  isPrereqSecured,
  newReviewUnitFields,
  pendingReviewUnitFields,
  type FsrsFieldsMs,
} from "@armin/core/scheduler";
import {
  defaultSchedulingSettings,
  emptyDeckOverrides,
  resolveEffectiveSettings,
  type DeckSettingsOverrides,
  type SchedulingSettings,
} from "@armin/core/study";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail } from "./errors";
import { MAX_REVIEW_UNITS, MAX_REVIEW_UNITS_PER_FLASHCARD } from "./limits";
import { reviewUnitTotal } from "./usage";

// --- Settings ---

export function schedulingFrom(row: Doc<"settings">): SchedulingSettings {
  return {
    requestRetention: row.requestRetention,
    maximumInterval: row.maximumInterval,
    enableFuzz: row.enableFuzz,
    enableShortTerm: row.enableShortTerm,
    learningSteps: row.learningSteps,
    relearningSteps: row.relearningSteps,
    weights: row.weights,
    prereqStabilityFloor: row.prereqStabilityFloor,
    newReviewUnitsPerDay: row.newReviewUnitsPerDay,
    reviewsPerDay: row.reviewsPerDay ?? null,
    keepSiblingReviewUnitsTogether: row.keepSiblingReviewUnitsTogether,
  };
}

/** Saved account settings, or defaults if the row is missing. */
export async function getSettingsRow(
  ctx: QueryCtx,
  libraryId: Id<"libraries">,
): Promise<Omit<Doc<"settings">, "_id" | "_creationTime"> & { _id?: Id<"settings"> }> {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
    .unique();
  if (row) return row;
  return {
    libraryId,
    ...defaultSchedulingSettings(),
    keybindings: null,
    updatedAt: 0,
  };
}

export function overridesFrom(row: Doc<"deckSettings"> | null): DeckSettingsOverrides {
  if (!row) return emptyDeckOverrides();
  return {
    requestRetention: row.requestRetention,
    maximumInterval: row.maximumInterval,
    enableFuzz: row.enableFuzz,
    enableShortTerm: row.enableShortTerm,
    learningSteps: row.learningSteps,
    relearningSteps: row.relearningSteps,
    weights: row.weights,
    prereqStabilityFloor: row.prereqStabilityFloor,
    keepSiblingReviewUnitsTogether: row.keepSiblingReviewUnitsTogether,
  };
}

/** Per-request cache of effective settings by deck. */
export class SettingsCache {
  private global: SchedulingSettings | null = null;
  private byDeck = new Map<string, SchedulingSettings>();

  constructor(
    private ctx: QueryCtx,
    private libraryId: Id<"libraries">,
  ) {}

  async globalSettings() {
    if (!this.global) {
      this.global = schedulingFrom(
        (await getSettingsRow(this.ctx, this.libraryId)) as Doc<"settings">,
      );
    }
    return this.global;
  }

  async forDeck(deckId: Id<"decks">) {
    const cached = this.byDeck.get(deckId);
    if (cached) return cached;
    const global = await this.globalSettings();
    const row = await this.ctx.db
      .query("deckSettings")
      .withIndex("by_deck", (q) => q.eq("deckId", deckId))
      .unique();
    const effective = resolveEffectiveSettings(global, overridesFrom(row));
    this.byDeck.set(deckId, effective);
    return effective;
  }
}

/** Build a fresh scheduler per call; never share a mutable instance. */
export function schedulerFor(settings: SchedulingSettings) {
  return createScheduler(settings);
}

// --- Library revision (export snapshot check) ---

/** The library's revision, which graph and assistant writes compare against. */
export async function libraryRevision(ctx: QueryCtx, libraryId: Id<"libraries">) {
  const counters = await ctx.db
    .query("libraryCounters")
    .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
    .unique();
  return counters?.revision ?? 0;
}

export async function bumpRevision(ctx: MutationCtx, libraryId: Id<"libraries">) {
  const counters = await ctx.db
    .query("libraryCounters")
    .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
    .unique();
  if (counters) {
    await ctx.db.patch(counters._id, { revision: counters.revision + 1 });
  } else {
    await ctx.db.insert("libraryCounters", {
      libraryId,
      revision: 1,
      mediaBytes: 0,
    });
  }
}

/**
 * Apply a change in the library's review-unit count, refusing growth past the
 * beta cap. Call it before inserting or deleting the rows, so libraries
 * created before the counter existed are counted correctly once.
 */
export async function adjustReviewUnitCount(
  ctx: MutationCtx,
  libraryId: Id<"libraries">,
  delta: number,
) {
  if (delta === 0) return;
  const counters = await ctx.db
    .query("libraryCounters")
    .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
    .unique();
  const current = counters?.reviewUnits ?? (await reviewUnitTotal(ctx, libraryId));
  const next = Math.max(0, current + delta);
  if (delta > 0 && next > MAX_REVIEW_UNITS) {
    fail("QUOTA", `The beta allows ${MAX_REVIEW_UNITS} review units per account.`);
  }
  if (counters) {
    await ctx.db.patch(counters._id, { reviewUnits: next });
  } else {
    await ctx.db.insert("libraryCounters", {
      libraryId,
      revision: 0,
      mediaBytes: 0,
      reviewUnits: next,
    });
  }
}

// --- Flashcard content ---

export function parseFlashcard(flashcard: Doc<"flashcards">) {
  return parseStoredContent(flashcard.type, flashcard.content);
}

export function displayFor(type: FlashcardType, content: FlashcardContent) {
  return flashcardDisplay(type, content);
}

/**
 * Bring a flashcard's review units in line with its content: keep units whose
 * subKey survives (preserving FSRS state), insert new ones, delete the rest.
 * Changed display text bumps the unit version so an open review of the old
 * prompt is invalidated rather than silently answered.
 */
export async function reconcileReviewUnits(
  ctx: MutationCtx,
  flashcard: Doc<"flashcards">,
  type: FlashcardType,
  content: FlashcardContent,
  now: number,
) {
  const specs = generateReviewUnits(type, content);
  if (specs.length > MAX_REVIEW_UNITS_PER_FLASHCARD) {
    fail(
      "QUOTA",
      `A flashcard can generate at most ${MAX_REVIEW_UNITS_PER_FLASHCARD} review units.`,
    );
  }
  const existing = await ctx.db
    .query("reviewUnits")
    .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcard._id))
    .collect();
  const existingBySubKey = new Map(existing.map((unit) => [unit.subKey, unit]));
  const nextSubKeys = new Set(specs.map((spec) => spec.subKey));
  const removedCount = existing.filter((unit) => !nextSubKeys.has(unit.subKey)).length;
  const addedCount = specs.filter((spec) => !existingBySubKey.has(spec.subKey)).length;
  await adjustReviewUnitCount(ctx, flashcard.libraryId, addedCount - removedCount);

  for (const unit of existing) {
    if (!nextSubKeys.has(unit.subKey)) {
      await deleteReviewUnit(ctx, unit._id);
    }
  }

  for (const spec of specs) {
    const found = existingBySubKey.get(spec.subKey);
    if (found) {
      const changed =
        found.front !== spec.front ||
        found.back !== spec.back ||
        found.locked !== flashcard.locked ||
        found.archived !== flashcard.archived ||
        found.deckId !== flashcard.deckId;
      if (changed) {
        await ctx.db.patch(found._id, {
          front: spec.front,
          back: spec.back,
          locked: flashcard.locked,
          archived: flashcard.archived,
          deckId: flashcard.deckId,
          version: found.version + 1,
          updatedAt: now,
        });
      }
    } else {
      const schedule = fsrsFieldsToMs(
        flashcard.locked ? pendingReviewUnitFields() : newReviewUnitFields(new Date(now)),
      );
      await ctx.db.insert("reviewUnits", {
        libraryId: flashcard.libraryId,
        deckId: flashcard.deckId,
        flashcardId: flashcard._id,
        subKey: spec.subKey,
        front: spec.front,
        back: spec.back,
        ...schedule,
        locked: flashcard.locked,
        archived: flashcard.archived,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

/** Delete a review unit and its history. */
export async function deleteReviewUnit(ctx: MutationCtx, id: Id<"reviewUnits">) {
  await ctx.db.delete(id);
  await ctx.scheduler.runAfter(0, internal.deletion.cleanupUnitLogs, { reviewUnitId: id });
}

// --- Prerequisite lock state ---

/** Preserve access already earned, including currently unlocked legacy cards. */
function hasPrerequisiteAccess(flashcard: Doc<"flashcards">) {
  return (
    flashcard.prerequisiteAccessGranted === true ||
    (flashcard.prerequisiteAccessGranted === undefined && !flashcard.locked)
  );
}

async function dependentsOf(ctx: QueryCtx, flashcardId: Id<"flashcards">) {
  const edges = await ctx.db
    .query("prereqs")
    .withIndex("by_prereq", (q) => q.eq("prereqId", flashcardId))
    .collect();
  return edges.map((edge) => edge.dependentId);
}

async function collectTransitiveDependents(
  ctx: QueryCtx,
  roots: Id<"flashcards">[],
): Promise<Id<"flashcards">[]> {
  const seen = new Set<Id<"flashcards">>();
  const stack = [...roots];
  while (stack.length) {
    const node = stack.pop()!;
    for (const dependentId of await dependentsOf(ctx, node)) {
      if (seen.has(dependentId)) continue;
      seen.add(dependentId);
      stack.push(dependentId);
    }
  }
  return [...seen];
}

/**
 * Access is permanent once granted. Before that milestone, every unit of
 * every non-archived prerequisite must be secured at the dependent deck's
 * floor. A prerequisite with no review units never secures.
 */
async function computeLocked(
  ctx: QueryCtx,
  flashcard: Doc<"flashcards">,
  settings: SettingsCache,
): Promise<boolean> {
  if (hasPrerequisiteAccess(flashcard)) return false;
  const edges = await ctx.db
    .query("prereqs")
    .withIndex("by_dependent", (q) => q.eq("dependentId", flashcard._id))
    .collect();
  if (edges.length === 0) return false;
  const floor = (await settings.forDeck(flashcard.deckId)).prereqStabilityFloor;
  for (const edge of edges) {
    const prereq = await ctx.db.get(edge.prereqId);
    if (!prereq || prereq.archived) continue;
    const units = await ctx.db
      .query("reviewUnits")
      .withIndex("by_flashcard", (q) => q.eq("flashcardId", prereq._id))
      .collect();
    const secured = units.length > 0 && units.every((unit) => isPrereqSecured(unit, floor));
    if (!secured) return true;
  }
  return false;
}

/**
 * Persist lock state for a flashcard and keep its never-reviewed units in the
 * matching schedule: locked units wait on the far-future pending date, newly
 * unlocked ones become New and due now.
 */
async function applyLockState(
  ctx: MutationCtx,
  flashcard: Doc<"flashcards">,
  locked: boolean,
  now: number,
  loadedUnits?: Doc<"reviewUnits">[],
) {
  if (flashcard.locked !== locked || flashcard.prerequisiteAccessGranted !== !locked) {
    await ctx.db.patch(flashcard._id, {
      locked,
      prerequisiteAccessGranted: !locked,
    });
  }
  const units =
    loadedUnits ??
    (await ctx.db
      .query("reviewUnits")
      .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcard._id))
      .collect());
  for (const unit of units) {
    const patch: Partial<Doc<"reviewUnits">> = {};
    if (unit.locked !== locked) patch.locked = locked;
    const neverReviewed = unit.reps === 0 && unit.lastReview == null;
    if (neverReviewed) {
      const pending = isPendingSchedule(unit);
      if (locked && !pending) {
        Object.assign(patch, fsrsFieldsToMs(pendingReviewUnitFields()));
      } else if (!locked && pending) {
        Object.assign(patch, fsrsFieldsToMs(newReviewUnitFields(new Date(now))));
      }
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(unit._id, {
        ...patch,
        version: unit.version + 1,
        updatedAt: now,
      });
    }
  }
}

/**
 * Backfill old cards without reading unbounded review history. Existing
 * access and any surviving review history prove the card was accessible.
 */
export async function migratePrerequisiteAccess(
  ctx: MutationCtx,
  flashcard: Doc<"flashcards">,
  now: number,
) {
  if (flashcard.prerequisiteAccessGranted !== undefined) return false;
  const units = await ctx.db
    .query("reviewUnits")
    .withIndex("by_flashcard", (q) => q.eq("flashcardId", flashcard._id))
    .collect();
  const granted =
    !flashcard.locked || units.some((unit) => unit.reps > 0 || unit.lastReview != null);
  await applyLockState(ctx, flashcard, !granted, now, units);
  return true;
}

export async function refreshLockState(
  ctx: MutationCtx,
  flashcardIds: Id<"flashcards">[],
  settings: SettingsCache,
  now: number,
) {
  for (const id of new Set(flashcardIds)) {
    const flashcard = await ctx.db.get(id);
    if (!flashcard) continue;
    const locked = await computeLocked(ctx, flashcard, settings);
    await applyLockState(ctx, flashcard, locked, now);
  }
}

/** Recompute the given dependents and everything downstream of them. */
export async function refreshDependentSubgraph(
  ctx: MutationCtx,
  dependentIds: Id<"flashcards">[],
  settings: SettingsCache,
  now: number,
) {
  const downstream = await collectTransitiveDependents(ctx, dependentIds);
  await refreshLockState(ctx, [...dependentIds, ...downstream], settings, now);
}

/** A prerequisite's review/archive state changed: refresh everything it gates. */
export async function refreshAfterPrereqChange(
  ctx: MutationCtx,
  prereqId: Id<"flashcards">,
  settings: SettingsCache,
  now: number,
) {
  const downstream = await collectTransitiveDependents(ctx, [prereqId]);
  await refreshLockState(ctx, downstream, settings, now);
}

/**
 * Recompute every flashcard with prerequisites in a deck (or library). Loads
 * the scope's cards, units, and edges once and decides locks in memory, so a
 * settings change stays within Convex's per-function read limits.
 */
export async function refreshAllLocks(
  ctx: MutationCtx,
  scope: { libraryId: Id<"libraries"> } | { deckId: Id<"decks"> },
  settings: SettingsCache,
  now: number,
) {
  const [edges, flashcards, units] =
    "deckId" in scope
      ? await Promise.all([
          ctx.db
            .query("prereqs")
            .withIndex("by_deck", (q) => q.eq("deckId", scope.deckId))
            .collect(),
          ctx.db
            .query("flashcards")
            .withIndex("by_deck", (q) => q.eq("deckId", scope.deckId))
            .collect(),
          ctx.db
            .query("reviewUnits")
            .withIndex("by_deck", (q) => q.eq("deckId", scope.deckId))
            .collect(),
        ])
      : await Promise.all([
          ctx.db
            .query("prereqs")
            .withIndex("by_library", (q) => q.eq("libraryId", scope.libraryId))
            .collect(),
          ctx.db
            .query("flashcards")
            .withIndex("by_library", (q) => q.eq("libraryId", scope.libraryId))
            .collect(),
          ctx.db
            .query("reviewUnits")
            .withIndex("by_library", (q) => q.eq("libraryId", scope.libraryId))
            .collect(),
        ]);
  const cards = new Map(flashcards.map((card) => [card._id, card]));
  const unitsOf = new Map<Id<"flashcards">, Doc<"reviewUnits">[]>();
  for (const unit of units) {
    const list = unitsOf.get(unit.flashcardId);
    if (list) list.push(unit);
    else unitsOf.set(unit.flashcardId, [unit]);
  }
  const prereqsOf = new Map<Id<"flashcards">, Id<"flashcards">[]>();
  for (const edge of edges) {
    const list = prereqsOf.get(edge.dependentId);
    if (list) list.push(edge.prereqId);
    else prereqsOf.set(edge.dependentId, [edge.prereqId]);
  }
  for (const [dependentId, prereqIds] of prereqsOf) {
    const dependent = cards.get(dependentId);
    if (!dependent) continue;
    const floor = (await settings.forDeck(dependent.deckId)).prereqStabilityFloor;
    const locked =
      !hasPrerequisiteAccess(dependent) &&
      prereqIds.some((prereqId) => {
        const prereq = cards.get(prereqId);
        if (!prereq || prereq.archived) return false;
        const prereqUnits = unitsOf.get(prereqId) ?? [];
        return !(
          prereqUnits.length > 0 && prereqUnits.every((unit) => isPrereqSecured(unit, floor))
        );
      });
    await applyLockState(ctx, dependent, locked, now, unitsOf.get(dependentId) ?? []);
  }
}

/** Snapshot of FSRS state for a review log's undo record. */
export function fsrsSnapshot(unit: FsrsFieldsMs): FsrsFieldsMs {
  return {
    due: unit.due,
    stability: unit.stability,
    difficulty: unit.difficulty,
    elapsedDays: unit.elapsedDays,
    scheduledDays: unit.scheduledDays,
    learningSteps: unit.learningSteps,
    reps: unit.reps,
    lapses: unit.lapses,
    state: unit.state,
    lastReview: unit.lastReview,
  };
}

// --- Request de-duplication ---

export async function findRequest(
  ctx: QueryCtx,
  libraryId: Id<"libraries">,
  requestId: string | undefined,
) {
  if (!requestId) return null;
  return ctx.db
    .query("requests")
    .withIndex("by_library_request", (q) => q.eq("libraryId", libraryId).eq("requestId", requestId))
    .unique();
}

export async function recordRequest(
  ctx: MutationCtx,
  libraryId: Id<"libraries">,
  requestId: string | undefined,
  kind: string,
  result: unknown,
  now: number,
) {
  if (!requestId) return;
  await ctx.db.insert("requests", {
    libraryId,
    requestId,
    kind,
    result,
    createdAt: now,
  });
}

// --- Tags ---

/**
 * Tag rows already looked up in this mutation: the stored name, or null when
 * the library has no such tag yet. Batch writers share one so a batch reads
 * each distinct tag once and stays under Convex's per-transaction read limit.
 */
export type TagCache = Map<string, string | null>;

async function storedTag(
  ctx: QueryCtx,
  libraryId: Id<"libraries">,
  key: string,
  cache: TagCache | undefined,
) {
  if (cache?.has(key)) return cache.get(key)!;
  const existing = await ctx.db
    .query("tags")
    .withIndex("by_library_key", (q) => q.eq("libraryId", libraryId).eq("key", key))
    .unique();
  const name = existing?.name ?? null;
  cache?.set(key, name);
  return name;
}

export async function rememberTags(
  ctx: MutationCtx,
  libraryId: Id<"libraries">,
  tags: string[],
  cache?: TagCache,
) {
  for (const name of tags) {
    const key = name.toLocaleLowerCase();
    if ((await storedTag(ctx, libraryId, key, cache)) !== null) continue;
    await ctx.db.insert("tags", { libraryId, name, key });
    cache?.set(key, name);
  }
}

/** Use the library's existing casing for tags that already exist. */
export async function canonicalTags(
  ctx: QueryCtx,
  libraryId: Id<"libraries">,
  tags: string[],
  cache?: TagCache,
) {
  const out: string[] = [];
  for (const name of tags) {
    out.push((await storedTag(ctx, libraryId, name.toLocaleLowerCase(), cache)) ?? name);
  }
  return out;
}
