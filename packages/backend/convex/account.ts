import { v } from "convex/values";
import { defaultSchedulingSettings, isValidTimeZone } from "@armin/core/study";
import { mutation, query } from "./_generated/server";
import { getViewer } from "./model/access";
import { fail } from "./model/errors";
import { bumpRevision } from "./model/study";

/**
 * Which optional auth services this deployment has configured. Public so the
 * signed-out auth pages can hide actions that cannot work here.
 */
export const authFeatures = query({
  args: {},
  handler: async () => ({
    email: Boolean(process.env.RESEND_API_KEY),
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  }),
});

/** Who is signed in, whether they may save, and their library state. */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    return {
      userId: viewer.userId,
      email: viewer.email,
      name: viewer.name,
      emailVerified: viewer.emailVerified,
      library: viewer.library
        ? {
            id: viewer.library._id,
            status: viewer.library.status,
            timeZone: viewer.library.timeZone,
          }
        : null,
    };
  },
});

/**
 * Idempotently provision the signed-in user's single library. Every sign-in
 * method of a user resolves to the same Better Auth user id, so linked
 * Google and password sign-ins reach the same library. Convex serializes
 * concurrent calls, so two tabs can't create two libraries.
 */
export const ensureLibrary = mutation({
  args: { timeZone: v.string() },
  handler: async (ctx, { timeZone }) => {
    const viewer = await getViewer(ctx);
    if (!viewer) fail("UNAUTHENTICATED", "Sign in to continue.");
    if (!viewer.emailVerified) {
      fail("EMAIL_NOT_VERIFIED", "Verify your email before creating a library.");
    }
    if (viewer.library) {
      if (viewer.library.status !== "active") {
        fail("LIBRARY_DELETING", "This account is being deleted.");
      }
      return viewer.library._id;
    }
    const now = Date.now();
    const libraryId = await ctx.db.insert("libraries", {
      ownerId: viewer.userId,
      status: "active",
      timeZone: isValidTimeZone(timeZone) ? timeZone : "UTC",
      createdAt: now,
    });
    await ctx.db.insert("settings", {
      libraryId,
      ...defaultSchedulingSettings(),
      keybindings: null,
      updatedAt: now,
    });
    await ctx.db.insert("libraryCounters", {
      libraryId,
      revision: 0,
      mediaBytes: 0,
    });
    return libraryId;
  },
});

/** Change the account study-day time zone (IANA name). */
export const setTimeZone = mutation({
  args: { timeZone: v.string() },
  handler: async (ctx, { timeZone }) => {
    const viewer = await getViewer(ctx);
    if (!viewer?.library || viewer.library.status !== "active") {
      fail("UNAUTHENTICATED", "Sign in to continue.");
    }
    if (!isValidTimeZone(timeZone)) {
      fail("INVALID", "Choose a valid time zone.");
    }
    await ctx.db.patch(viewer.library._id, { timeZone });
    await bumpRevision(ctx, viewer.library._id);
    return timeZone;
  },
});

/**
 * The library's write revision. Clients subscribe to it and refresh their
 * cached reads when any tab or device changes the library.
 */
export const revision = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer?.library || viewer.library.status !== "active") return null;
    const counters = await ctx.db
      .query("libraryCounters")
      .withIndex("by_library", (q) => q.eq("libraryId", viewer.library!._id))
      .unique();
    return counters?.revision ?? 0;
  },
});
