import {
  parentIdOf,
  SETTINGS_RECORD_ID,
  type Conflict,
  type Mutation,
  type RecordKind,
  type RecordsMutation,
  type RejectionCode,
  type ReviewMutation,
  type SyncRecord,
  type UndoReviewMutation,
} from "@armin/sync-contract";
import {
  readLiveChildren,
  readRecords,
  recordKey,
  toRecordState,
  type RecordRow,
  type RecordWrite,
} from "./db";
import { emptyTouched, findIntegrityProblem } from "./integrity";
import { overlayView } from "./views";

export type Evaluation =
  | { outcome: "write"; writes: RecordWrite[] }
  | { outcome: "conflict"; conflicts: Conflict[] }
  | { outcome: "rejected"; code: RejectionCode; message: string };

const rejected = (code: RejectionCode, message: string): Evaluation => ({
  outcome: "rejected",
  code,
  message,
});

const conflictWith = (
  kind: RecordKind,
  id: string,
  row: RecordRow | undefined,
): Conflict => ({ kind, id, current: row ? toRecordState(row) : null });

/**
 * Decide what a mutation would write against the Account's current records.
 * The result is only valid if no other commit lands before it is written.
 */
export function evaluateMutation(
  db: D1Database,
  accountId: string,
  mutation: Mutation,
) {
  switch (mutation.type) {
    case "records":
      return evaluateRecords(db, accountId, mutation);
    case "review":
      return evaluateReview(db, accountId, mutation);
    case "undo_review":
      return evaluateUndo(db, accountId, mutation);
  }
}

async function evaluateRecords(
  db: D1Database,
  accountId: string,
  mutation: RecordsMutation,
): Promise<Evaluation> {
  const keys = new Set<string>();
  for (const op of mutation.operations) {
    const key = recordKey(op.kind, op.id);
    if (keys.has(key)) {
      return rejected(
        "invalid_operation",
        `${op.kind} ${op.id} appears more than once.`,
      );
    }
    keys.add(key);
    if (
      op.kind === "settings" &&
      (op.op === "delete" || op.id !== SETTINGS_RECORD_ID)
    ) {
      return rejected(
        "invalid_operation",
        `Profile settings are the single record "${SETTINGS_RECORD_ID}" and cannot be deleted.`,
      );
    }
    if (
      op.kind === "review_unit" &&
      op.op === "put" &&
      op.baseVersion !== null
    ) {
      return rejected(
        "invalid_operation",
        "Review units are created by content changes; their progress changes only through reviews.",
      );
    }
  }

  const rows = await readRecords(db, accountId, mutation.operations);
  const conflicts: Conflict[] = [];
  for (const op of mutation.operations) {
    const row = rows.get(recordKey(op.kind, op.id));
    const stale =
      op.op === "put"
        ? op.baseVersion !== (row?.version ?? null)
        : !row || row.deleted === 1 || row.version !== op.baseVersion;
    if (stale) conflicts.push(conflictWith(op.kind, op.id, row));
  }
  if (conflicts.length > 0) return { outcome: "conflict", conflicts };

  const writes: RecordWrite[] = [];
  const touched = emptyTouched();
  const deletedUnits: string[] = [];
  for (const op of mutation.operations) {
    const row = rows.get(recordKey(op.kind, op.id));
    const version = (row?.version ?? 0) + 1;
    const before = row && row.deleted === 0 ? JSON.parse(row.data!) : null;
    if (op.op === "put") {
      const record = { kind: op.kind, id: op.id, data: op.data } as SyncRecord;
      writes.push({
        ...record,
        parentId: parentIdOf(record),
        version,
        deleted: false,
      });
    } else {
      writes.push({
        kind: op.kind,
        id: op.id,
        parentId: row!.parent_id,
        version,
        deleted: true,
        data: null,
      });
    }

    switch (op.kind) {
      case "deck":
        touched.decks.add(op.id);
        break;
      case "flashcard": {
        touched.flashcards.add(op.id);
        const movedOrDeleted =
          op.op === "delete" || before?.deckId !== op.data.deckId;
        if (before && movedOrDeleted) touched.graphs.add(before.deckId);
        break;
      }
      case "review_unit":
        touched.flashcards.add(
          op.op === "put" ? op.data.flashcardId : before.flashcardId,
        );
        if (op.op === "delete") deletedUnits.push(op.id);
        break;
      case "deck_graph":
        touched.graphs.add(op.id);
        break;
      case "deck_settings":
        touched.deckSettings.add(op.id);
        break;
      case "settings":
        break;
    }
  }

  // Removing a Review unit removes its review history with it.
  for (const log of await readLiveChildren(
    db,
    accountId,
    "review_log",
    deletedUnits,
  )) {
    writes.push({
      kind: "review_log",
      id: log.id,
      parentId: log.parent_id,
      version: log.version + 1,
      deleted: true,
      data: null,
    });
  }

  const problem = await findIntegrityProblem(
    overlayView(db, accountId, writes),
    touched,
  );
  if (problem) return rejected(problem.code, problem.message);
  return { outcome: "write", writes };
}

/** Load a review's Review unit and Flashcard, or the conflicts that stop it. */
async function reviewTarget(
  db: D1Database,
  accountId: string,
  mutation: ReviewMutation | UndoReviewMutation,
) {
  const unitRows = await readRecords(db, accountId, [
    { kind: "review_unit", id: mutation.reviewUnitId },
  ]);
  const unit = unitRows.get(recordKey("review_unit", mutation.reviewUnitId));
  if (!unit || unit.deleted === 1 || unit.version !== mutation.baseVersion) {
    return {
      conflicts: [conflictWith("review_unit", mutation.reviewUnitId, unit)],
    };
  }
  const flashcardId = unit.parent_id!;
  const cardRows = await readRecords(db, accountId, [
    { kind: "flashcard", id: flashcardId },
  ]);
  const card = cardRows.get(recordKey("flashcard", flashcardId));
  if (
    !card ||
    card.deleted === 1 ||
    card.version !== mutation.flashcardVersion
  ) {
    return { conflicts: [conflictWith("flashcard", flashcardId, card)] };
  }
  return { unit };
}

async function evaluateReview(
  db: D1Database,
  accountId: string,
  mutation: ReviewMutation,
): Promise<Evaluation> {
  const target = await reviewTarget(db, accountId, mutation);
  if (!target.unit) return { outcome: "conflict", conflicts: target.conflicts };

  const { id: logId, ...entry } = mutation.log;
  const existing = await readRecords(db, accountId, [
    { kind: "review_log", id: logId },
  ]);
  if (existing.size > 0) {
    return rejected("duplicate_record", `Review log ${logId} already exists.`);
  }

  const unitData = JSON.parse(target.unit.data!);
  return {
    outcome: "write",
    writes: [
      {
        kind: "review_unit",
        id: mutation.reviewUnitId,
        parentId: target.unit.parent_id,
        version: target.unit.version + 1,
        deleted: false,
        data: { ...unitData, progress: mutation.progress },
      },
      {
        kind: "review_log",
        id: logId,
        parentId: mutation.reviewUnitId,
        version: 1,
        deleted: false,
        data: { ...entry, reviewUnitId: mutation.reviewUnitId },
      },
    ],
  };
}

async function evaluateUndo(
  db: D1Database,
  accountId: string,
  mutation: UndoReviewMutation,
): Promise<Evaluation> {
  const target = await reviewTarget(db, accountId, mutation);
  if (!target.unit) return { outcome: "conflict", conflicts: target.conflicts };

  const latest = await db
    .prepare(
      `SELECT kind, id, parent_id, version, seq, deleted, data FROM sync_records
       WHERE account_id = ?1 AND kind = 'review_log' AND parent_id = ?2 AND deleted = 0
       ORDER BY seq DESC, json_extract(data, '$.review') DESC, id DESC
       LIMIT 1`,
    )
    .bind(accountId, mutation.reviewUnitId)
    .first<RecordRow>();
  if (!latest || latest.id !== mutation.reviewLogId) {
    const rows = await readRecords(db, accountId, [
      { kind: "review_log", id: mutation.reviewLogId },
    ]);
    return {
      outcome: "conflict",
      conflicts: [
        conflictWith(
          "review_log",
          mutation.reviewLogId,
          rows.get(recordKey("review_log", mutation.reviewLogId)),
        ),
      ],
    };
  }

  const unitData = JSON.parse(target.unit.data!);
  return {
    outcome: "write",
    writes: [
      {
        kind: "review_unit",
        id: mutation.reviewUnitId,
        parentId: target.unit.parent_id,
        version: target.unit.version + 1,
        deleted: false,
        data: { ...unitData, progress: mutation.progress },
      },
      {
        kind: "review_log",
        id: latest.id,
        parentId: latest.parent_id,
        version: latest.version + 1,
        deleted: true,
        data: null,
      },
    ],
  };
}
