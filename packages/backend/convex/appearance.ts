import { v } from "convex/values";
import { appearanceProblem } from "@armin/core/themes";
import { query } from "./_generated/server";
import { mutation } from "./functions";
import { readableLibrary, writableLibrary } from "./model/access";
import { fail } from "./model/errors";

const appearanceFields = {
  mode: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
  lightTheme: v.string(),
  darkTheme: v.string(),
  customThemes: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      seeds: v.object({
        background: v.string(),
        text: v.string(),
        accent: v.string(),
        again: v.string(),
        hard: v.string(),
        good: v.string(),
        easy: v.string(),
      }),
    }),
  ),
};

/** The account's theme choice, or null before one is saved (the default). */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const library = await readableLibrary(ctx);
    if (!library) return null;
    const row = await ctx.db
      .query("appearance")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .unique();
    if (!row) return null;
    return {
      mode: row.mode,
      lightTheme: row.lightTheme,
      darkTheme: row.darkTheme,
      customThemes: row.customThemes,
    };
  },
});

/** Replace the account's theme choice and custom themes. */
export const set = mutation({
  args: appearanceFields,
  handler: async (ctx, appearance) => {
    const library = await writableLibrary(ctx);
    const customThemes = appearance.customThemes.map((theme) => ({
      ...theme,
      name: theme.name.trim(),
    }));
    const next = { ...appearance, customThemes };
    const problem = appearanceProblem(next);
    if (problem) fail("INVALID", problem);
    const row = await ctx.db
      .query("appearance")
      .withIndex("by_library", (q) => q.eq("libraryId", library._id))
      .unique();
    const now = Date.now();
    if (row) await ctx.db.patch(row._id, { ...next, updatedAt: now });
    else await ctx.db.insert("appearance", { libraryId: library._id, ...next, updatedAt: now });
    return next;
  },
});
