import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const fsrsFields = {
  due: v.number(),
  stability: v.number(),
  difficulty: v.number(),
  elapsedDays: v.number(),
  scheduledDays: v.number(),
  learningSteps: v.number(),
  reps: v.number(),
  lapses: v.number(),
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
  reviewsPerDay: v.optional(v.union(v.number(), v.null())),
  keepSiblingReviewUnitsTogether: v.boolean(),
};

const importCounts = v.object({
  flashcards: v.number(),
  reviewUnits: v.number(),
  reviewLogs: v.number(),
});

const agentImportCounts = v.object({
  flashcards: v.number(),
  reviewUnits: v.number(),
  skipped: v.number(),
});

const agentImportTotals = v.object({
  flashcards: v.number(),
  reviewUnits: v.number(),
  mediaFiles: v.number(),
});

const agentImportDeck = v.object({
  key: v.string(),
  name: v.string(),
  ankiName: v.string(),
  cardCount: v.number(),
});

export const variantReservation = v.object({
  libraryId: v.id("libraries"),
  month: v.string(),
  count: v.number(),
});

const conceptPool = v.object({
  status: v.union(
    v.literal("generating"),
    v.literal("ready"),
    v.literal("failed"),
    v.literal("allowanceUsed"),
  ),
  reason: v.optional(v.string()),
  job: v.number(),
  requestedAt: v.number(),
  reserved: v.optional(variantReservation),
});

export default defineSchema({
  agentConnections: defineTable({
    libraryId: v.id("libraries"),
    componentConnectionId: v.optional(v.string()),
    name: v.string(),
    resource: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    clientId: v.optional(v.string()),
    scope: v.optional(v.string()),
    deckIds: v.optional(v.array(v.id("decks"))),
    allowCreateDecks: v.optional(v.boolean()),
    allowEdits: v.optional(v.boolean()),
    accessHash: v.optional(v.string()),
    accessExpiresAt: v.optional(v.number()),
    refreshHash: v.optional(v.string()),
    refreshExpiresAt: v.optional(v.number()),
  })
    .index("by_library", ["libraryId"])
    .index("by_component", ["componentConnectionId"]),
  agentRateLimits: defineTable({
    libraryId: v.optional(v.id("libraries")),
    key: v.string(),
    count: v.number(),
    expiresAt: v.number(),
  })
    .index("by_library", ["libraryId"])
    .index("by_key", ["key"])
    .index("by_expiry", ["expiresAt"]),
  agentCreatedDecks: defineTable({
    libraryId: v.id("libraries"),
    connectionId: v.id("agentConnections"),
    deckId: v.id("decks"),
  })
    .index("by_connection_deck", ["connectionId", "deckId"])
    .index("by_library", ["libraryId"]),
  agentActivity: defineTable({
    libraryId: v.id("libraries"),
    connectionId: v.id("agentConnections"),
    clientName: v.string(),
    summary: v.string(),
    deckId: v.optional(v.id("decks")),
    createdAt: v.number(),
  })
    .index("by_library", ["libraryId"])
    .index("by_created", ["createdAt"]),
  agentRequests: defineTable({
    libraryId: v.id("libraries"),
    connectionId: v.id("agentConnections"),
    requestId: v.string(),
    fingerprint: v.string(),
    result: v.any(),
    createdAt: v.number(),
  })
    .index("by_connection_request", ["connectionId", "requestId"])
    .index("by_library", ["libraryId"])
    .index("by_created", ["createdAt"]),

  libraries: defineTable({
    ownerId: v.string(),
    status: v.union(v.literal("active"), v.literal("deleting"), v.literal("resetting")),
    timeZone: v.string(),
    plan: v.optional(v.union(v.literal("free"), v.literal("pro"))),
    complimentaryPro: v.optional(v.boolean()),
    statsEpoch: v.optional(v.number()),
    statsReady: v.optional(v.boolean()),
    createdAt: v.number(),
    deletionRequestedAt: v.optional(v.number()),
    reviewerResetAt: v.optional(v.number()),
  }).index("by_owner", ["ownerId"]),

  billing: defineTable({
    ownerId: v.string(),
    subscription: v.union(
      v.null(),
      v.object({
        id: v.string(),
        productId: v.string(),
        interval: v.union(v.literal("month"), v.literal("year")),
        status: v.string(),
        amount: v.number(),
        currency: v.string(),
        currentPeriodEnd: v.string(),
        cancelAtPeriodEnd: v.boolean(),
      }),
    ),
    requested: v.number(),
    applied: v.number(),
    leaseUntil: v.optional(v.number()),
    leaseId: v.optional(v.string()),
    failures: v.optional(v.number()),
    lastError: v.optional(v.string()),
    deleted: v.optional(v.boolean()),
  }).index("by_owner", ["ownerId"]),

  libraryCounters: defineTable({
    libraryId: v.id("libraries"),
    revision: v.number(),
    mediaBytes: v.number(),
    audioBytes: v.optional(v.number()),
    reviewUnits: v.optional(v.number()),
  }).index("by_library", ["libraryId"]),

  settings: defineTable({
    libraryId: v.id("libraries"),
    ...schedulingFields,
    schedulingPreset: v.string(),
    keybindings: v.union(v.string(), v.null()),
    autoplayAudio: v.optional(v.boolean()),
    cardEditorLayout: v.optional(v.union(v.literal("fullPage"), v.literal("dialog"))),
    updatedAt: v.number(),
  }).index("by_library", ["libraryId"]),

  appearance: defineTable({
    libraryId: v.id("libraries"),
    mode: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
    lightTheme: v.string(),
    darkTheme: v.string(),
    customThemes: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        seeds: v.object({
          background: v.string(),
          text: v.string(),
          accent: v.string(),
          again: v.string(),
          hard: v.string(),
          good: v.string(),
          easy: v.string(),
        }),
      }),
    ),
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
    slug: v.optional(v.string()),
    libraryId: v.id("libraries"),
    name: v.string(),
    description: v.union(v.string(), v.null()),
    version: v.number(),
    graphRevision: v.optional(v.number()),
    staging: v.optional(v.boolean()),
    pinnedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_library", ["libraryId"])
    .index("by_library_slug", ["libraryId", "slug"]),

  flashcards: defineTable({
    libraryId: v.id("libraries"),
    deckId: v.id("decks"),
    agentConnectionId: v.optional(v.id("agentConnections")),
    type: v.string(),
    content: v.string(),
    tags: v.array(v.string()),
    posX: v.union(v.number(), v.null()),
    posY: v.union(v.number(), v.null()),
    locked: v.boolean(),
    prerequisiteAccessGranted: v.optional(v.boolean()),
    archived: v.boolean(),
    conceptPool: v.optional(conceptPool),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_library", ["libraryId"])
    .index("by_deck", ["deckId"]),

  conceptVariantUsage: defineTable({
    libraryId: v.id("libraries"),
    month: v.string(),
    used: v.number(),
    reserved: v.number(),
  }).index("by_library_month", ["libraryId", "month"]),

  conceptVariants: defineTable({
    libraryId: v.id("libraries"),
    flashcardId: v.id("flashcards"),
    exercise: v.string(),
    solution: v.string(),
    status: v.union(v.literal("active"), v.literal("flagged")),
    lastShownAt: v.optional(v.number()),
    origin: v.union(v.literal("generated"), v.literal("edited")),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_flashcard", ["flashcardId"])
    .index("by_library", ["libraryId"]),

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
    buriedUntil: v.optional(v.number()),
    frontierKey: v.optional(v.number()),
    variantId: v.optional(v.id("conceptVariants")),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_flashcard", ["flashcardId"])
    .index("by_deck", ["deckId"])
    .index("by_library", ["libraryId"])
    .index("by_deck_eligible_due", ["deckId", "locked", "archived", "due"]),

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
    beforeVariant: v.optional(
      v.object({
        variantId: v.id("conceptVariants"),
        lastShownAt: v.optional(v.number()),
      }),
    ),
    unitVersionAfter: v.number(),
    statsGeneration: v.optional(v.string()),
  })
    .index("by_unit_rating_review", ["reviewUnitId", "rating", "review"])
    .index("by_unit_state_review", ["reviewUnitId", "state", "review"])
    .index("by_unit_review", ["reviewUnitId", "review"])
    .index("by_library_review", ["libraryId", "review"])
    .index("by_library_state_review", ["libraryId", "state", "review"])
    .index("by_flashcard", ["flashcardId"])
    .index("by_flashcard_review", ["flashcardId", "review"])
    .index("by_deck", ["deckId"]),

  cramLogs: defineTable({
    statsGeneration: v.optional(v.string()),
    libraryId: v.id("libraries"),
    deckId: v.id("decks"),
    flashcardId: v.id("flashcards"),
    reviewUnitId: v.id("reviewUnits"),
    rating: v.number(),
    review: v.number(),
  })
    .index("by_library_review", ["libraryId", "review"])
    .index("by_unit_review", ["reviewUnitId", "review"]),

  unitSummaries: defineTable({
    libraryId: v.id("libraries"),
    deckId: v.id("decks"),
    flashcardId: v.id("flashcards"),
    reviewUnitId: v.id("reviewUnits"),
    subKey: v.string(),
    state: v.number(),
    due: v.number(),
    lastReview: v.union(v.number(), v.null()),
    reps: v.number(),
    locked: v.boolean(),
    archived: v.boolean(),
    version: v.number(),
    buriedUntil: v.optional(v.number()),
    createdAt: v.number(),
    latestAgain: v.optional(v.number()),
    introducedAt: v.optional(v.number()),
    frontierKey: v.optional(v.number()),
    concept: v.optional(v.literal(true)),
  })
    .index("by_unit", ["reviewUnitId"])
    .index("by_flashcard", ["flashcardId"])
    .index("by_library", ["libraryId"])
    .index("by_deck", ["deckId"])
    .index("by_library_due", ["libraryId", "locked", "archived", "due"])
    .index("by_deck_due", ["deckId", "locked", "archived", "due"])
    .index("by_library_state_due", ["libraryId", "locked", "archived", "state", "due"])
    .index("by_deck_state_due", ["deckId", "locked", "archived", "state", "due"])
    .index("by_library_frontier", ["libraryId", "locked", "archived", "state", "frontierKey"])
    .index("by_deck_frontier", ["deckId", "locked", "archived", "state", "frontierKey"])
    .index("by_library_kind_state_due", [
      "libraryId",
      "locked",
      "archived",
      "concept",
      "state",
      "due",
    ])
    .index("by_deck_kind_state_due", ["deckId", "locked", "archived", "concept", "state", "due"])
    .index("by_library_kind_frontier", [
      "libraryId",
      "locked",
      "archived",
      "concept",
      "state",
      "frontierKey",
    ])
    .index("by_deck_kind_frontier", [
      "deckId",
      "locked",
      "archived",
      "concept",
      "state",
      "frontierKey",
    ])
    .index("by_library_buried", ["libraryId", "buriedUntil"])
    .index("by_library_introduced", ["libraryId", "introducedAt"]),

  cardActivity: defineTable({
    libraryId: v.id("libraries"),
    flashcardId: v.id("flashcards"),
    deckId: v.id("decks"),
    generation: v.string(),
    day: v.number(),
    count: v.number(),
    reviews: v.number(),
    retained: v.number(),
  })
    .index("by_card_day", ["flashcardId", "generation", "day"])
    .index("by_library", ["libraryId"])
    .index("by_day", ["day"]),

  dailyActivity: defineTable({
    libraryId: v.id("libraries"),
    scope: v.string(),
    generation: v.string(),
    day: v.number(),
    count: v.number(),
    reviews: v.number(),
    retained: v.number(),
  })
    .index("by_scope_day", ["libraryId", "scope", "generation", "day"])
    .index("by_library", ["libraryId"])
    .index("by_day", ["day"]),

  flashcardSummaries: defineTable({
    libraryId: v.id("libraries"),
    deckId: v.id("decks"),
    flashcardId: v.id("flashcards"),
    createdAt: v.number(),
    locked: v.boolean(),
    archived: v.boolean(),
    tagKeys: v.array(v.string()),
    frontKey: v.string(),
    backKey: v.string(),
    deckKey: v.string(),
    searchText: v.string(),
    state: v.number(),
    due: v.number(),
    dueGroup: v.number(),
    stateMask: v.number(),
    units: v.number(),
    newUnits: v.number(),
    learningUnits: v.number(),
    type: v.optional(v.string()),
    lowOnVariants: v.optional(v.boolean()),
  })
    .index("by_flashcard", ["flashcardId"])
    .index("by_library_created", ["libraryId", "createdAt"])
    .index("by_deck_created", ["deckId", "createdAt"])
    .index("by_deck_due", ["deckId", "dueGroup", "due"])
    .index("by_deck_front", ["deckId", "frontKey"])
    .index("by_deck_name", ["deckId", "deckKey", "frontKey"])
    .index("by_deck_back", ["deckId", "backKey"])
    .index("by_deck_locked", ["deckId", "locked", "frontKey"])
    .index("by_deck_state", ["deckId", "state", "frontKey"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["libraryId", "deckId"],
    }),

  deckCounters: defineTable({
    libraryId: v.id("libraries"),
    deckId: v.id("decks"),
    flashcards: v.number(),
    archivedFlashcards: v.number(),
    active: v.number(),
    archived: v.number(),
    learned: v.number(),
    newUnits: v.number(),
    learningUnits: v.number(),
  })
    .index("by_deck", ["deckId"])
    .index("by_library", ["libraryId"]),

  deckUnitCounts: defineTable({
    libraryId: v.id("libraries"),
    deckId: v.id("decks"),
    flashcards: v.number(),
    total: v.number(),
    newCount: v.number(),
    learningCount: v.number(),
    reviewCount: v.number(),
    relearningCount: v.number(),
    lockedCount: v.number(),
    archivedCount: v.number(),
    frontierCandidates: v.number(),
    conceptFrontierCandidates: v.optional(v.number()),
  })
    .index("by_deck", ["deckId"])
    .index("by_library", ["libraryId"]),

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

  media: defineTable({
    libraryId: v.id("libraries"),
    fileName: v.string(),
    storageId: v.id("_storage"),
    thumbnailId: v.optional(v.id("_storage")),
    thumbnailSize: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    mime: v.string(),
    size: v.number(),
    createdAt: v.number(),
  })
    .index("by_library_file", ["libraryId", "fileName"])
    .index("by_library", ["libraryId"])
    .index("by_storage", ["storageId"])
    .index("by_thumbnail", ["thumbnailId"]),

  flashcardMedia: defineTable({
    libraryId: v.id("libraries"),
    flashcardId: v.id("flashcards"),
    fileName: v.string(),
  })
    .index("by_flashcard", ["flashcardId"])
    .index("by_library_file", ["libraryId", "fileName"]),

  requests: defineTable({
    libraryId: v.id("libraries"),
    requestId: v.string(),
    kind: v.string(),
    result: v.any(),
    createdAt: v.number(),
  })
    .index("by_library_request", ["libraryId", "requestId"])
    .index("by_created", ["createdAt"]),

  imports: defineTable({
    libraryId: v.id("libraries"),
    status: v.union(
      v.literal("running"),
      v.literal("finished"),
      v.literal("cancelled"),
      v.literal("failed"),
    ),
    fileName: v.string(),
    decks: v.array(v.object({ key: v.string(), deckId: v.id("decks") })),
    totals: importCounts,
    counts: importCounts,
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_library_status", ["libraryId", "status"])
    .index("by_status_updated", ["status", "updatedAt"]),

  agentImports: defineTable({
    libraryId: v.id("libraries"),
    connectionId: v.id("agentConnections"),
    status: v.union(
      v.literal("staging"),
      v.literal("materializing"),
      v.literal("finalized"),
      v.literal("cancelled"),
      v.literal("failed"),
      v.literal("expired"),
    ),
    fileName: v.string(),
    sourceSha256: v.string(),
    kitVersion: v.string(),
    decks: v.array(agentImportDeck),
    totals: agentImportTotals,
    counts: agentImportCounts,
    polished: v.number(),
    repaired: v.number(),
    materialized: v.number(),
    warnings: v.array(v.object({ code: v.string(), count: v.number(), message: v.string() })),
    planKeys: v.array(v.string()),
    stagedKeys: v.array(v.string()),
    usedDeckKeys: v.array(v.string()),
    unresolved: v.array(v.object({ key: v.string(), deckKey: v.string(), reason: v.string() })),
    skipped: v.array(v.object({ key: v.string(), reason: v.string() })),
    materializedDecks: v.array(v.object({ key: v.string(), deckId: v.id("decks") })),
    changes: v.optional(
      v.array(
        v.object({
          key: v.string(),
          origin: v.union(v.literal("repaired"), v.literal("polished")),
        }),
      ),
    ),
    contentDigest: v.optional(v.string()),
    previewChecksum: v.optional(v.string()),
    uploadTokenHash: v.optional(v.string()),
    uploadTokenExpiresAt: v.optional(v.number()),
    result: v.optional(
      v.object({
        decks: v.array(v.object({ key: v.string(), name: v.string(), deckId: v.id("decks") })),
        flashcards: v.number(),
        reviewUnits: v.number(),
        skipped: v.number(),
        polished: v.number(),
        repaired: v.number(),
      }),
    ),
    error: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_library", ["libraryId"])
    .index("by_library_status", ["libraryId", "status"])
    .index("by_status_updated", ["status", "updatedAt"])
    .index("by_connection_updated", ["connectionId", "updatedAt"]),

  agentImportCards: defineTable({
    libraryId: v.id("libraries"),
    connectionId: v.id("agentConnections"),
    importId: v.id("agentImports"),
    seq: v.number(),
    key: v.string(),
    deckKey: v.string(),
    type: v.string(),
    content: v.string(),
    tags: v.array(v.string()),
    origin: v.union(v.literal("converter"), v.literal("repaired"), v.literal("polished")),
    createdAt: v.number(),
  })
    .index("by_import_seq", ["importId", "seq"])
    .index("by_library", ["libraryId"]),

  agentImportMedia: defineTable({
    libraryId: v.id("libraries"),
    connectionId: v.id("agentConnections"),
    importId: v.id("agentImports"),
    fileName: v.string(),
    createdAt: v.number(),
  })
    .index("by_import_file", ["importId", "fileName"])
    .index("by_import", ["importId"])
    .index("by_library_file", ["libraryId", "fileName"])
    .index("by_library", ["libraryId"])
    .index("by_created", ["createdAt"]),

  exports: defineTable({
    libraryId: v.id("libraries"),
    status: v.union(v.literal("pending"), v.literal("ready"), v.literal("failed")),
    storageId: v.optional(v.id("_storage")),
    fileName: v.string(),
    size: v.optional(v.number()),
    error: v.optional(v.string()),
    includeAudio: v.optional(v.boolean()),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_library", ["libraryId"])
    .index("by_storage", ["storageId"]),
});
