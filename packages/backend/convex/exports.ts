import { rowsInDecks } from "./model/access";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getViewer, readableLibrary, writableLibrary } from "./model/access";
import { fail } from "./model/errors";
import { EXPORT_TTL_MS } from "./model/limits";
import { getSettingsRow } from "./model/study";

/** Start building a ZIP export of the caller's library. */
export const start = mutation({
  args: {},
  handler: async (ctx) => {
    const library = await writableLibrary(ctx);
    const recent = await ctx.db
      .query("exports")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .collect();
    if (recent.some((row) => row.status === "pending")) {
      fail("INVALID", "An export is already being prepared.");
    }
    const now = Date.now();
    const date = new Date(now).toISOString().slice(0, 10);
    const id = await ctx.db.insert("exports", {
      libraryId: library._id,
      status: "pending",
      fileName: `armin-library-${date}.zip`,
      createdAt: now,
      expiresAt: now + EXPORT_TTL_MS,
    });
    await ctx.scheduler.runAfter(0, internal.exportBuilder.build, { exportId: id });
    await ctx.scheduler.runAfter(EXPORT_TTL_MS, internal.exports.expire, { exportId: id });
    return id;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const rows = await ctx.db
      .query("exports")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .order("desc")
      .take(5);
    return rows.map((row) => ({
      id: row._id,
      status: row.status,
      fileName: row.fileName,
      size: row.size ?? null,
      error: row.error ?? null,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    }));
  },
});

export const expire = internalMutation({
  args: { exportId: v.id("exports") },
  handler: async (ctx, { exportId }) => {
    const row = await ctx.db.get(exportId);
    if (!row) return;
    if (row.storageId) await ctx.storage.delete(row.storageId);
    await ctx.db.delete(row._id);
  },
});

export const markResult = internalMutation({
  args: {
    exportId: v.id("exports"),
    storageId: v.optional(v.id("_storage")),
    size: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { exportId, storageId, size, error }) => {
    const row = await ctx.db.get(exportId);
    if (!row) {
      // Expired or the account was deleted while building.
      if (storageId) await ctx.storage.delete(storageId);
      return;
    }
    if (error || !storageId) {
      await ctx.db.patch(row._id, { status: "failed", error: error ?? "Export failed." });
      return;
    }
    await ctx.db.patch(row._id, { status: "ready", storageId, size });
  },
});

/** Export job input: the library it belongs to, if still active. */
export const jobLibrary = internalQuery({
  args: { exportId: v.id("exports") },
  handler: async (ctx, { exportId }) => {
    const row = await ctx.db.get(exportId);
    if (!row || row.status !== "pending") return null;
    const library = await ctx.db.get(row.libraryId);
    if (!library || library.status !== "active") return null;
    return { libraryId: library._id, timeZone: library.timeZone, createdAt: library.createdAt };
  },
});

export const revision = internalQuery({
  args: { libraryId: v.id("libraries") },
  handler: async (ctx, { libraryId }) => {
    const counters = await ctx.db
      .query("libraryCounters")
      .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
      .unique();
    return counters?.revision ?? 0;
  },
});

/**
 * Everything except review history, read in one query so it is a single
 * consistent snapshot. Bounded by the beta library quotas.
 */
export const snapshotCore = internalQuery({
  args: { libraryId: v.id("libraries") },
  handler: async (ctx, { libraryId }) => {
    const byLibrary = <T extends "decks" | "media">(table: T) =>
      ctx.db
        .query(table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_library" as never, (q: any) => q.eq("libraryId", libraryId))
        .collect();
    const counters = await ctx.db
      .query("libraryCounters")
      .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
      .unique();
    const decks = await byLibrary("decks");
    const ids = new Set(decks.map((deck) => deck._id));
    return {
      revision: counters?.revision ?? 0,
      decks,
      flashcards: await rowsInDecks(ctx, "flashcards", ids),
      reviewUnits: await rowsInDecks(ctx, "reviewUnits", ids),
      prereqs: await rowsInDecks(ctx, "prereqs", ids),
      deckSettings: await rowsInDecks(ctx, "deckSettings", ids),
      media: await byLibrary("media"),
      settings: await getSettingsRow(ctx, libraryId),
    };
  },
});

export const logPage = internalQuery({
  args: { libraryId: v.id("libraries"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { libraryId, cursor }) => {
    return ctx.db
      .query("reviewLogs")
      .withIndex("by_library_review", (q) => q.eq("libraryId", libraryId))
      .paginate({ cursor, numItems: 2000 });
  },
});

/** Resolve a ready export for the current session; null unless it's theirs. */
export const lookupForViewer = internalQuery({
  args: { exportId: v.string() },
  handler: async (ctx, { exportId }) => {
    const viewer = await getViewer(ctx);
    if (!viewer?.library || viewer.library.status !== "active") return null;
    const id = ctx.db.normalizeId("exports", exportId);
    const row = id ? await ctx.db.get(id) : null;
    if (!row || row.libraryId !== viewer.library._id) return null;
    if (row.status !== "ready" || !row.storageId || row.expiresAt < Date.now()) return null;
    return { storageId: row.storageId, fileName: row.fileName };
  },
});
