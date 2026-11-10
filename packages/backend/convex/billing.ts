import { createPolar, errors, webhooks } from "@polar-sh/sdk/2026-10";
import type { HttpRouter } from "convex/server";
import { v } from "convex/values";
import type { PlanId } from "@armin/core/plans";
import { components, internal } from "./_generated/api";
import {
  action,
  httpAction,
  internalAction,
  internalQuery,
  query,
  type ActionCtx,
} from "./_generated/server";
import { internalMutation, mutation } from "./functions";
import { getViewer } from "./model/access";
import {
  billingEnabled,
  productIds,
  requestBillingSync,
  SYNC_LEASE_MS,
  syncRetryDelay,
} from "./model/billing";
import { fail } from "./model/errors";
import { isReviewer } from "./model/reviewer";
import { isSelfHosted } from "./model/selfHost";
import { libraryPlan } from "./model/usage";

const intervalValidator = v.union(v.literal("month"), v.literal("year"));

const subscriptionValidator = v.object({
  id: v.string(),
  productId: v.string(),
  interval: intervalValidator,
  status: v.string(),
  amount: v.number(),
  currency: v.string(),
  currentPeriodEnd: v.string(),
  cancelAtPeriodEnd: v.boolean(),
});

const MAX_PASSES_PER_RUN = 5;

function polarClient() {
  return createPolar({
    accessToken: process.env.POLAR_ORGANIZATION_TOKEN ?? "",
    environment: process.env.POLAR_SERVER === "production" ? "production" : "sandbox",
    timeout: 20,
  });
}

function siteUrl() {
  const url = process.env.SITE_URL;
  if (!url) throw new Error("SITE_URL is not set.");
  return url.replace(/\/$/, "");
}

function statusCode(error: unknown) {
  return error instanceof Error && "statusCode" in error
    ? (error as { statusCode: unknown }).statusCode
    : null;
}

function isInvalidEmail(error: unknown) {
  return (
    statusCode(error) === 422 && error instanceof Error && error.message.includes("customer_email")
  );
}

async function customerState(userId: string) {
  try {
    return await polarClient().customers.getStateExternal(userId);
  } catch (error) {
    if (statusCode(error) === 404) return null;
    throw error;
  }
}

async function fetchProSubscription(userId: string) {
  const products = productIds();
  const state = await customerState(userId);
  const subscription = state?.active_subscriptions.find(
    (sub) => sub.product_id === products.month || sub.product_id === products.year,
  );
  if (!subscription) return null;
  return {
    id: subscription.id,
    productId: subscription.product_id,
    interval: subscription.product_id === products.year ? ("year" as const) : ("month" as const),
    status: subscription.status,
    amount: subscription.amount,
    currency: subscription.currency,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  };
}

async function revokeAll(userId: string) {
  const state = await customerState(userId);
  for (const subscription of state?.active_subscriptions ?? []) {
    try {
      await polarClient().subscriptions.revoke(subscription.id);
    } catch (error) {
      if (!(error instanceof errors.AlreadyCanceledSubscription)) throw error;
    }
  }
}

export const billingUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    return {
      userId: viewer.userId,
      email: viewer.email,
      emailVerified: viewer.emailVerified,
      reviewer: isReviewer(viewer.userId),
      libraryActive: viewer.library?.status === "active",
      complimentary: viewer.library?.complimentaryPro === true,
    };
  },
});

type BillingUser = {
  userId: string;
  emailVerified: boolean;
  reviewer: boolean;
  libraryActive: boolean;
};

function checkBillingUser<T extends BillingUser>(user: T | null): T {
  if (!billingEnabled()) fail("INVALID", "Billing isn't available on this deployment.");
  if (!user) fail("UNAUTHENTICATED", "Sign in to continue.");
  if (!user.emailVerified) fail("EMAIL_NOT_VERIFIED", "Verify your email before upgrading.");
  if (user.reviewer) fail("INVALID", "The shared reviewer account can't be upgraded.");
  if (!user.libraryActive) fail("LIBRARY_DELETING", "This account is being deleted.");
  return user;
}

async function requireBillingUser(ctx: ActionCtx) {
  return checkBillingUser(await ctx.runQuery(internal.billing.billingUser, {}));
}

export const status = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const plan: PlanId = libraryPlan(viewer.library);
    const enabled = billingEnabled() && !isReviewer(viewer.userId);
    const billing = enabled
      ? await ctx.db
          .query("billing")
          .withIndex("by_owner", (q) => q.eq("ownerId", viewer.userId))
          .unique()
      : null;
    const subscription = billing?.subscription ?? null;
    return {
      enabled,
      selfHosted: isSelfHosted(),
      plan,
      complimentary: viewer.library?.complimentaryPro === true,
      syncing: billing ? billing.applied < billing.requested : false,
      syncFailed: Boolean(billing?.failures),
      subscription: subscription && {
        interval: subscription.interval,
        status: subscription.status,
        amount: subscription.amount,
        currency: subscription.currency,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
    };
  },
});

export const createCheckout = action({
  args: { interval: intervalValidator },
  handler: async (ctx, { interval }): Promise<{ url: string }> => {
    const user = await requireBillingUser(ctx);
    if (user.complimentary) fail("CONFLICT", "This account already has complimentary Pro.");
    if (await fetchProSubscription(user.userId)) {
      await ctx.runMutation(internal.billing.requestSync, { userId: user.userId });
      fail("CONFLICT", "You already have Pro. Manage it from Billing.");
    }
    const site = siteUrl();
    const create = (customerEmail: string | null) =>
      polarClient().checkouts.create({
        products: [productIds()[interval]],
        external_customer_id: user.userId,
        customer_email: customerEmail,
        success_url: `${site}/settings?tab=billing&checkout=success`,
        return_url: `${site}/settings?tab=billing`,
        metadata: { userId: user.userId },
      });
    try {
      return { url: (await create(user.email)).url };
    } catch (error) {
      if (!isInvalidEmail(error)) throw error;
      return { url: (await create(null)).url };
    }
  },
});

export const createPortalSession = action({
  args: {},
  handler: async (ctx): Promise<{ url: string }> => {
    const user = await requireBillingUser(ctx);
    try {
      const session = await polarClient().customerSessions.create({
        external_customer_id: user.userId,
        return_url: `${siteUrl()}/settings?tab=billing`,
      });
      return { url: session.customer_portal_url };
    } catch (error) {
      if (statusCode(error) === 404) fail("NOT_FOUND", "There's no subscription to manage yet.");
      throw error;
    }
  },
});

export const refresh = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    const user = checkBillingUser(
      viewer && {
        userId: viewer.userId,
        emailVerified: viewer.emailVerified,
        reviewer: isReviewer(viewer.userId),
        libraryActive: viewer.library?.status === "active",
      },
    );
    await requestBillingSync(ctx, user.userId);
  },
});

export const setComplimentaryPro = internalMutation({
  args: { email: v.string(), enabled: v.boolean() },
  handler: async (ctx, { email, enabled }) => {
    const address = email.trim().toLowerCase();
    const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", operator: "eq", value: address }],
    });
    if (!user) throw new Error(`No account uses ${address}. Sign in once first.`);
    if (isReviewer(user._id)) throw new Error("The shared reviewer account can't get Pro.");
    const library = await ctx.db
      .query("libraries")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .unique();
    if (!library) throw new Error(`${address} has no library yet. Open the web app once first.`);
    if (library.status !== "active") throw new Error(`The library is ${library.status}.`);
    await ctx.db.patch(library._id, { complimentaryPro: enabled || undefined });
    return {
      userId: user._id,
      email: address,
      plan: libraryPlan({ ...library, complimentaryPro: enabled }),
    };
  },
});

export const requestSync = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    await requestBillingSync(ctx, userId);
  },
});

export const beginSync = internalMutation({
  args: { userId: v.string(), leaseId: v.string() },
  handler: async (ctx, { userId, leaseId }) => {
    const row = await ctx.db
      .query("billing")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .unique();
    if (!row || row.leaseId !== leaseId) return null;
    await ctx.db.patch(row._id, { leaseUntil: Date.now() + SYNC_LEASE_MS });
    return { requested: row.requested, deleted: row.deleted === true };
  },
});

export const finishSync = internalMutation({
  args: {
    userId: v.string(),
    leaseId: v.string(),
    read: v.number(),
    subscription: v.union(v.null(), subscriptionValidator),
  },
  handler: async (ctx, { userId, leaseId, read, subscription }) => {
    const row = await ctx.db
      .query("billing")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .unique();
    if (!row || row.leaseId !== leaseId) return { again: false };
    const again = row.requested > read;
    await ctx.db.patch(row._id, {
      applied: read,
      subscription: row.deleted ? null : subscription,
      failures: undefined,
      lastError: undefined,
      ...(again ? {} : { leaseUntil: undefined, leaseId: undefined }),
    });
    if (row.deleted) return { again };

    const library = await ctx.db
      .query("libraries")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .unique();
    if (library && library.status === "active" && !isReviewer(userId)) {
      const plan: PlanId = subscription ? "pro" : "free";
      if ((library.plan ?? "free") !== plan) await ctx.db.patch(library._id, { plan });
    }
    return { again };
  },
});

export const failSync = internalMutation({
  args: { userId: v.string(), leaseId: v.string(), error: v.string() },
  handler: async (ctx, { userId, leaseId, error }) => {
    const row = await ctx.db
      .query("billing")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .unique();
    if (!row || row.leaseId !== leaseId) return;
    const failures = (row.failures ?? 0) + 1;
    const delay = syncRetryDelay(failures);
    await ctx.db.patch(row._id, {
      failures,
      lastError: error.slice(0, 500),
      leaseUntil: Date.now() + delay + SYNC_LEASE_MS,
    });
    await ctx.scheduler.runAfter(delay, internal.billing.runSync, { userId, leaseId });
  },
});

export const runSync = internalAction({
  args: { userId: v.string(), leaseId: v.string() },
  handler: async (ctx, { userId, leaseId }) => {
    for (let pass = 0; pass < MAX_PASSES_PER_RUN; pass++) {
      const job = await ctx.runMutation(internal.billing.beginSync, { userId, leaseId });
      if (!job) return;
      let subscription;
      try {
        if (job.deleted) {
          await revokeAll(userId);
          if ((await customerState(userId))?.active_subscriptions.length) {
            throw new Error("A subscription is still active after revoking it.");
          }
          subscription = null;
        } else {
          subscription = await fetchProSubscription(userId);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Polar sync for ${userId} failed: ${message}`);
        await ctx.runMutation(internal.billing.failSync, { userId, leaseId, error: message });
        return;
      }
      const { again } = await ctx.runMutation(internal.billing.finishSync, {
        userId,
        leaseId,
        read: job.requested,
        subscription,
      });
      if (!again) return;
    }
    await ctx.scheduler.runAfter(0, internal.billing.runSync, { userId, leaseId });
  },
});

function webhookUserId(event: webhooks.WebhookPayload): string | null {
  const data = event.data as {
    external_id?: string | null;
    customer?: { external_id?: string | null } | null;
    metadata?: Record<string, unknown> | null;
  };
  const candidates = [
    event.type === "customer.state_changed" ? data.external_id : undefined,
    data.customer?.external_id,
    data.metadata?.userId,
  ];
  return candidates.find((id): id is string => typeof id === "string" && id !== "") ?? null;
}

export function registerBillingRoutes(http: HttpRouter) {
  http.route({
    path: "/polar/events",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const secret = process.env.POLAR_WEBHOOK_SECRET;
      if (!secret || !billingEnabled()) return new Response("Not found", { status: 404 });
      const body = await request.text();
      let event: webhooks.WebhookPayload;
      try {
        event = await webhooks.validateEvent(
          body,
          {
            "webhook-id": request.headers.get("webhook-id") ?? "",
            "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
            "webhook-signature": request.headers.get("webhook-signature") ?? "",
          },
          secret,
        );
      } catch (error) {
        if (error instanceof webhooks.PolarWebhookVerificationError) {
          return new Response("Invalid signature", { status: 403 });
        }
        if (error instanceof webhooks.PolarWebhookError) {
          return new Response("Ignored", { status: 202 });
        }
        throw error;
      }
      if (event.type.startsWith("subscription.") || event.type === "customer.state_changed") {
        const userId = webhookUserId(event);
        if (userId) await ctx.runMutation(internal.billing.requestSync, { userId });
        else console.warn(`Polar ${event.type} webhook without an Armin user ID.`);
      }
      return new Response("Accepted", { status: 202 });
    }),
  });
}
