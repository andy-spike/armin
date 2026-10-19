import type { RecordKind, RecordState } from "@armin/sync-contract";

export type AccountRow = {
  account_id: string;
  status: "uploading" | "ready";
  upload_id: string;
  upload_revision: number;
  head_seq: number;
};

export type RecordRow = {
  kind: RecordKind;
  id: string;
  parent_id: string | null;
  version: number;
  seq: number;
  deleted: number;
  data: string | null;
};

/** A record write produced by an accepted mutation or upload. */
export type RecordWrite = {
  kind: RecordKind;
  id: string;
  parentId: string | null;
  version: number;
  deleted: boolean;
  data: unknown;
};

export const recordKey = (kind: RecordKind, id: string) => `${kind}\u0000${id}`;

export function toRecordState(row: RecordRow) {
  return {
    kind: row.kind,
    id: row.id,
    version: row.version,
    deleted: row.deleted === 1,
    data: row.data === null ? null : JSON.parse(row.data),
  } as RecordState;
}

export async function getAccount(db: D1Database, accountId: string) {
  return db
    .prepare(
      `SELECT account_id, status, upload_id, upload_revision, head_seq
       FROM sync_accounts WHERE account_id = ?1`,
    )
    .bind(accountId)
    .first<AccountRow>();
}

const RECORD_COLUMNS = "kind, id, parent_id, version, seq, deleted, data";

/** Records (live or deleted) by key; absent keys are missing from the map. */
export async function readRecords(
  db: D1Database,
  accountId: string,
  keys: { kind: RecordKind; id: string }[],
) {
  const rows = new Map<string, RecordRow>();
  for (const chunk of chunked(keys, 500)) {
    const { results } = await db
      .prepare(
        `SELECT ${RECORD_COLUMNS} FROM sync_records
         WHERE account_id = ?1 AND (kind, id) IN (
           SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]')
           FROM json_each(?2)
         )`,
      )
      .bind(accountId, JSON.stringify(chunk.map((k) => [k.kind, k.id])))
      .all<RecordRow>();
    for (const row of results) rows.set(recordKey(row.kind, row.id), row);
  }
  return rows;
}

/** Live records of `kind` whose parent is one of `parentIds`. */
export async function readLiveChildren(
  db: D1Database,
  accountId: string,
  kind: RecordKind,
  parentIds: string[],
) {
  const rows: RecordRow[] = [];
  for (const chunk of chunked(parentIds, 500)) {
    const { results } = await db
      .prepare(
        `SELECT ${RECORD_COLUMNS} FROM sync_records
         WHERE account_id = ?1 AND kind = ?2 AND deleted = 0
           AND parent_id IN (SELECT value FROM json_each(?3))`,
      )
      .bind(accountId, kind, JSON.stringify(chunk))
      .all<RecordRow>();
    rows.push(...results);
  }
  return rows;
}

/** Media file names from `fileNames` that the Account has not uploaded. */
export async function missingMedia(
  db: D1Database,
  accountId: string,
  fileNames: string[],
) {
  const present = new Set<string>();
  for (const chunk of chunked(fileNames, 500)) {
    const { results } = await db
      .prepare(
        `SELECT file_name FROM sync_media
         WHERE account_id = ?1 AND file_name IN (SELECT value FROM json_each(?2))`,
      )
      .bind(accountId, JSON.stringify(chunk))
      .all<{ file_name: string }>();
    for (const row of results) present.add(row.file_name);
  }
  return fileNames.filter((name) => !present.has(name));
}

/**
 * Statement that aborts its batch unless the Account's head is still
 * `expectedHead`: setting a NOT NULL column to NULL fails the statement, and D1
 * rolls back the whole batch. This serializes commits per Account.
 */
export function advanceHead(
  db: D1Database,
  accountId: string,
  expectedHead: number,
  nextHead: number,
) {
  return db
    .prepare(
      `UPDATE sync_accounts
       SET head_seq = CASE WHEN status = 'ready' AND head_seq = ?2 THEN ?3 ELSE NULL END
       WHERE account_id = ?1`,
    )
    .bind(accountId, expectedHead, nextHead);
}

/** True when a batch was aborted by one of the sync_accounts guard statements. */
export function isGuardFailure(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("NOT NULL constraint failed: sync_accounts.")
  );
}

/** Upsert statements for `writes`, split to stay under D1's parameter size limit. */
export function writeRecords(
  db: D1Database,
  accountId: string,
  seq: number,
  writes: RecordWrite[],
) {
  const encoded = writes.map((write) =>
    JSON.stringify({
      kind: write.kind,
      id: write.id,
      parentId: write.parentId,
      version: write.version,
      deleted: write.deleted ? 1 : 0,
      data: write.deleted ? null : JSON.stringify(write.data),
    }),
  );
  return jsonArrayChunks(encoded).map((chunk) =>
    db
      .prepare(
        `INSERT INTO sync_records (account_id, kind, id, parent_id, version, seq, deleted, data)
         SELECT ?1, json_extract(value, '$.kind'), json_extract(value, '$.id'),
           json_extract(value, '$.parentId'), json_extract(value, '$.version'), ?2,
           json_extract(value, '$.deleted'), json_extract(value, '$.data')
         FROM json_each(?3) WHERE true
         ON CONFLICT (account_id, kind, id) DO UPDATE SET
           parent_id = excluded.parent_id, version = excluded.version,
           seq = excluded.seq, deleted = excluded.deleted, data = excluded.data`,
      )
      .bind(accountId, seq, chunk),
  );
}

/**
 * Join JSON-encoded items into JSON arrays small enough to bind as one D1
 * parameter. Counts characters, not bytes, staying well under 2 MB even for
 * multi-byte text.
 */
export function jsonArrayChunks(encoded: string[]) {
  const arrays: string[] = [];
  let chunk: string[] = [];
  let size = 0;
  for (const item of encoded) {
    if (chunk.length > 0 && size + item.length > 600_000) {
      arrays.push(`[${chunk.join(",")}]`);
      chunk = [];
      size = 0;
    }
    chunk.push(item);
    size += item.length + 1;
  }
  if (chunk.length > 0) arrays.push(`[${chunk.join(",")}]`);
  return arrays;
}

export function chunked<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
