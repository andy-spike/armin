import type { PullResponse, RecordKind } from "@armin/sync-contract";
import { SyncError } from "../errors";
import { getAccount, toRecordState, type RecordRow } from "./db";

/**
 * A sync position: everything up to commit `seq` has been pulled. Mid-pull
 * positions also name the last record returned, because one commit (such as
 * the initial upload) can span several pages.
 */
type Position = { seq: number; kind: RecordKind | null; id: string | null };

export function encodePosition(position: Position) {
  const parts =
    position.kind === null
      ? [position.seq]
      : [position.seq, position.kind, position.id];
  return btoa(JSON.stringify(parts))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function decodePosition(text: string): Position {
  try {
    const parts = JSON.parse(
      atob(text.replaceAll("-", "+").replaceAll("_", "/")),
    );
    const [seq, kind = null, id = null] = parts;
    if (
      Array.isArray(parts) &&
      Number.isSafeInteger(seq) &&
      seq >= 0 &&
      (kind === null || (typeof kind === "string" && typeof id === "string"))
    ) {
      return { seq, kind, id };
    }
  } catch {
    // Fall through to the error below.
  }
  throw new SyncError(400, "invalid_request", "Unknown sync position.");
}

export const startPosition = (seq: number) =>
  encodePosition({ seq, kind: null, id: null });

/** Records changed after `after` (or every record), oldest commit first. */
export async function pullChanges(
  db: D1Database,
  accountId: string,
  after: string | undefined,
  limit: number,
): Promise<PullResponse> {
  const account = await getAccount(db, accountId);
  if (account?.status !== "ready") {
    throw new SyncError(
      409,
      "not_initialized",
      "Upload a Profile before syncing changes.",
    );
  }
  const from = after ? decodePosition(after) : { seq: 0, kind: null, id: null };

  const { results } = await db
    .prepare(
      `SELECT kind, id, parent_id, version, seq, deleted, data FROM sync_records
       WHERE account_id = ?1
         AND (seq > ?2 OR (seq = ?2 AND (kind > ?3 OR (kind = ?3 AND id > ?4))))
       ORDER BY seq, kind, id
       LIMIT ?5`,
    )
    .bind(accountId, from.seq, from.kind, from.id, limit + 1)
    .all<RecordRow>();

  const hasMore = results.length > limit;
  const page = results.slice(0, limit);
  const last = page.at(-1);
  // The head was read before the query, so every commit up to it is in `page`.
  const position =
    hasMore && last
      ? encodePosition({ seq: last.seq, kind: last.kind, id: last.id })
      : startPosition(Math.max(account.head_seq, last?.seq ?? from.seq));
  return { records: page.map(toRecordState), position, hasMore };
}
