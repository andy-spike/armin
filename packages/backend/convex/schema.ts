import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Study data belongs to a library derived from the first-party session or a
 * component-verified assistant grant, never a caller-supplied account ID.
 * Retired OAuth tables are kept until their bounded cleanup drains them.
 * Timestamps are epoch milliseconds.
 */

const legacyAgentScope = v.union(v.literal("created"), v.literal("selected"), v.literal("library"));

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
  /** Maximum reviews per study day; null = unlimited. Optional on older rows. */
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

export default defineSchema({
  /**
   * Retired dynamic client registration. No code writes these rows; the hourly
   * prune removes them once their expiry passes.
   */
  agentClients: defineTable({
    name: v.string(),
    redirectUris: v.array(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index("by_expiry", ["expiresAt"]),
  /** Retired consent requests from the Armin OAuth server; pruned by expiry. */
  agentAuthorizations: defineTable({
    requestHash: v.string(),
    clientId: v.id("agentClients"),
    redirectUri: v.string(),
    state: v.string(),
    challenge: v.string(),
    resource: v.string(),
    expiresAt: v.number(),
    codeHash: v.optional(v.string()),
    connectionId: v.optional(v.id("agentConnections")),
    libraryId: v.optional(v.id("libraries")),
  })
    .index("by_request", ["requestHash"])
    .index("by_code", ["codeHash"])
    .index("by_expiry", ["expiresAt"])
    .index("by_library", ["libraryId"]),
  /**
   * One app-side record per approved assistant connection. The `@convex-dev/mcp`
   * component owns the credential; `componentConnectionId` links this row to its
   * grant. Rows are kept after revocation for provenance, activity, and retries.
   */
  agentConnections: defineTable({
    libraryId: v.id("libraries"),
    /** Component grant id. Absent on connections from the retired OAuth server. */
    componentConnectionId: v.optional(v.string()),
    /** @deprecated Retired OAuth client. */
    clientId: v.optional(v.id("agentClients")),
    name: v.string(),
    /** OAuth resource audience; the component also binds tokens to it. */
    resource: v.string(),
    /** @deprecated Per-deck permissions were removed; kept for old rows only. */
    scope: v.optional(legacyAgentScope),
    deckIds: v.optional(v.array(v.id("decks"))),
    allowCreateDecks: v.optional(v.boolean()),
    allowEdits: v.optional(v.boolean()),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    /** @deprecated Retired token hashes; the migration clears them. */
    accessHash: v.optional(v.string()),
    accessExpiresAt: v.optional(v.number()),
    refreshHash: v.optional(v.string()),
    refreshExpiresAt: v.optional(v.number()),
  })
    .index("by_library", ["libraryId"])
    .index("by_library_revoked", ["libraryId", "revokedAt"])
    .index("by_component", ["componentConnectionId"]),
  /** @deprecated Retired refresh-token replay records; pruned by expiry. */
  agentUsedRefreshTokens: defineTable({
    libraryId: v.id("libraries"),
    connectionId: v.id("agentConnections"),
    hash: v.string(),
    expiresAt: v.number(),
  })
    .index("by_hash", ["hash"])
    .index("by_library", ["libraryId"])
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
  agentRateLimits: defineTable({
    libraryId: v.optional(v.id("libraries")),
    key: v.string(),
    count: v.number(),
    expiresAt: v.number(),
  })
    .index("by_library", ["libraryId"])
    .index("by_key", ["key"])
    .index("by_expiry", ["expiresAt"]),

  /** One library per Better Auth user. */
  libraries: defineTable({
    ownerId: v.string(),
    status: v.union(v.literal("active"), v.literal("deleting"), v.literal("resetting")),
    timeZone: v.string(),
    /** Billing plan; absent means free. */
    plan: v.optional(v.union(v.literal("free"), v.literal("pro"))),
    statsEpoch: v.optional(v.number()),
    statsReady: v.optional(v.boolean()),
    createdAt: v.number(),
    deletionRequestedAt: v.optional(v.number()),
    reviewerResetAt: v.optional(v.number()),
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
    slug: v.optional(v.string()),
    libraryId: v.id("libraries"),
    name: v.string(),
    description: v.union(v.string(), v.null()),
    version: v.number(),
    /** True while an MCP import is materializing cards; excluded from every normal read. */
    staging: v.optional(v.boolean()),
    /** When the owner pinned the deck to the sidebar; absent when unpinned. */
    pinnedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_library", ["libraryId"])
    .index("by_library_slug", ["libraryId", "slug"]),

  /** The authored unit. Content is type-specific JSON validated by core. */
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
    /**
     * Hidden until this epoch-ms instant (the start of the next study day in
     * the library time zone). Optional so rows written before bury existed
     * stay valid, and absent means never buried.
     */
    buriedUntil: v.optional(v.number()),
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
    statsGeneration: v.optional(v.string()),
  })
    .index("by_unit_rating_review", ["reviewUnitId", "rating", "review"])
    .index("by_unit_state_review", ["reviewUnitId", "state", "review"])
    .index("by_unit_review", ["reviewUnitId", "review"])
    .index("by_library_review", ["libraryId", "review"])
    .index("by_library_state_review", ["libraryId", "state", "review"])
    .index("by_library_rating_review", ["libraryId", "rating", "review"])
    .index("by_flashcard", ["flashcardId"])
    .index("by_flashcard_review", ["flashcardId", "review"])
    .index("by_deck", ["deckId"]),

  /**
   * Practice-only cram ratings. They never feed the FSRS schedule, locks, or
   * `reviewLogs`; deleting a card, deck, or library clears them with history.
   */
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

  /** Text-free scheduling projection; maintained atomically with each unit. */
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
    /** Fixed new-card order (`frontierKey` in model/performance.ts). */
    frontierKey: v.optional(v.number()),
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
    .index("by_library_buried", ["libraryId", "buriedUntil"])
    .index("by_library_introduced", ["libraryId", "introducedAt"]),

  /** Rolling activity per card, used to transfer/subtract history on move/delete. */
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

  /** One tiny row per study day, both library-wide and per deck. */
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

  /**
   * Derived Browse row for each flashcard: its sort keys, search text, and the
   * aggregate of its review units. Rebuilt in the same mutation as any write
   * to the flashcard or its units (model/summaries.ts), so Browse pages through
   * these indexes without reading review units.
   */
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
    /** Least-learned unit state and soonest unit due, as the tile shows them. */
    state: v.number(),
    due: v.number(),
    /** 0 scheduled, 1 new, 2 locked: the "due soon" order before `due`. */
    dueGroup: v.number(),
    /** Bit per unit state present, for the state filter. */
    stateMask: v.number(),
    units: v.number(),
    newUnits: v.number(),
    learningUnits: v.number(),
  })
    .index("by_flashcard", ["flashcardId"])
    .index("by_library_created", ["libraryId", "createdAt"])
    .index("by_library_due", ["libraryId", "dueGroup", "due"])
    .index("by_library_front", ["libraryId", "frontKey"])
    .index("by_library_back", ["libraryId", "backKey"])
    .index("by_library_locked", ["libraryId", "locked", "frontKey"])
    .index("by_library_state", ["libraryId", "state", "frontKey"])
    .index("by_library_deck", ["libraryId", "deckKey", "frontKey"])
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

  /** Per-deck totals, the sum of the deck's flashcard summaries. */
  deckCounters: defineTable({
    libraryId: v.id("libraries"),
    deckId: v.id("decks"),
    flashcards: v.number(),
    archivedFlashcards: v.number(),
    /** Unarchived flashcards with review units: the deck's card total. */
    active: v.number(),
    /** Archived flashcards with review units. */
    archived: v.number(),
    learned: v.number(),
    newUnits: v.number(),
    learningUnits: v.number(),
  })
    .index("by_deck", ["deckId"])
    .index("by_library", ["libraryId"]),

  /**
   * Deck sizes (`model/deckSizes.ts`), kept by triggers. They bound deck size
   * and give Frontier counts without reading every unit.
   */
  deckUnitCounts: defineTable({
    libraryId: v.id("libraries"),
    deckId: v.id("decks"),
    flashcards: v.number(),
    /** Review units, and their states as `summarizeReviewUnitStates` counts them. */
    total: v.number(),
    newCount: v.number(),
    learningCount: v.number(),
    reviewCount: v.number(),
    relearningCount: v.number(),
    lockedCount: v.number(),
    archivedCount: v.number(),
    /** New, unlocked, unarchived, never-reviewed units. */
    frontierCandidates: v.number(),
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

  /** Private library images. Served only through authenticated routes. */
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

  /**
   * One Anki import: the decks it created and how much of the declared plan has
   * arrived. A "running" import that stops making progress is cancelled by a
   * cron job, which removes its decks.
   */
  imports: defineTable({
    libraryId: v.id("libraries"),
    status: v.union(
      v.literal("running"),
      v.literal("finished"),
      v.literal("cancelled"),
      v.literal("failed"),
    ),
    fileName: v.string(),
    /** Armin decks created for the plan's deck keys. */
    decks: v.array(v.object({ key: v.string(), deckId: v.id("decks") })),
    /** Declared up front; quotas are checked against it and `counts` may not exceed it. */
    totals: importCounts,
    counts: importCounts,
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_library_status", ["libraryId", "status"])
    .index("by_status_updated", ["status", "updatedAt"]),

  /**
   * An MCP Anki import. Cards stay in `agentImportCards` while staging; only
   * finalization creates hidden decks, and those decks become visible together
   * after every card is written. An abandoned session expires.
   */
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
    /** Kit totals, kept for the preview and manifest. */
    totals: agentImportTotals,
    counts: agentImportCounts,
    polished: v.number(),
    repaired: v.number(),
    materialized: v.number(),
    warnings: v.array(v.object({ code: v.string(), count: v.number(), message: v.string() })),
    /** Converter plan keys that must each be imported or explicitly skipped. */
    planKeys: v.array(v.string()),
    /** Keys already staged. Kept on the row so preview and finalize read no card bodies. */
    stagedKeys: v.array(v.string()),
    /** Deck keys that actually received a card; empty declarations are not materialized. */
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
    .index("by_library_updated", ["libraryId", "updatedAt"])
    .index("by_connection_updated", ["connectionId", "updatedAt"]),

  /** Normalized cards waiting for finalization. Never visible in the library. */
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
    .index("by_import_key", ["importId", "key"])
    .index("by_library", ["libraryId"]),

  /** Media uploaded for one staging import; cleanup preserves shared images. */
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
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_library", ["libraryId"])
    .index("by_storage", ["storageId"]),
});
