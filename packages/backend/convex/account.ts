import { v } from "convex/values";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@armin/core/study";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import { getViewer } from "./model/access";
import { fail } from "./model/errors";
import { bumpRevision, defaultSettingsRow } from "./model/study";
import { isReviewer, reviewerResetHours } from "./model/reviewer";
import { isSelfHosted } from "./model/selfHost";
import { libraryPlan } from "./model/usage";

export const authFeatures = query({
  args: {},
  handler: async () => {
    const selfHosted = isSelfHosted();
    return {
      email: Boolean(process.env.RESEND_API_KEY),
      google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      selfHosted,
      signUpOpen: !selfHosted,
    };
  },
});

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
      reviewer: isReviewer(viewer.userId)
        ? { resetHours: reviewerResetHours(), lastResetAt: viewer.library?.reviewerResetAt ?? null }
        : null,
      library: viewer.library
        ? {
            id: viewer.library._id,
            status: viewer.library.status,
            timeZone: viewer.library.timeZone,
            plan: libraryPlan(viewer.library),
          }
        : null,
    };
  },
});

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
      timeZone: isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE,
      createdAt: now,
    });
    await ctx.db.insert("settings", defaultSettingsRow(libraryId, now));
    await ctx.db.insert("libraryCounters", {
      libraryId,
      revision: 0,
      mediaBytes: 0,
    });
    return libraryId;
  },
});

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
