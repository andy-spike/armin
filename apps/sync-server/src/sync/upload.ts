import {
  parentIdOf,
  SETTINGS_RECORD_ID,
  type ProfileStatus,
  type SyncRecord,
} from "@armin/sync-contract";
import { SyncError } from "../errors";
import {
  getAccount,
  isGuardFailure,
  jsonArrayChunks,
  missingMedia,
  type AccountRow,
} from "./db";
import { emptyTouched, findIntegrityProblem } from "./integrity";
import { startPosition } from "./pull";
import { memoryView } from "./views";

/** Records are published as commit 1, the first sync position. */
const UPLOAD_SEQ = 1;

function statusOf(account: AccountRow | null): ProfileStatus {
  if (!account) return { status: "empty" };
  if (account.status === "uploading") {
    return { status: "uploading", uploadId: account.upload_id };
  }
  return { status: "ready", position: startPosition(account.head_seq) };
}

export async function getProfileStatus(db: D1Database, accountId: string) {
  return statusOf(await getAccount(db, accountId));
}

/**
 * Begin (or resume) the initial upload that fills an empty Account from one
 * Profile. Starting with a new upload id discards anything an earlier,
 * abandoned upload staged.
 */
export async function startUpload(
  db: D1Database,
  accountId: string,
  uploadId: string,
) {
  await db
    .prepare(
      `INSERT INTO sync_accounts (account_id, status, upload_id, created_at)
       VALUES (?1, 'uploading', ?2, ?3) ON CONFLICT (account_id) DO NOTHING`,
    )
    .bind(accountId, uploadId, Date.now())
    .run();
  let account = await getAccount(db, accountId);
  if (account?.status === "uploading" && account.upload_id !== uploadId) {
    await db.batch([
      db
        .prepare(
          `UPDATE sync_accounts SET upload_id = ?2, upload_revision = upload_revision + 1
           WHERE account_id = ?1 AND status = 'uploading'`,
        )
        .bind(accountId, uploadId),
      db
        .prepare("DELETE FROM sync_upload_records WHERE account_id = ?1")
        .bind(accountId),
    ]);
    account = await getAccount(db, accountId);
  }
  if (account?.status === "ready") {
    throw new SyncError(
      409,
      "already_initialized",
      "This Account already has a Profile.",
    );
  }
  return statusOf(account);
}

/** Refuse an upload request whose upload id is no longer the active one. */
async function uploadRefusal(
  db: D1Database,
  accountId: string,
  uploadId: string,
) {
  const account = await getAccount(db, accountId);
  if (!account) {
    return new SyncError(404, "not_found", "Start an upload first.");
  }
  if (account.status === "ready") {
    return new SyncError(
      409,
      "already_initialized",
      "This Account already has a Profile.",
    );
  }
  if (account.upload_id !== uploadId) {
    return new SyncError(
      409,
      "upload_superseded",
      "A newer upload replaced this one.",
    );
  }
  return null;
}

/** Stage a chunk of the upload. Re-sending a record replaces it. */
export async function stageRecords(
  db: D1Database,
  accountId: string,
  uploadId: string,
  records: SyncRecord[],
) {
  const refusal = await uploadRefusal(db, accountId, uploadId);
  if (refusal) throw refusal;

  const encoded = records.map((record) =>
    JSON.stringify({
      kind: record.kind,
      id: record.id,
      parentId: parentIdOf(record),
      data: JSON.stringify(record.data),
    }),
  );
  try {
    await db.batch([
      // Bumping the revision tells a concurrent completion that the staged set changed.
      db
        .prepare(
          `UPDATE sync_accounts SET upload_revision = CASE
             WHEN status = 'uploading' AND upload_id = ?2 THEN upload_revision + 1 ELSE NULL END
           WHERE account_id = ?1`,
        )
        .bind(accountId, uploadId),
      ...jsonArrayChunks(encoded).map((chunk) =>
        db
          .prepare(
            `INSERT INTO sync_upload_records (account_id, kind, id, parent_id, data)
             SELECT ?1, json_extract(value, '$.kind'), json_extract(value, '$.id'),
               json_extract(value, '$.parentId'), json_extract(value, '$.data')
             FROM json_each(?2) WHERE true
             ON CONFLICT (account_id, kind, id) DO UPDATE SET
               parent_id = excluded.parent_id, data = excluded.data`,
          )
          .bind(accountId, chunk),
      ),
    ]);
  } catch (error) {
    if (!isGuardFailure(error)) throw error;
    throw (await uploadRefusal(db, accountId, uploadId)) ?? error;
  }
  return { staged: records.length };
}

type StagedRow = {
  kind: SyncRecord["kind"];
  id: string;
  parent_id: string | null;
  data: string;
};

async function readStaged(db: D1Database, accountId: string) {
  const records: (SyncRecord & { parentId: string | null })[] = [];
  let after: [string, string] = ["", ""];
  for (;;) {
    const { results } = await db
      .prepare(
        `SELECT kind, id, parent_id, data FROM sync_upload_records
         WHERE account_id = ?1 AND (kind > ?2 OR (kind = ?2 AND id > ?3))
         ORDER BY kind, id LIMIT 1000`,
      )
      .bind(accountId, ...after)
      .all<StagedRow>();
    for (const row of results) {
      records.push({
        kind: row.kind,
        id: row.id,
        parentId: row.parent_id,
        data: JSON.parse(row.data),
      } as SyncRecord & { parentId: string | null });
    }
    if (results.length < 1000) return records;
    const last = results.at(-1)!;
    after = [last.kind, last.id];
  }
}

/**
 * Validate the staged Profile as a whole and publish it as the Account's
 * first commit. Completing an already-completed upload returns the same result.
 */
export async function completeUpload(
  db: D1Database,
  accountId: string,
  uploadId: string,
) {
  const account = await getAccount(db, accountId);
  if (account?.status === "ready" && account.upload_id === uploadId) {
    return { status: "ready" as const, position: startPosition(UPLOAD_SEQ) };
  }
  const refusal = await uploadRefusal(db, accountId, uploadId);
  if (refusal) throw refusal;

  const records = await readStaged(db, accountId);
  const touched = emptyTouched();
  let hasSettings = false;
  for (const record of records) {
    switch (record.kind) {
      case "deck":
        touched.decks.add(record.id);
        break;
      case "flashcard":
        touched.flashcards.add(record.id);
        break;
      case "review_unit":
        touched.flashcards.add(record.data.flashcardId);
        break;
      case "review_log":
        touched.reviewLogs.add(record.id);
        break;
      case "deck_graph":
        touched.graphs.add(record.id);
        break;
      case "deck_settings":
        touched.deckSettings.add(record.id);
        break;
      case "settings":
        if (record.id !== SETTINGS_RECORD_ID) {
          throw new SyncError(
            422,
            "integrity",
            `Profile settings must use the id "${SETTINGS_RECORD_ID}".`,
          );
        }
        hasSettings = true;
        break;
    }
  }
  if (!hasSettings) {
    throw new SyncError(
      422,
      "integrity",
      "The upload must include Profile settings.",
    );
  }
  const problem = await findIntegrityProblem(
    memoryView(records, (names) => missingMedia(db, accountId, names)),
    touched,
  );
  if (problem) throw new SyncError(422, problem.code, problem.message);

  try {
    await db.batch([
      // Publishes only if no chunk was staged and no new upload started since
      // the records above were read.
      db
        .prepare(
          `UPDATE sync_accounts SET head_seq = ?4, status = CASE
             WHEN status = 'uploading' AND upload_id = ?2 AND upload_revision = ?3
             THEN 'ready' ELSE NULL END
           WHERE account_id = ?1`,
        )
        .bind(accountId, uploadId, account!.upload_revision, UPLOAD_SEQ),
      db
        .prepare(
          `INSERT INTO sync_records (account_id, kind, id, parent_id, version, seq, deleted, data)
           SELECT account_id, kind, id, parent_id, 1, ?2, 0, data
           FROM sync_upload_records WHERE account_id = ?1`,
        )
        .bind(accountId, UPLOAD_SEQ),
      db
        .prepare("DELETE FROM sync_upload_records WHERE account_id = ?1")
        .bind(accountId),
    ]);
  } catch (error) {
    if (!isGuardFailure(error)) throw error;
    const current = await getAccount(db, accountId);
    if (current?.status === "ready" && current.upload_id === uploadId) {
      return { status: "ready" as const, position: startPosition(UPLOAD_SEQ) };
    }
    throw new SyncError(
      409,
      "upload_superseded",
      "The upload changed while it was being completed; retry completion.",
    );
  }
  return { status: "ready" as const, position: startPosition(UPLOAD_SEQ) };
}
