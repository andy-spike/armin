import type { RecordData, RecordKind, SyncRecord } from "@armin/sync-contract";
import {
  missingMedia,
  readLiveChildren,
  readRecords,
  recordKey,
  type RecordWrite,
} from "./db";
import type { StateView } from "./integrity";

type Live = { id: string; parentId: string | null; data: unknown };

/** Stored records with a mutation's pending writes applied on top. */
export function overlayView(
  db: D1Database,
  accountId: string,
  writes: RecordWrite[],
): StateView {
  const pending = new Map(writes.map((w) => [recordKey(w.kind, w.id), w]));

  return {
    async getMany<K extends RecordKind>(kind: K, ids: string[]) {
      const result = new Map<string, RecordData[K]>();
      const unknown: string[] = [];
      for (const id of new Set(ids)) {
        const write = pending.get(recordKey(kind, id));
        if (!write) unknown.push(id);
        else if (!write.deleted) result.set(id, write.data as RecordData[K]);
      }
      const rows = await readRecords(
        db,
        accountId,
        unknown.map((id) => ({ kind, id })),
      );
      for (const row of rows.values()) {
        if (!row.deleted) result.set(row.id, JSON.parse(row.data!));
      }
      return result;
    },

    async childrenMany<K extends RecordKind>(kind: K, parentIds: string[]) {
      const parents = new Set(parentIds);
      const result = new Map<string, { id: string; data: RecordData[K] }[]>();
      const add = (parentId: string, id: string, data: unknown) =>
        result.set(parentId, [
          ...(result.get(parentId) ?? []),
          { id, data: data as RecordData[K] },
        ]);
      const rows = await readLiveChildren(db, accountId, kind, [...parents]);
      for (const row of rows) {
        if (pending.has(recordKey(kind, row.id))) continue;
        add(row.parent_id!, row.id, JSON.parse(row.data!));
      }
      for (const write of pending.values()) {
        if (write.kind !== kind || write.deleted) continue;
        if (write.parentId !== null && parents.has(write.parentId)) {
          add(write.parentId, write.id, write.data);
        }
      }
      return result;
    },

    missingMedia: (fileNames) => missingMedia(db, accountId, fileNames),
  };
}

/** A complete staged Profile held in memory, for validating the initial upload. */
export function memoryView(
  records: (SyncRecord & { parentId: string | null })[],
  findMissingMedia: (fileNames: string[]) => Promise<string[]>,
): StateView {
  const byKey = new Map<string, Live>();
  const children = new Map<string, Live[]>();
  for (const record of records) {
    const live = {
      id: record.id,
      parentId: record.parentId,
      data: record.data,
    };
    byKey.set(recordKey(record.kind, record.id), live);
    if (record.parentId !== null) {
      const key = recordKey(record.kind, record.parentId);
      const siblings = children.get(key);
      if (siblings) siblings.push(live);
      else children.set(key, [live]);
    }
  }

  return {
    async getMany<K extends RecordKind>(kind: K, ids: string[]) {
      const result = new Map<string, RecordData[K]>();
      for (const id of ids) {
        const live = byKey.get(recordKey(kind, id));
        if (live) result.set(id, live.data as RecordData[K]);
      }
      return result;
    },

    async childrenMany<K extends RecordKind>(kind: K, parentIds: string[]) {
      const result = new Map<string, { id: string; data: RecordData[K] }[]>();
      for (const parentId of parentIds) {
        const found = children.get(recordKey(kind, parentId)) ?? [];
        result.set(
          parentId,
          found.map((live) => ({
            id: live.id,
            data: live.data as RecordData[K],
          })),
        );
      }
      return result;
    },

    missingMedia: findMissingMedia,
  };
}
