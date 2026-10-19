import { z } from "zod";
import {
  recordDataSchemas,
  reviewEntrySchema,
  reviewProgressSchema,
  syncRecordSchema,
  type RecordKind,
  type RecordState,
} from "./records";

/**
 * Protocol version. Routes are served under `/v<version>`; a breaking change to
 * any schema in this package needs a new version.
 */
export const SYNC_PROTOCOL_VERSION = 1;
export const SYNC_API_PREFIX = `/v${SYNC_PROTOCOL_VERSION}`;

export const MAX_UPLOAD_RECORDS_PER_REQUEST = 500;
export const MAX_MUTATIONS_PER_PUSH = 50;
export const MAX_OPERATIONS_PER_MUTATION = 500;
export const DEFAULT_PULL_LIMIT = 500;
export const MAX_PULL_LIMIT = 1000;

const recordId = z.string().min(1).max(128);
/** Client-generated, globally unique; a retry reuses it. */
const mutationId = z.string().min(8).max(128);
const version = z.number().int().positive();

// --- Account status ---

export type ProfileStatus =
  | { status: "empty" }
  | { status: "uploading"; uploadId: string }
  | { status: "ready"; position: string };

// --- Initial Profile upload ---

export const startUploadRequestSchema = z.object({ uploadId: mutationId });

export const uploadRecordsRequestSchema = z.object({
  records: z.array(syncRecordSchema).min(1).max(MAX_UPLOAD_RECORDS_PER_REQUEST),
});

export type UploadRecordsResponse = { staged: number };
export type CompleteUploadResponse = { status: "ready"; position: string };

// --- Push ---

/** Kinds a records mutation may write; review logs change only via reviews. */
const editableKinds = [
  "deck",
  "flashcard",
  "review_unit",
  "deck_graph",
  "settings",
  "deck_settings",
] as const satisfies readonly RecordKind[];

const putOf = <K extends (typeof editableKinds)[number]>(kind: K) =>
  z.object({
    op: z.literal("put"),
    kind: z.literal(kind),
    id: recordId,
    /** Version the change is based on; null when the record is new. */
    baseVersion: version.nullable(),
    data: recordDataSchemas[kind],
  });

export const putOperationSchema = z.discriminatedUnion("kind", [
  putOf("deck"),
  putOf("flashcard"),
  putOf("review_unit"),
  putOf("deck_graph"),
  putOf("settings"),
  putOf("deck_settings"),
]);

export const deleteOperationSchema = z.object({
  op: z.literal("delete"),
  kind: z.enum(editableKinds),
  id: recordId,
  baseVersion: version,
});

/**
 * An atomic group of record writes: every operation is accepted together or
 * none are. Group a content edit with the Review units it creates or removes,
 * and a deletion or Deck move with the prerequisite-graph update it requires.
 */
export const recordsMutationSchema = z.object({
  type: z.literal("records"),
  mutationId,
  operations: z
    .array(z.union([putOperationSchema, deleteOperationSchema]))
    .min(1)
    .max(MAX_OPERATIONS_PER_MUTATION),
});

/** A review: the client's calculated schedule plus its history entry. */
export const reviewMutationSchema = z.object({
  type: z.literal("review"),
  mutationId,
  reviewUnitId: recordId,
  baseVersion: version,
  /** The Flashcard version the review was shown from. */
  flashcardVersion: version,
  progress: reviewProgressSchema,
  log: reviewEntrySchema.extend({ id: recordId }),
});

/** Undo of the latest review: restores the schedule and removes its log. */
export const undoReviewMutationSchema = z.object({
  type: z.literal("undo_review"),
  mutationId,
  reviewUnitId: recordId,
  baseVersion: version,
  flashcardVersion: version,
  reviewLogId: recordId,
  progress: reviewProgressSchema,
});

export const mutationSchema = z.discriminatedUnion("type", [
  recordsMutationSchema,
  reviewMutationSchema,
  undoReviewMutationSchema,
]);

export const pushRequestSchema = z.object({
  mutations: z.array(mutationSchema).min(1).max(MAX_MUTATIONS_PER_PUSH),
});

export type Mutation = z.infer<typeof mutationSchema>;
export type RecordsMutation = z.infer<typeof recordsMutationSchema>;
export type ReviewMutation = z.infer<typeof reviewMutationSchema>;
export type UndoReviewMutation = z.infer<typeof undoReviewMutationSchema>;
export type PutOperation = z.infer<typeof putOperationSchema>;
export type DeleteOperation = z.infer<typeof deleteOperationSchema>;

export type RecordVersion = {
  kind: RecordKind;
  id: string;
  version: number;
  deleted: boolean;
};

/** A record whose expected version did not match; `current` is null if absent. */
export type Conflict = {
  kind: RecordKind;
  id: string;
  current: RecordState | null;
};

export type RejectionCode =
  | "invalid_operation"
  | "integrity"
  | "missing_media"
  | "duplicate_record";

export type MutationResult =
  | {
      mutationId: string;
      status: "accepted";
      /** Every record the mutation wrote, including cascaded deletions. */
      records: RecordVersion[];
    }
  | { mutationId: string; status: "conflict"; conflicts: Conflict[] }
  | {
      mutationId: string;
      status: "rejected";
      code: RejectionCode;
      message: string;
    };

export type PushResponse = { results: MutationResult[] };

// --- Pull ---

/**
 * Changed records after an opaque sync position, oldest first. Keep pulling
 * until `hasMore` is false, then save `position`. A position from the middle of
 * a pull may split an accepted change; apply pages together.
 */
export type PullResponse = {
  records: RecordState[];
  position: string;
  hasMore: boolean;
};

export type ErrorResponse = {
  error: {
    code:
      | "unauthorized"
      | "invalid_request"
      | "not_found"
      | "not_initialized"
      | "already_initialized"
      | "upload_superseded"
      | "integrity"
      | "missing_media"
      | "media_too_large"
      | "media_hash_mismatch";
    message: string;
  };
};
