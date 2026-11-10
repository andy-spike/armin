import type { GenericMutationCtx } from "convex/server";
import { internal } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import { isSelfHosted } from "./selfHost";

export const SYNC_LEASE_MS = 2 * 60 * 1000;

export function productIds() {
  return {
    month: process.env.POLAR_PRODUCT_PRO_MONTHLY ?? "",
    year: process.env.POLAR_PRODUCT_PRO_YEARLY ?? "",
  };
}

export function billingEnabled() {
  const products = productIds();
  return (
    !isSelfHosted() &&
    Boolean(
      process.env.POLAR_ORGANIZATION_TOKEN &&
      process.env.POLAR_WEBHOOK_SECRET &&
      products.month &&
      products.year,
    )
  );
}

export function syncRetryDelay(failures: number) {
  return Math.min(30_000 * 2 ** Math.max(0, failures - 1), 60 * 60 * 1000);
}

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
    ...(leased ? {} : { leaseUntil: now + SYNC_LEASE_MS, leaseId, failures: 0 }),
  });
  if (!leased) await ctx.scheduler.runAfter(0, internal.billing.runSync, { userId, leaseId });
}
