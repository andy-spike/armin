import { v } from "convex/values";
import { action, query } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { internalMutation, mutation } from "./functions";
import type { Doc } from "./_generated/dataModel";
import { readableLibrary, writableLibrary } from "./model/access";
import {
  activeComponentGrant,
  agentSiteUrl,
  agentUser,
  DAY,
  hashSecret,
  MAX_CONNECTIONS,
  newSecret,
} from "./model/agentAuth";
import { fail } from "./model/errors";

const CODE_TTL_MS = 60_000;

/**
 * One entry per approved connection. App records carry the connection's
 * provenance, activity, and the app-side revocation flag; the component grant
 * is the credential that can actually act. A grant that has not been used yet
 * has no app record, so its component id is returned directly.
 */
function connectionView(row: Doc<"agentConnections">, live: Set<string>) {
  const usable = row.componentConnectionId !== undefined && live.has(row.componentConnectionId);
  return {
    _id: row._id,
    name: row.name,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    // A row whose grant is gone (revoked by the client or a pre-migration
    // connection) is shown as ended. The bounded migration records exact times
    // for legacy rows; until then their last use is the closest honest marker.
    revokedAt: row.revokedAt ?? (usable ? undefined : (row.lastUsedAt ?? row.createdAt)),
  };
}

export const connections = query({
  args: {},
  handler: async (ctx) => {
    const library = await readableLibrary(ctx);
    if (!library) return { connections: [], activity: [] };
    const grants = await ctx.runQuery(components.mcp.grants.list, {
      userId: library.ownerId,
    });
    const live = new Set(grants.map((grant) => grant._id));
    const recent = await ctx.db
      .query("agentConnections")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .order("desc")
      .take(50);
    const views = recent.map((row) => connectionView(row, live));
    const linked = new Set(
      recent.map((row) => row.componentConnectionId).filter((id): id is string => id !== undefined),
    );
    // Approved but not used yet: the component grant exists, the app record
    // is created on first use.
    const unused = grants
      .filter((grant) => !linked.has(grant._id))
      .map((grant) => ({
        _id: grant._id,
        name: grant.name,
        createdAt: grant._creationTime,
        lastUsedAt: grant.lastUsedAt,
        revokedAt: undefined,
      }));
    const activity = await ctx.db
      .query("agentActivity")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .order("desc")
      .take(50);
    return {
      connections: [
        ...views.filter((row) => row.revokedAt === undefined),
        ...unused,
        ...views.filter((row) => row.revokedAt !== undefined),
      ],
      activity,
    };
  },
});

/** Details of a pending consent request, for the web app's consent page. */
export const authorization = query({
  args: { requestId: v.string() },
  handler: async (ctx, { requestId }) => {
    if (!(await readableLibrary(ctx))) return null;
    const request = await ctx.runQuery(components.mcp.oauth.getAuthRequest, { requestId });
    if (
      !request ||
      request.kind !== "redirect" ||
      !request.redirectUri ||
      request.status !== "pending"
    )
      return null;
    return {
      clientName: request.clientName?.trim() || "AI assistant",
      redirectOrigin: new URL(request.redirectUri).origin,
    };
  },
});

/**
 * Approve a consent request. The authorization code is generated here and only
 * its hash reaches the component; the code itself goes to the client in the
 * redirect URL.
 */
export const approve = action({
  args: { requestId: v.string() },
  handler: async (ctx, { requestId }): Promise<{ redirectUrl: string }> => {
    const code = newSecret();
    const decided = await ctx.runMutation(internal.agents.decide, {
      requestId,
      approve: true,
      codeHash: await hashSecret(code),
    });
    const url = new URL(decided.redirectUri);
    url.searchParams.set("code", code);
    if (decided.state) url.searchParams.set("state", decided.state);
    url.searchParams.set("iss", agentSiteUrl());
    return { redirectUrl: url.toString() };
  },
});

/** Deny a consent request and return the client to its redirect URI. */
export const deny = mutation({
  args: { requestId: v.string() },
  handler: async (ctx, { requestId }): Promise<{ redirectUrl: string }> => {
    const decided = await ctx.runMutation(internal.agents.decide, {
      requestId,
      approve: false,
    });
    const url = new URL(decided.redirectUri);
    url.searchParams.set("error", "access_denied");
    url.searchParams.set("error_description", "The user denied access");
    if (decided.state) url.searchParams.set("state", decided.state);
    url.searchParams.set("iss", agentSiteUrl());
    return { redirectUrl: url.toString() };
  },
});

/**
 * Settle a consent request inside one transaction: the signed-in library, the
 * connection cap, and the component decision commit together or not at all.
 */
export const decide = internalMutation({
  args: {
    requestId: v.string(),
    approve: v.boolean(),
    codeHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const library = await writableLibrary(ctx);
    if (args.approve) {
      const grants = await ctx.runQuery(components.mcp.grants.list, {
        userId: library.ownerId,
      });
      if (grants.length >= MAX_CONNECTIONS)
        fail(
          "QUOTA",
          "Disconnect an assistant before adding another. Up to 20 connections are supported.",
        );
    }
    const decided = await ctx.runMutation(components.mcp.oauth.decideAuthRequest, {
      requestId: args.requestId,
      userId: library.ownerId,
      approved: args.approve,
      codeHash: args.codeHash,
      codeTtlMs: CODE_TTL_MS,
    });
    if (!decided)
      fail("INVALID", "This connection request expired. Start again in your assistant.");
    if (decided.kind !== "redirect")
      fail("INVALID", "This connection request is not a browser sign-in.");
    return { redirectUri: decided.redirectUri, state: decided.state };
  },
});

/**
 * Resolve the component grant to the user's library and record the app-side
 * connection on first use. Runs before every tool so reads see an app record
 * and the connection cap is enforced even if approval raced another consent.
 */
export const touchConnection = internalMutation({
  args: { user: agentUser },
  handler: async (ctx, { user }) => {
    const grant = await activeComponentGrant(ctx, user);
    const library = await ctx.db
      .query("libraries")
      .withIndex("by_owner", (q) => q.eq("ownerId", user.userId))
      .unique();
    if (!library || library.status !== "active")
      fail("UNAUTHENTICATED", "This library is unavailable.");
    const now = Date.now();
    const existing = await ctx.db
      .query("agentConnections")
      .withIndex("by_component", (q) => q.eq("componentConnectionId", user.connectionId))
      .unique();
    if (!existing) {
      const grants = await ctx.runQuery(components.mcp.grants.list, {
        userId: user.userId,
      });
      let activeCount = 0;
      for (const item of grants) {
        const row = await ctx.db
          .query("agentConnections")
          .withIndex("by_component", (q) => q.eq("componentConnectionId", item._id))
          .unique();
        if (row && row.revokedAt === undefined && row.libraryId === library._id) activeCount++;
      }
      if (activeCount >= MAX_CONNECTIONS)
        fail(
          "QUOTA",
          "Disconnect an assistant before adding another. Up to 20 connections are supported.",
        );
      await ctx.db.insert("agentConnections", {
        libraryId: library._id,
        componentConnectionId: user.connectionId,
        name: grant.name,
        resource: grant.resource,
        createdAt: now,
        lastUsedAt: now,
      });
      return null;
    }
    if (existing.revokedAt || existing.libraryId !== library._id)
      fail("UNAUTHENTICATED", "Reconnect your assistant in Armin.");
    if (!existing.lastUsedAt || existing.lastUsedAt < now - 60_000)
      await ctx.db.patch(existing._id, { lastUsedAt: now });
    return null;
  },
});

/** Disconnect an assistant: revoke the app record and the component grant. */
export const revoke = mutation({
  args: { connectionId: v.string() },
  handler: async (ctx, { connectionId }) => {
    const library = await writableLibrary(ctx);
    const appId = ctx.db.normalizeId("agentConnections", connectionId);
    const row = appId ? await ctx.db.get(appId) : null;
    if (row) {
      if (row.libraryId !== library._id) fail("NOT_FOUND", "Connection not found.");
      if (!row.revokedAt)
        await ctx.db.patch(row._id, {
          revokedAt: Date.now(),
          accessHash: undefined,
          accessExpiresAt: undefined,
          refreshHash: undefined,
          refreshExpiresAt: undefined,
        });
      if (row.componentConnectionId)
        await ctx.runMutation(components.mcp.grants.revoke, {
          userId: library.ownerId,
          grantId: row.componentConnectionId,
        });
      return null;
    }
    // An approved connection that has not been used has only a component id.
    const revoked = await ctx.runMutation(components.mcp.grants.revoke, {
      userId: library.ownerId,
      grantId: connectionId,
    });
    if (!revoked) fail("NOT_FOUND", "Connection not found.");
    return null;
  },
});

/**
 * Revoke a deleted account's component grants one at a time. Each grant can own
 * thousands of token rows, so this reschedules instead of revoking them all in
 * one transaction. Library access is already denied by the library status.
 */
export const revokeAccountGrants = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const grants = await ctx.runQuery(components.mcp.grants.list, { userId });
    const grant = grants[0];
    if (!grant) return;
    await ctx.runMutation(components.mcp.grants.revoke, {
      userId,
      grantId: grant._id,
    });
    if (grants.length > 1)
      await ctx.scheduler.runAfter(0, internal.agents.revokeAccountGrants, { userId });
  },
});

/**
 * Bounded migration for connections created by the retired Armin OAuth server.
 * They have no component grant, so their stored token hashes can never
 * authenticate again; clear them and mark the rows revoked while keeping the
 * rows, provenance ids, activity, and retry records.
 */
export const retireLegacyConnections = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("agentConnections")
      .withIndex("by_component", (q) => q.eq("componentConnectionId", undefined))
      .paginate({ cursor: cursor ?? null, numItems: 100 });
    const now = Date.now();
    for (const row of page.page) {
      if (
        row.revokedAt !== undefined &&
        row.accessHash === undefined &&
        row.refreshHash === undefined
      )
        continue;
      await ctx.db.patch(row._id, {
        revokedAt: row.revokedAt ?? now,
        accessHash: undefined,
        accessExpiresAt: undefined,
        refreshHash: undefined,
        refreshExpiresAt: undefined,
      });
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.agents.retireLegacyConnections, {
        cursor: page.continueCursor,
      });
  },
});

/** Bounded cleanup of retired OAuth state, activity, and retry records. */
export const prune = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let more = false;
    // These tables are no longer written; rows age out by their own expiry.
    for (const table of [
      "agentAuthorizations",
      "agentClients",
      "agentRateLimits",
      "agentUsedRefreshTokens",
    ] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_expiry", (q) => q.lt("expiresAt", now))
        .take(200);
      for (const row of rows) await ctx.db.delete(row._id);
      more ||= rows.length === 200;
    }
    for (const [table, age] of [
      ["agentActivity", 90 * DAY],
      ["agentRequests", 7 * DAY],
    ] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_created", (q) => q.lt("createdAt", now - age))
        .take(200);
      for (const row of rows) await ctx.db.delete(row._id);
      more ||= rows.length === 200;
    }
    if (more) await ctx.scheduler.runAfter(0, internal.agents.prune, {});
  },
});
