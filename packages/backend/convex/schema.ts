import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Account-scoped study data. Every row carries `libraryId`; ownership always
 * comes from the authenticated identity's library mapping, never from a
 * caller-supplied id. Timestamps are epoch milliseconds.
 */

export const fsrsFields = {
  due: v.number(),
  stability: v.number(),
  difficulty: v.number(),
  elapsedDays: v.number(),
  scheduledDays: v.number(),
  learningSteps: v.number(),
  reps: v.number(),
  lapses: v.number(),
  // 0=New, 1=Learning, 2=Review, 3=Relearning
  state: v.number(),
  lastReview: v.union(v.number(), v.null()),
};

export const fsrsSnapshot = v.object(fsrsFields);

export const schedulingFields = {
  requestRetention: v.number(),
  maximumInterval: v.number(),
  enableFuzz: v.boolean(),
  enableShortTerm: v.boolean(),
  learningSteps: v.string(),
  relearningSteps: v.string(),
  weights: v.union(v.string(), v.null()),
  prereqStabilityFloor: v.number(),
  newReviewUnitsPerDay: v.number(),
  keepSiblingReviewUnitsTogether: v.boolean(),
};

export default defineSchema({
  /** One library per Better Auth user. */
  libraries: defineTable({
    ownerId: v.string(),
    status: v.union(v.literal("active"), v.literal("deleting")),
    timeZone: v.string(),
    createdAt: v.number(),
    deletionRequestedAt: v.optional(v.number()),
  }).index("by_owner", ["ownerId"]),

  /**
   * Write-side counters for a library. Kept apart from `libraries` so that
   * reactive reads of the library row are not invalidated by every write.
   */
  libraryCounters: defineTable({
    libraryId: v.id("libraries"),
    /** Bumped by every study-data write; export uses it as a snapshot check. */
    revision: v.number(),
    mediaBytes: v.number(),
    /** Review units in the library; bounds every per-library read. */
    reviewUnits: v.optional(v.number()),
  }).index("by_library", ["libraryId"]),

  settings: defineTable({
    libraryId: v.id("libraries"),
    ...schedulingFields,
    schedulingPreset: v.string(),
    /** JSON object of keybinding overrides; null = defaults. */
    keybindings: v.union(v.string(), v.null()),
    updatedAt: v.number(),
  }).index("by_library", ["libraryId"]),

  deckSettings: defineTable({
    libraryId: v.id("libraries"),
    deckId: v.id("decks"),
    requestRetention: v.union(v.number(), v.null()),
    maximumInterval: v.union(v.number(), v.null()),
    enableFuzz: v.union(v.boolean(), v.null()),
    enableShortTerm: v.union(v.boolean(), v.null()),
    learningSteps: v.union(v.string(), v.null()),
    relearningSteps: v.union(v.string(), v.null()),
    weights: v.union(v.string(), v.null()),
    prereqStabilityFloor: v.union(v.number(), v.null()),
    keepSiblingReviewUnitsTogether: v.union(v.boolean(), v.null()),
    updatedAt: v.number(),
  })
    .index("by_deck", ["deckId"])
    .index("by_library", ["libraryId"]),

  decks: defineTable({
    libraryId: v.id("libraries"),
    name: v.string(),
    description: v.union(v.string(), v.null()),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_library", ["libraryId"]),

  /** The authored unit. Content is type-specific JSON validated by core. */
  flashcards: defineTable({
    libraryId: v.id("libraries"),
    deckId: v.id("decks"),
    type: v.string(),
    content: v.string(),
    tags: v.array(v.string()),
    posX: v.union(v.number(), v.null()),
    posY: v.union(v.number(), v.null()),
    locked: v.boolean(),
    /** Permanent access milestone. Absent only on pre-policy flashcards. */
    prerequisiteAccessGranted: v.optional(v.boolean()),
    archived: v.boolean(),
    /** Incremented on every authored change; edits must name the version they started from. */
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_library", ["libraryId"])
    .index("by_deck", ["deckId"]),

  /** Generated review items; FSRS state inline. */
  reviewUnits: defineTable({
    libraryId: v.id("libraries"),
    deckId: v.id("decks"),
    flashcardId: v.id("flashcards"),
    subKey: v.string(),
    front: v.string(),
    back: v.string(),
    ...fsrsFields,
    locked: v.boolean(),
    archived: v.boolean(),
    /** Incremented on every schedule or display change; reviews name the version shown. */
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_flashcard", ["flashcardId"])
    .index("by_deck", ["deckId"])
    .index("by_library", ["libraryId"])
    .index("by_library_eligible_due", ["libraryId", "locked", "archived", "due"])
    .index("by_deck_eligible_due", ["deckId", "locked", "archived", "due"]),

  /** Append-only review history with the pre-review state for exact undo. */
  reviewLogs: defineTable({
    libraryId: v.id("libraries"),
    deckId: v.id("decks"),
    flashcardId: v.id("flashcards"),
    reviewUnitId: v.id("reviewUnits"),
    rating: v.number(),
    state: v.number(),
    due: v.number(),
    stability: v.number(),
    difficulty: v.number(),
    elapsedDays: v.number(),
    lastElapsedDays: v.number(),
    scheduledDays: v.number(),
    learningSteps: v.number(),
    review: v.number(),
    before: fsrsSnapshot,
    /** Review-unit version written by this review; undo requires it unchanged. */
    unitVersionAfter: v.number(),
  })
    .index("by_unit_review", ["reviewUnitId", "review"])
    .index("by_library_review", ["libraryId", "review"])
    .index("by_library_state_review", ["libraryId", "state", "review"])
    .index("by_flashcard", ["flashcardId"])
    .index("by_deck", ["deckId"]),

  prereqs: defineTable({
    libraryId: v.id("libraries"),
    deckId: v.id("decks"),
    prereqId: v.id("flashcards"),
    dependentId: v.id("flashcards"),
  })
    .index("by_prereq", ["prereqId"])
    .index("by_dependent", ["dependentId"])
    .index("by_pair", ["prereqId", "dependentId"])
    .index("by_deck", ["deckId"])
    .index("by_library", ["libraryId"]),

  tags: defineTable({
    libraryId: v.id("libraries"),
    name: v.string(),
    key: v.string(),
  }).index("by_library_key", ["libraryId", "key"]),

  /** Private library images. Served only through authenticated routes. */
  media: defineTable({
    libraryId: v.id("libraries"),
    fileName: v.string(),
    storageId: v.id("_storage"),
    mime: v.string(),
    size: v.number(),
    createdAt: v.number(),
  })
    .index("by_library_file", ["libraryId", "fileName"])
    .index("by_library", ["libraryId"])
    .index("by_storage", ["storageId"]),

  flashcardMedia: defineTable({
    libraryId: v.id("libraries"),
    flashcardId: v.id("flashcards"),
    fileName: v.string(),
  })
    .index("by_flashcard", ["flashcardId"])
    .index("by_library_file", ["libraryId", "fileName"]),

  /** Application-level request ids so repeated submissions apply once. */
  requests: defineTable({
    libraryId: v.id("libraries"),
    requestId: v.string(),
    kind: v.string(),
    result: v.any(),
    createdAt: v.number(),
  })
    .index("by_library_request", ["libraryId", "requestId"])
    .index("by_created", ["createdAt"]),

  exports: defineTable({
    libraryId: v.id("libraries"),
    status: v.union(
      v.literal("pending"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    storageId: v.optional(v.id("_storage")),
    fileName: v.string(),
    size: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_library", ["libraryId"])
    .index("by_storage", ["storageId"]),
});
