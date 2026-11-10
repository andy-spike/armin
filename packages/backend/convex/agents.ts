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
  AGENT_SCOPES,
  DAY,
  hashSecret,
  isAgentScope,
  MAX_CONNECTIONS,
  newSecret,
} from "./model/agentAuth";
import { fail } from "./model/errors";
import { countRead } from "./model/agentWrites";

const CODE_TTL_MS = 60_000;

function connectionView(
  row: Doc<"agentConnections">,
  grants: Map<string, { lastUsedAt?: number; scopes: string[] }>,
) {
  const id = row.componentConnectionId;
  const grant = id === undefined ? undefined : grants.get(id);
  const usable = grant !== undefined;
  const scopes = grant?.scopes ?? [];
  return {
    _id: row._id,
    name: row.name,
    createdAt: row.createdAt,
    lastUsedAt: id === undefined ? undefined : grant?.lastUsedAt,
    revokedAt: row.revokedAt ?? (usable ? undefined : (row.lastUsedAt ?? row.createdAt)),
    scopes,
    needsReconnect: usable && !scopes.some(isAgentScope),
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
    const byId = new Map(grants.map((grant) => [grant._id, grant]));
    const recent = await ctx.db
      .query("agentConnections")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .order("desc")
      .take(50);
    const views = recent.map((row) => connectionView(row, byId));
    const linked = new Set(
      recent.map((row) => row.componentConnectionId).filter((id): id is string => id !== undefined),
    );
    const unused = grants
      .filter((grant) => !linked.has(grant._id))
      .map((grant) => ({
        _id: grant._id,
        name: grant.name,
        createdAt: grant._creationTime,
        lastUsedAt: grant.lastUsedAt,
        revokedAt: undefined,
        scopes: grant.scopes,
        needsReconnect: !grant.scopes.some(isAgentScope),
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
      scopes: request.scopes.map((name) => ({
        name,
        description: isAgentScope(name) ? AGENT_SCOPES[name] : name,
      })),
    };
  },
});

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

export const touchConnection = internalMutation({
  args: { user: agentUser, read: v.boolean() },
  handler: async (ctx, { user, read }) => {
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
      const connectionId = await ctx.db.insert("agentConnections", {
        libraryId: library._id,
        componentConnectionId: user.connectionId,
        name: grant.name,
        resource: grant.resource,
        createdAt: now,
      });
      if (read) await countRead(ctx, { _id: connectionId, libraryId: library._id });
      return null;
    }
    if (existing.revokedAt || existing.libraryId !== library._id)
      fail("UNAUTHENTICATED", "Reconnect your assistant in Armin.");
    if (read) await countRead(ctx, existing);
    return null;
  },
});

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
    const revoked = await ctx.runMutation(components.mcp.grants.revoke, {
      userId: library.ownerId,
      grantId: connectionId,
    });
    if (!revoked) fail("NOT_FOUND", "Connection not found.");
    return null;
  },
});

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

export const prune = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let more = false;
    const expired = await ctx.db
      .query("agentRateLimits")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", now))
      .take(200);
    for (const row of expired) await ctx.db.delete(row._id);
    more ||= expired.length === 200;
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
