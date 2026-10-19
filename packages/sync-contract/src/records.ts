import { z } from "zod";
import {
  FLASHCARD_TYPES,
  parseStoredContent,
} from "@armin/core/flashcard-types";

/**
 * Synced records. Each record is identified by its kind and id and carries the
 * data a client needs to rebuild its local Profile rows. Derived state (lock
 * flags, cached review-unit display strings) is not synced; clients regenerate
 * it from these records.
 */
export const RECORD_KINDS = [
  "deck",
  "flashcard",
  "review_unit",
  "review_log",
  "deck_graph",
  "settings",
  "deck_settings",
] as const;

export type RecordKind = (typeof RECORD_KINDS)[number];

/** The id of the single Profile settings record. */
export const SETTINGS_RECORD_ID = "profile";

const recordId = z.string().min(1).max(128);
/** Milliseconds since the Unix epoch. */
const timestamp = z.number().int().nonnegative();

export const deckDataSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const flashcardDataSchema = z
  .object({
    deckId: recordId,
    type: z.enum(FLASHCARD_TYPES),
    /** Type-specific content serialized as JSON, as stored locally. */
    content: z.string(),
    /** Tag names; tags have no identity beyond their name. */
    tags: z.array(z.string().min(1)),
    archived: z.boolean(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .superRefine((card, ctx) => {
    try {
      parseStoredContent(card.type, card.content);
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["content"],
        message: `Content is not valid ${card.type} Flashcard content.`,
      });
    }
  });

/** FSRS scheduling state calculated by the client (ts-fsrs `Card`). */
export const reviewProgressSchema = z.object({
  due: timestamp,
  stability: z.number(),
  difficulty: z.number(),
  elapsedDays: z.number(),
  scheduledDays: z.number(),
  learningSteps: z.number().int(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  /** 0=New, 1=Learning, 2=Review, 3=Relearning. */
  state: z.number().int().min(0).max(3),
  lastReview: timestamp.nullable(),
});

export const reviewUnitDataSchema = z.object({
  flashcardId: recordId,
  /** Stable key within the Flashcard ("", "rev", "c1", or a mask id). */
  subKey: z.string(),
  progress: reviewProgressSchema,
  createdAt: timestamp,
});

/** One review in the append-only history (ts-fsrs `ReviewLog`). */
export const reviewEntrySchema = z.object({
  rating: z.number().int().min(0).max(4),
  state: z.number().int().min(0).max(3),
  due: timestamp,
  stability: z.number(),
  difficulty: z.number(),
  elapsedDays: z.number(),
  lastElapsedDays: z.number(),
  scheduledDays: z.number(),
  learningSteps: z.number().int(),
  review: timestamp,
});

export const reviewLogDataSchema = reviewEntrySchema.extend({
  reviewUnitId: recordId,
});

/**
 * A Deck's whole prerequisite graph, versioned as one record whose id is the
 * Deck id: the edges and the canvas positions of its Flashcards.
 */
export const deckGraphDataSchema = z.object({
  edges: z.array(z.object({ prereqId: recordId, dependentId: recordId })),
  positions: z.record(recordId, z.object({ x: z.number(), y: z.number() })),
});

const schedulingFields = {
  requestRetention: z.number().gt(0).lt(1),
  maximumInterval: z.number().int().positive(),
  enableFuzz: z.boolean(),
  enableShortTerm: z.boolean(),
  learningSteps: z.string(),
  relearningSteps: z.string(),
  weights: z.array(z.number()).nullable(),
  prereqStabilityFloor: z.number().nonnegative(),
  newReviewUnitsPerDay: z.number().int().nonnegative(),
  keepSiblingReviewUnitsTogether: z.boolean(),
};

/** All Profile settings, including keyboard shortcut overrides. */
export const settingsDataSchema = z.object({
  ...schedulingFields,
  schedulingPreset: z.enum(["balanced", "aggressive", "relaxed", "custom"]),
  /** Command id → binding; null means factory defaults. */
  keybindings: z.record(z.string(), z.string()).nullable(),
  updatedAt: timestamp,
});

/** Per-Deck study overrides; null fields inherit the Profile settings. */
export const deckSettingsDataSchema = z.object({
  requestRetention: schedulingFields.requestRetention.nullable(),
  maximumInterval: schedulingFields.maximumInterval.nullable(),
  enableFuzz: schedulingFields.enableFuzz.nullable(),
  enableShortTerm: schedulingFields.enableShortTerm.nullable(),
  learningSteps: schedulingFields.learningSteps.nullable(),
  relearningSteps: schedulingFields.relearningSteps.nullable(),
  weights: schedulingFields.weights,
  prereqStabilityFloor: schedulingFields.prereqStabilityFloor.nullable(),
  newReviewUnitsPerDay: schedulingFields.newReviewUnitsPerDay.nullable(),
  keepSiblingReviewUnitsTogether:
    schedulingFields.keepSiblingReviewUnitsTogether.nullable(),
  updatedAt: timestamp,
});

export const recordDataSchemas = {
  deck: deckDataSchema,
  flashcard: flashcardDataSchema,
  review_unit: reviewUnitDataSchema,
  review_log: reviewLogDataSchema,
  deck_graph: deckGraphDataSchema,
  settings: settingsDataSchema,
  deck_settings: deckSettingsDataSchema,
} as const;

export type RecordData = {
  [K in RecordKind]: z.infer<(typeof recordDataSchemas)[K]>;
};

const recordOf = <K extends RecordKind>(kind: K) =>
  z.object({
    kind: z.literal(kind),
    id: recordId,
    data: recordDataSchemas[kind],
  });

/** A complete record, as sent in the initial Profile upload. */
export const syncRecordSchema = z.discriminatedUnion("kind", [
  recordOf("deck"),
  recordOf("flashcard"),
  recordOf("review_unit"),
  recordOf("review_log"),
  recordOf("deck_graph"),
  recordOf("settings"),
  recordOf("deck_settings"),
]);

export type SyncRecord = z.infer<typeof syncRecordSchema>;

/** A record as stored on the server, including deletion markers. */
export type RecordState = {
  [K in RecordKind]: {
    kind: K;
    id: string;
    version: number;
    deleted: boolean;
    data: RecordData[K] | null;
  };
}[RecordKind];

/** Which record a record's relationship check is scoped to. */
export function parentIdOf(record: SyncRecord) {
  switch (record.kind) {
    case "flashcard":
      return record.data.deckId;
    case "review_unit":
      return record.data.flashcardId;
    case "review_log":
      return record.data.reviewUnitId;
    case "deck_graph":
    case "deck_settings":
      return record.id;
    case "deck":
    case "settings":
      return null;
  }
}
