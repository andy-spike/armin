import { nextUsageMonthStart, usageMonth } from "@armin/core/plans";
import type { Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { variantReservation } from "../schema";
import { isSelfHosted } from "./selfHost";
import { libraryLimits } from "./usage";

export type VariantReservation = Infer<typeof variantReservation> | undefined;

function usageRow(ctx: Pick<QueryCtx, "db">, libraryId: Id<"libraries">, month: string) {
  return ctx.db
    .query("conceptVariantUsage")
    .withIndex("by_library_month", (q) => q.eq("libraryId", libraryId).eq("month", month))
    .unique();
}

export async function variantAllowance(
  ctx: Pick<QueryCtx, "db">,
  libraryId: Id<"libraries">,
  now: number,
) {
  if (isSelfHosted()) return null;
  const month = usageMonth(now);
  const [limits, row] = await Promise.all([
    libraryLimits(ctx, libraryId),
    usageRow(ctx, libraryId, month),
  ]);
  const used = row?.used ?? 0;
  const reserved = row?.reserved ?? 0;
  const limit = limits.conceptVariantsPerMonth;
  return {
    plan: limits.plan,
    month,
    used,
    reserved,
    limit,
    remaining: Math.max(0, limit - used - reserved),
    resetsAt: nextUsageMonthStart(now),
  };
}

export async function reserveVariants(
  ctx: MutationCtx,
  libraryId: Id<"libraries">,
  wanted: number,
  now: number,
) {
  const allowance = await variantAllowance(ctx, libraryId, now);
  if (!allowance) return { count: wanted, reservation: undefined };
  const count = Math.min(wanted, allowance.remaining);
  if (count <= 0) return { count: 0, reservation: undefined };
  const row = await usageRow(ctx, libraryId, allowance.month);
  if (row) await ctx.db.patch(row._id, { reserved: row.reserved + count });
  else
    await ctx.db.insert("conceptVariantUsage", {
      libraryId,
      month: allowance.month,
      used: 0,
      reserved: count,
    });
  return { count, reservation: { libraryId, month: allowance.month, count } };
}

export async function settleVariants(
  ctx: MutationCtx,
  reservation: VariantReservation,
  stored: number,
) {
  if (!reservation) return;
  const row = await usageRow(ctx, reservation.libraryId, reservation.month);
  if (!row) return;
  await ctx.db.patch(row._id, {
    used: row.used + Math.min(stored, reservation.count),
    reserved: Math.max(0, row.reserved - reservation.count),
  });
}
