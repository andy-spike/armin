import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { usageMonth } from "@armin/core/plans";
import { fail } from "./errors";
import { libraryLimits } from "./usage";

const HOUR_MS = 3_600_000;
/** Monthly meters are kept a little past their month, then pruned with other buckets. */
const MONTH_RETENTION_MS = 40 * 24 * HOUR_MS;

/**
 * Run one assistant write at most once per request ID. A retry with the same
 * input returns the first result (through `replay`, when the caller must
 * recheck or redact it); a reused ID with different input is rejected. Every
 * new write counts toward the connection's hourly limit.
 */
export async function runAgentWrite<Result>(
  ctx: MutationCtx,
  connection: Doc<"agentConnections">,
  request: { requestId: string | undefined; fingerprint: string },
  handlers: {
    write: () => Promise<Result>;
    replay?: (previous: Result) => Promise<Result> | Result;
  },
) {
  const { requestId, fingerprint } = request;
  if (requestId) {
    const previous = await ctx.db
      .query("agentRequests")
      .withIndex("by_connection_request", (q) =>
        q.eq("connectionId", connection._id).eq("requestId", requestId),
      )
      .unique();
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        fail("INVALID", "This request ID was already used for different input. Use a new ID.");
      const result = previous.result as Result;
      return handlers.replay ? await handlers.replay(result) : result;
    }
  }
  await countWrite(ctx, connection);
  const result = await handlers.write();
  if (requestId) {
    await ctx.db.insert("agentRequests", {
      libraryId: connection.libraryId,
      connectionId: connection._id,
      requestId,
      fingerprint,
      result,
      createdAt: Date.now(),
    });
  }
  return result;
}

/** Bound write volume per connection, even when a client repeatedly edits one card. */
async function countWrite(ctx: MutationCtx, connection: Doc<"agentConnections">) {
  const key = `write:${connection._id}`;
  const now = Date.now();
  const { agentWritesPerHour } = await libraryLimits(ctx, connection.libraryId);
  const bucket = await ctx.db
    .query("agentRateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (bucket && bucket.expiresAt > now) {
    if (bucket.count >= agentWritesPerHour)
      fail(
        "QUOTA",
        `This connection reached its hourly limit of ${agentWritesPerHour} writes. Try later.`,
      );
    await ctx.db.patch(bucket._id, { count: bucket.count + 1 });
  } else if (bucket) {
    await ctx.db.patch(bucket._id, { count: 1, expiresAt: now + HOUR_MS });
  } else {
    await ctx.db.insert("agentRateLimits", {
      key,
      libraryId: connection.libraryId,
      count: 1,
      expiresAt: now + HOUR_MS,
    });
  }
}

/**
 * Count cards an assistant creates against the library's monthly allowance,
 * shared by every connection. Call it before writing the cards.
 */
export async function countAgentCards(
  ctx: MutationCtx,
  libraryId: Doc<"libraries">["_id"],
  cards: number,
) {
  if (cards === 0) return;
  const now = Date.now();
  const key = `cards:${libraryId}:${usageMonth(now)}`;
  const limits = await libraryLimits(ctx, libraryId);
  const bucket = await ctx.db
    .query("agentRateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  const used = bucket?.count ?? 0;
  if (used + cards > limits.agentCardsPerMonth) {
    const name = limits.plan === "pro" ? "The Pro plan" : "The free plan";
    fail(
      "QUOTA",
      `${name} allows ${limits.agentCardsPerMonth} assistant-created cards per month; ${used} are used and this adds ${cards}.`,
    );
  }
  if (bucket) await ctx.db.patch(bucket._id, { count: used + cards });
  else
    await ctx.db.insert("agentRateLimits", {
      key,
      libraryId,
      count: cards,
      expiresAt: now + MONTH_RETENTION_MS,
    });
}
