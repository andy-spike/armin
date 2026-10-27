import { v } from "convex/values";
import { action, internalQuery, query } from "./_generated/server";
import { internalMutation, mutation } from "./functions";
import { internal } from "./_generated/api";
import { readableLibrary, writableLibrary } from "./model/access";
import { DAY, HOUR, hashSecret, newSecret, permissionFields } from "./model/agentAuth";
import { fail } from "./model/errors";

export const connections = query({
  args: {},
  handler: async (ctx) => {
    const library = await readableLibrary(ctx);
    if (!library) return { connections: [], activity: [] };
    const active = await ctx.db
      .query("agentConnections")
      .withIndex("by_library_revoked", (q) =>
        q.eq("libraryId", library._id).eq("revokedAt", undefined),
      )
      .order("desc")
      .take(20);
    const recent = await ctx.db
      .query("agentConnections")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .order("desc")
      .take(50);
    const rows = [...active, ...recent.filter((row) => row.revokedAt !== undefined)];
    const activity = await ctx.db
      .query("agentActivity")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .order("desc")
      .take(50);
    return {
      connections: rows.map(
        ({
          _id,
          name,
          scope,
          deckIds,
          allowCreateDecks,
          allowEdits,
          createdAt,
          lastUsedAt,
          revokedAt,
        }) => ({
          _id,
          name,
          scope,
          deckIds,
          allowCreateDecks,
          allowEdits,
          createdAt,
          lastUsedAt,
          revokedAt,
        }),
      ),
      activity,
    };
  },
});

export const authorization = query({
  args: { requestId: v.string() },
  handler: async (ctx, { requestId }) => {
    if (!(await readableLibrary(ctx))) return null;
    const row = await ctx.db
      .query("agentAuthorizations")
      .withIndex("by_request", (q) => q.eq("requestHash", requestId))
      .unique();
    if (!row || row.expiresAt <= Date.now() || row.connectionId) return null;
    const client = await ctx.db.get(row.clientId);
    return client
      ? {
          clientName: client.name,
          redirectOrigin: new URL(row.redirectUri).origin,
          expiresAt: row.expiresAt,
        }
      : null;
  },
});

export const approve = action({
  args: { requestId: v.string(), ...permissionFields },
  handler: async (ctx, args): Promise<{ redirectUrl: string }> => {
    const code = newSecret();
    const { redirectUri, state } = await ctx.runMutation(internal.agents.authorize, {
      ...args,
      codeHash: await hashSecret(code),
    });
    const url = new URL(redirectUri);
    url.searchParams.set("code", code);
    if (state) url.searchParams.set("state", state);
    return { redirectUrl: url.toString() };
  },
});

export const authorize = internalMutation({
  args: { requestId: v.string(), codeHash: v.string(), ...permissionFields },
  handler: async (ctx, args) => {
    const library = await writableLibrary(ctx);
    const row = await ctx.db
      .query("agentAuthorizations")
      .withIndex("by_request", (q) => q.eq("requestHash", args.requestId))
      .unique();
    if (!row || row.expiresAt <= Date.now() || row.connectionId)
      fail("INVALID", "This connection request expired. Start again in your assistant.");
    const client = await ctx.db.get(row.clientId);
    if (!client) fail("INVALID", "Unknown assistant.");
    const count = await ctx.db
      .query("agentConnections")
      .withIndex("by_library_revoked", (q) =>
        q.eq("libraryId", library._id).eq("revokedAt", undefined),
      )
      .take(20);
    if (count.length >= 20)
      fail(
        "QUOTA",
        "Disconnect an assistant before adding another. Up to 20 connections are supported.",
      );
    const deckIds = args.scope === "selected" ? [...new Set(args.deckIds)] : [];
    for (const id of deckIds) {
      const deck = await ctx.db.get(id);
      if (!deck || deck.libraryId !== library._id)
        fail("INVALID", "Choose decks from your own library.");
    }
    const now = Date.now();
    const connectionId = await ctx.db.insert("agentConnections", {
      libraryId: library._id,
      clientId: row.clientId,
      name: client.name,
      resource: row.resource,
      scope: args.scope,
      deckIds,
      allowCreateDecks: args.allowCreateDecks,
      allowEdits: args.scope !== "created" && args.allowEdits,
      createdAt: now,
    });
    await ctx.db.patch(row._id, {
      codeHash: args.codeHash,
      connectionId,
      libraryId: library._id,
      expiresAt: now + 5 * 60_000,
    });
    await ctx.db.patch(client._id, { expiresAt: now + 90 * DAY });
    return { redirectUri: row.redirectUri, state: row.state };
  },
});

export const deny = mutation({
  args: { requestId: v.string() },
  handler: async (ctx, { requestId }) => {
    await writableLibrary(ctx);
    const row = await ctx.db
      .query("agentAuthorizations")
      .withIndex("by_request", (q) => q.eq("requestHash", requestId))
      .unique();
    if (!row || row.expiresAt <= Date.now() || row.connectionId)
      fail("INVALID", "This connection request expired.");
    await ctx.db.delete(row._id);
    const url = new URL(row.redirectUri);
    url.searchParams.set("error", "access_denied");
    if (row.state) url.searchParams.set("state", row.state);
    return { redirectUrl: url.toString() };
  },
});

export const updateConnection = mutation({
  args: { connectionId: v.id("agentConnections"), ...permissionFields },
  handler: async (ctx, args) => {
    const library = await writableLibrary(ctx);
    const row = await ctx.db.get(args.connectionId);
    if (!row || row.libraryId !== library._id || row.revokedAt)
      fail("NOT_FOUND", "Connection not found.");
    const deckIds = args.scope === "selected" ? [...new Set(args.deckIds)] : [];
    for (const id of deckIds) {
      const deck = await ctx.db.get(id);
      if (!deck || deck.libraryId !== library._id)
        fail("INVALID", "Choose decks from your own library.");
    }
    await ctx.db.patch(row._id, {
      scope: args.scope,
      deckIds,
      allowEdits: args.scope !== "created" && args.allowEdits,
      allowCreateDecks: args.allowCreateDecks,
    });
    return null;
  },
});

export const revoke = mutation({
  args: { connectionId: v.id("agentConnections") },
  handler: async (ctx, { connectionId }) => {
    const library = await writableLibrary(ctx);
    const row = await ctx.db.get(connectionId);
    if (!row || row.libraryId !== library._id) fail("NOT_FOUND", "Connection not found.");
    await ctx.db.patch(row._id, {
      revokedAt: Date.now(),
      accessHash: undefined,
      refreshHash: undefined,
    });
    return null;
  },
});

export const client = internalQuery({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }) => {
    const id = ctx.db.normalizeId("agentClients", clientId);
    return id ? ctx.db.get(id) : null;
  },
});

export const register = internalMutation({
  args: { name: v.string(), redirectUris: v.array(v.string()) },
  handler: async (ctx, args) => {
    return ctx.db.insert("agentClients", {
      ...args,
      createdAt: Date.now(),
      expiresAt: Date.now() + DAY,
    });
  },
});

export const startAuthorization = internalMutation({
  args: {
    requestHash: v.string(),
    clientId: v.id("agentClients"),
    redirectUri: v.string(),
    state: v.string(),
    challenge: v.string(),
    resource: v.string(),
  },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client || !client.redirectUris.includes(args.redirectUri))
      fail("INVALID", "Unregistered redirect URI.");
    await ctx.db.insert("agentAuthorizations", { ...args, expiresAt: Date.now() + 10 * 60_000 });
  },
});

export const exchange = internalMutation({
  args: {
    clientId: v.string(),
    codeHash: v.optional(v.string()),
    challenge: v.optional(v.string()),
    redirectUri: v.optional(v.string()),
    refreshHash: v.optional(v.string()),
    resource: v.string(),
    accessHash: v.string(),
    nextRefreshHash: v.string(),
  },
  handler: async (ctx, args) => {
    let connection;
    if (args.codeHash) {
      const row = await ctx.db
        .query("agentAuthorizations")
        .withIndex("by_code", (q) => q.eq("codeHash", args.codeHash))
        .unique();
      if (
        !row ||
        row.expiresAt <= Date.now() ||
        !row.connectionId ||
        row.clientId !== args.clientId ||
        row.redirectUri !== args.redirectUri ||
        row.challenge !== args.challenge ||
        row.resource !== args.resource
      )
        return false;
      connection = await ctx.db.get(row.connectionId);
      await ctx.db.delete(row._id);
    } else if (args.refreshHash) {
      connection = await ctx.db
        .query("agentConnections")
        .withIndex("by_refresh", (q) => q.eq("refreshHash", args.refreshHash))
        .unique();
      if (!connection) {
        const used = await ctx.db
          .query("agentUsedRefreshTokens")
          .withIndex("by_hash", (q) => q.eq("hash", args.refreshHash!))
          .unique();
        if (used) {
          const compromised = await ctx.db.get(used.connectionId);
          if (compromised && compromised.clientId === args.clientId)
            await ctx.db.patch(compromised._id, {
              revokedAt: Date.now(),
              accessHash: undefined,
              refreshHash: undefined,
            });
        }
        return false;
      }
      if ((connection.refreshExpiresAt ?? 0) <= Date.now()) return false;
    }
    if (
      !connection ||
      connection.revokedAt ||
      connection.clientId !== args.clientId ||
      connection.resource !== args.resource
    )
      return false;
    const library = await ctx.db.get(connection.libraryId);
    if (!library || library.status !== "active") return false;
    if (connection.refreshHash)
      await ctx.db.insert("agentUsedRefreshTokens", {
        libraryId: connection.libraryId,
        connectionId: connection._id,
        hash: connection.refreshHash,
        expiresAt: connection.refreshExpiresAt ?? Date.now(),
      });
    await ctx.db.patch(connection._id, {
      accessHash: args.accessHash,
      accessExpiresAt: Date.now() + HOUR,
      refreshHash: args.nextRefreshHash,
      refreshExpiresAt: Date.now() + 30 * DAY,
    });
    return true;
  },
});

/** Bounded per-source and global buckets for unauthenticated OAuth endpoints. */
export const rateLimit = internalMutation({
  args: { key: v.string(), limit: v.number() },
  handler: async (ctx, { key, limit }) => {
    const row = await ctx.db
      .query("agentRateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (row && row.expiresAt > Date.now()) {
      if (row.count >= limit) return false;
      await ctx.db.patch(row._id, { count: row.count + 1 });
    } else if (row) await ctx.db.patch(row._id, { count: 1, expiresAt: Date.now() + HOUR });
    else await ctx.db.insert("agentRateLimits", { key, count: 1, expiresAt: Date.now() + HOUR });
    return true;
  },
});

export const prune = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let more = false;
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
