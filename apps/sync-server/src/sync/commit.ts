import type { Mutation, MutationResult } from "@armin/sync-contract";
import { SyncError } from "../errors";
import { advanceHead, getAccount, isGuardFailure, writeRecords } from "./db";
import { evaluateMutation } from "./mutations";

/** Attempts before a commit gives up because other commits keep landing first. */
const MAX_COMMIT_ATTEMPTS = 8;

/** Apply pushed mutations in order; each one is accepted or refused on its own. */
export async function pushMutations(
  db: D1Database,
  accountId: string,
  mutations: Mutation[],
) {
  const results: MutationResult[] = [];
  for (const mutation of mutations) {
    results.push(await commitMutation(db, accountId, mutation));
  }
  return { results };
}

/**
 * Evaluate a mutation against the current records and write it as the next
 * commit. The batch starts with a head guard, so if another commit landed after
 * the evaluation read its records, nothing is written and evaluation reruns.
 */
async function commitMutation(
  db: D1Database,
  accountId: string,
  mutation: Mutation,
): Promise<MutationResult> {
  const { mutationId } = mutation;
  for (let attempt = 0; attempt < MAX_COMMIT_ATTEMPTS; attempt++) {
    const account = await getAccount(db, accountId);
    if (account?.status !== "ready") {
      throw new SyncError(
        409,
        "not_initialized",
        "Upload a Profile before syncing changes.",
      );
    }

    const stored = await db
      .prepare(
        "SELECT result FROM sync_mutations WHERE account_id = ?1 AND mutation_id = ?2",
      )
      .bind(accountId, mutationId)
      .first<{ result: string }>();
    if (stored) return JSON.parse(stored.result);

    const evaluation = await evaluateMutation(db, accountId, mutation);
    if (evaluation.outcome === "conflict") {
      return {
        mutationId,
        status: "conflict",
        conflicts: evaluation.conflicts,
      };
    }
    if (evaluation.outcome === "rejected") {
      const { code, message } = evaluation;
      return { mutationId, status: "rejected", code, message };
    }

    const seq = account.head_seq + 1;
    const result: MutationResult = {
      mutationId,
      status: "accepted",
      records: evaluation.writes.map(({ kind, id, version, deleted }) => ({
        kind,
        id,
        version,
        deleted,
      })),
    };
    try {
      await db.batch([
        advanceHead(db, accountId, account.head_seq, seq),
        ...writeRecords(db, accountId, seq, evaluation.writes),
        db
          .prepare(
            "INSERT INTO sync_mutations (account_id, mutation_id, seq, result) VALUES (?1, ?2, ?3, ?4)",
          )
          .bind(accountId, mutationId, seq, JSON.stringify(result)),
      ]);
      return result;
    } catch (error) {
      if (!isGuardFailure(error)) throw error;
    }
  }
  throw new SyncError(
    503,
    "busy",
    "Too many concurrent changes; retry the push.",
  );
}
