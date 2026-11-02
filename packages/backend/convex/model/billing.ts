import type { GenericMutationCtx } from "convex/server";
import { internal } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import { isSelfHosted } from "./selfHost";

/*
 * Billing configuration and the per-user Polar sync job. A job is a `billing`
 * row: `requestBillingSync` raises `requested` and starts a runner
 * (`billing.runSync`) unless one holds the lease. The runner reads Polar and
 * applies what it read with the request number it read for, then reads again
 * while newer requests arrived meanwhile. A failed pass retries with backoff.
 */

/** How long a runner owns a job without renewing. Covers one Polar read and revoke. */
export const SYNC_LEASE_MS = 2 * 60 * 1000;

export function productIds() {
  return {
    month: process.env.POLAR_PRODUCT_PRO_MONTHLY ?? "",
    year: process.env.POLAR_PRODUCT_PRO_YEARLY ?? "",
  };
}

/** Billing runs only on a hosted deployment with Polar fully configured. */
export function billingEnabled() {
  const products = productIds();
  return (
    !isSelfHosted() &&
    Boolean(process.env.POLAR_ORGANIZATION_TOKEN && products.month && products.year)
  );
}

/** Retry delay after `failures` consecutive failed passes: 30 s doubling, at most an hour. */
export function syncRetryDelay(failures: number) {
  return Math.min(30_000 * 2 ** Math.max(0, failures - 1), 60 * 60 * 1000);
}

/**
 * Ask for the user's Polar state to be read again. `deleted` marks the
 * account deleted for good, so the job revokes its subscriptions. Without it,
 * a user with neither a billing row nor a library is ignored (for example, a
 * Polar sample event).
 */
export async function requestBillingSync(
  ctx: Pick<GenericMutationCtx<DataModel>, "db" | "scheduler">,
  userId: string,
  { deleted = false }: { deleted?: boolean } = {},
) {
  if (!billingEnabled()) return;
  const now = Date.now();
  let row = await ctx.db
    .query("billing")
    .withIndex("by_owner", (q) => q.eq("ownerId", userId))
    .unique();
  if (!row) {
    if (!deleted) {
      const library = await ctx.db
        .query("libraries")
        .withIndex("by_owner", (q) => q.eq("ownerId", userId))
        .unique();
      if (!library) return;
    }
    const id = await ctx.db.insert("billing", {
      ownerId: userId,
      subscription: null,
      requested: 0,
      applied: 0,
    });
    row = (await ctx.db.get(id))!;
  }
  const requested = row.requested + 1;
  const leased = row.leaseUntil !== undefined && row.leaseUntil > now;
  const leaseId = `${now}:${requested}`;
  await ctx.db.patch(row._id, {
    requested,
    ...(deleted ? { deleted: true, subscription: null } : {}),
    // A held lease means a runner (or its scheduled retry) will see this request.
    ...(leased ? {} : { leaseUntil: now + SYNC_LEASE_MS, leaseId, failures: 0 }),
  });
  if (!leased) await ctx.scheduler.runAfter(0, internal.billing.runSync, { userId, leaseId });
}
