import { createPolar, webhooks } from "@polar-sh/sdk/2026-10";
import type { HttpRouter } from "convex/server";
import { v } from "convex/values";
import type { PlanId } from "@armin/core/plans";
import { internal } from "./_generated/api";
import {
  action,
  httpAction,
  internalAction,
  internalQuery,
  query,
  type ActionCtx,
} from "./_generated/server";
import { internalMutation } from "./functions";
import { getViewer } from "./model/access";
import { fail } from "./model/errors";
import { isReviewer } from "./model/reviewer";
import { isSelfHosted } from "./model/selfHost";
import { libraryPlan } from "./model/usage";

/*
 * Pro subscriptions through Polar, the merchant of record, using the Polar
 * SDK directly (API version 2026-10). Every Polar customer carries the Armin
 * user ID as its external ID, so Polar's customer state answers "does this
 * user have Pro" in one call. Webhooks only say "this customer changed":
 * `syncCustomer` then reads the current state from Polar and `applyState`
 * stores it, deriving `libraries.plan` in the same transaction. Reading fresh
 * state, rather than trusting each payload, makes the result independent of
 * webhook order and retries. Ending Pro never deletes anything; the library
 * just stops growing past the free limits.
 */

const intervalValidator = v.union(v.literal("month"), v.literal("year"));
type Interval = "month" | "year";

function productIds(): Record<Interval, string> {
  return {
    month: process.env.POLAR_PRODUCT_PRO_MONTHLY ?? "",
    year: process.env.POLAR_PRODUCT_PRO_YEARLY ?? "",
  };
}

/** Billing runs only on a hosted deployment with Polar fully configured. */
function billingEnabled() {
  const products = productIds();
  return (
    !isSelfHosted() &&
    Boolean(process.env.POLAR_ORGANIZATION_TOKEN && products.month && products.year)
  );
}

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

function isNotFound(error: unknown) {
  return (
    error instanceof Error &&
    "statusCode" in error &&
    (error as { statusCode: unknown }).statusCode === 404
  );
}

/** A 422 from Polar that rejects the prefilled customer email. */
function isInvalidEmail(error: unknown) {
  return (
    error instanceof Error &&
    "statusCode" in error &&
    (error as { statusCode: unknown }).statusCode === 422 &&
    error.message.includes("customer_email")
  );
}

/** The subscription fields Armin keeps, from Polar's customer state. */
type StoredSubscription = {
  id: string;
  productId: string;
  interval: Interval;
  status: string;
  amount: number;
  currency: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
};

/**
 * Read the user's Pro subscription from Polar. Polar lists only active and
 * trialing subscriptions in the customer state; past-due ones stay there
 * while Polar retries the payment. Null when the user has none, or has never
 * been a Polar customer.
 */
async function fetchProSubscription(userId: string): Promise<StoredSubscription | null> {
  const products = productIds();
  let state;
  try {
    state = await polarClient().customers.getStateExternal(userId);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  const subscription = state.active_subscriptions.find(
    (sub) => sub.product_id === products.month || sub.product_id === products.year,
  );
  if (!subscription) return null;
  return {
    id: subscription.id,
    productId: subscription.product_id,
    interval: subscription.product_id === products.year ? "year" : "month",
    status: subscription.status,
    amount: subscription.amount,
    currency: subscription.currency,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  };
}

/** Read Polar's current state for a user and store it. */
async function syncCustomer(ctx: Pick<ActionCtx, "runMutation">, userId: string) {
  // Taken before the read: a sync that read Polar later always wins.
  const syncedAt = Date.now();
  const subscription = await fetchProSubscription(userId);
  await ctx.runMutation(internal.billing.applyState, { userId, subscription, syncedAt });
}

/** The signed-in user who may manage billing, for actions. */
export const billingUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const billing = await ctx.db
      .query("billing")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer.userId))
      .unique();
    return {
      userId: viewer.userId,
      email: viewer.email,
      emailVerified: viewer.emailVerified,
      reviewer: isReviewer(viewer.userId),
      libraryActive: viewer.library?.status === "active",
      hasSubscription: Boolean(billing?.subscription),
    };
  },
});

async function requireBillingUser(ctx: ActionCtx) {
  if (!billingEnabled()) fail("INVALID", "Billing isn't available on this deployment.");
  const user = await ctx.runQuery(internal.billing.billingUser, {});
  if (!user) fail("UNAUTHENTICATED", "Sign in to continue.");
  if (!user.emailVerified) fail("EMAIL_NOT_VERIFIED", "Verify your email before upgrading.");
  if (user.reviewer) fail("INVALID", "The shared reviewer account can't be upgraded.");
  if (!user.libraryActive) fail("LIBRARY_DELETING", "This account is being deleted.");
  return user;
}

/** The caller's plan and Pro subscription, for Billing settings. */
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

/**
 * Start a Polar checkout for Pro, billed monthly or yearly, and return the
 * URL of Polar's hosted checkout page. Polar returns the buyer to Billing
 * settings; the plan changes when Polar's webhook arrives, or when the
 * returning page calls `refresh`.
 */
export const createCheckout = action({
  args: { interval: intervalValidator },
  handler: async (ctx, { interval }): Promise<{ url: string }> => {
    const user = await requireBillingUser(ctx);
    // Check Polar itself, not only the stored copy, so a delayed webhook
    // can't let someone pay twice.
    if (await fetchProSubscription(user.userId)) {
      await syncCustomer(ctx, user.userId);
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
      // Polar rejects some addresses it can't deliver to (for example,
      // reserved domains). The buyer then types an email in checkout.
      if (!isInvalidEmail(error)) throw error;
      return { url: (await create(null)).url };
    }
  },
});

/** A signed-in link to Polar's customer portal: cancel, switch interval, cards, invoices. */
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
      if (isNotFound(error)) fail("NOT_FOUND", "There's no subscription to manage yet.");
      throw error;
    }
  },
});

/** Re-read the caller's subscription from Polar, after checkout or on request. */
export const refresh = action({
  args: {},
  handler: async (ctx) => {
    const user = await requireBillingUser(ctx);
    await syncCustomer(ctx, user.userId);
  },
});

/** Store a user's Polar state and derive their library's plan from it. */
export const applyState = internalMutation({
  args: {
    userId: v.string(),
    subscription: v.union(
      v.null(),
      v.object({
        id: v.string(),
        productId: v.string(),
        interval: intervalValidator,
        status: v.string(),
        amount: v.number(),
        currency: v.string(),
        currentPeriodEnd: v.string(),
        cancelAtPeriodEnd: v.boolean(),
      }),
    ),
    syncedAt: v.number(),
  },
  handler: async (ctx, { userId, subscription, syncedAt }) => {
    const library = await ctx.db
      .query("libraries")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .unique();
    // A deleted or deleting account keeps no billing record.
    if (!library || library.status !== "active" || isReviewer(userId)) return;
    const existing = await ctx.db
      .query("billing")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .unique();
    // An older read that finished late must not overwrite a newer one.
    if (existing && existing.syncedAt > syncedAt) return;
    if (existing) await ctx.db.patch(existing._id, { subscription, syncedAt });
    else await ctx.db.insert("billing", { ownerId: userId, subscription, syncedAt });
    const plan: PlanId = subscription ? "pro" : "free";
    if ((library.plan ?? "free") !== plan) await ctx.db.patch(library._id, { plan });
  },
});

/** Remove a deleted account's billing record. */
export const removeBilling = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const existing = await ctx.db
      .query("billing")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/** The Armin user ID a webhook is about, from the customer's external ID. */
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

/**
 * Polar webhooks at `/polar/events`. Verifies the signature, then re-syncs
 * the customer the event is about. Event types this SDK version doesn't know
 * are acknowledged and ignored, so Polar never retries them.
 */
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
        if (userId) await syncCustomer(ctx, userId);
        else console.warn(`Polar ${event.type} webhook without an Armin user ID.`);
      }
      return new Response("Accepted", { status: 202 });
    }),
  });
}

/**
 * Stop billing a deleted account. Scheduled by account deletion; revokes the
 * subscription immediately, because the library it paid for is gone.
 */
export const endForDeletedUser = internalAction({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    await ctx.runMutation(internal.billing.removeBilling, { userId });
    if (!billingEnabled()) return;
    const subscription = await fetchProSubscription(userId);
    if (subscription) await polarClient().subscriptions.revoke(subscription.id);
  },
});
