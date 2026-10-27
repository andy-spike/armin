import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { authComponent } from "../auth";
import { fail } from "./errors";

export type Viewer = {
  userId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  library: Doc<"libraries"> | null;
};

/**
 * The signed-in user and their library, or null when there is no valid
 * session. `safeGetAuthUser` checks the session row, so sign-out and account
 * deletion revoke access immediately even while a JWT is still unexpired.
 */
export async function getViewer(ctx: QueryCtx): Promise<Viewer | null> {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) return null;
  const library = await ctx.db
    .query("libraries")
    .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
    .unique();
  return {
    userId: user._id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    library,
  };
}

/** Library for reads; null when signed out, unprovisioned, or being deleted. */
export async function readableLibrary(ctx: QueryCtx): Promise<Doc<"libraries"> | null> {
  const viewer = await getViewer(ctx);
  if (!viewer?.library || viewer.library.status !== "active") return null;
  return viewer.library;
}

/** Library for a write. Throws a coded error when the caller may not write. */
export async function writableLibrary(ctx: MutationCtx): Promise<Doc<"libraries">> {
  const viewer = await getViewer(ctx);
  if (!viewer) fail("UNAUTHENTICATED", "Sign in to continue.");
  if (!viewer.emailVerified) {
    fail("EMAIL_NOT_VERIFIED", "Verify your email before saving study data.");
  }
  if (!viewer.library) fail("NO_LIBRARY", "Your library is not ready yet.");
  if (viewer.library.status !== "active") {
    fail("LIBRARY_DELETING", "This account is being deleted.");
  }
  return viewer.library;
}

/** Load a document and confirm it belongs to the library. */
export async function owned<
  T extends "decks" | "flashcards" | "reviewUnits" | "reviewLogs" | "exports",
>(ctx: QueryCtx, library: Doc<"libraries">, id: Id<T>): Promise<Doc<T> | null> {
  const doc = (await ctx.db.get(id)) as (Doc<T> & { libraryId: Id<"libraries"> }) | null;
  if (!doc || doc.libraryId !== library._id) return null;
  if ("deckId" in doc) {
    // Moved cards keep historical log.deckId; ownership follows the unit's
    // current deck, just as export and Undo do.
    const deckId =
      "reviewUnitId" in doc
        ? (await ctx.db.get(doc.reviewUnitId as Id<"reviewUnits">))?.deckId
        : (doc.deckId as Id<"decks">);
    if (!deckId) return null;
    const deck = await ctx.db.get(deckId);
    if (!deck || deck.libraryId !== library._id) return null;
  }
  return doc;
}

export async function ownedOrFail<
  T extends "decks" | "flashcards" | "reviewUnits" | "reviewLogs" | "exports",
>(ctx: QueryCtx, library: Doc<"libraries">, id: Id<T>, label: string): Promise<Doc<T>> {
  const doc = await owned(ctx, library, id);
  if (!doc) fail("NOT_FOUND", `${label} not found.`);
  return doc;
}

/** Normalize a possibly-foreign id string to a table id, or null. */
export function normalizeId<T extends "decks" | "flashcards" | "reviewUnits">(
  ctx: QueryCtx,
  table: T,
  id: string,
): Id<T> | null {
  return ctx.db.normalizeId(table, id);
}

/** One deck-range read, shared by library-wide queries during bounded cleanup. */
export async function activeDeckIds(ctx: QueryCtx, libraryId: Id<"libraries">) {
  return new Set(
    (
      await ctx.db
        .query("decks")
        .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
        .collect()
    ).map((deck) => deck._id),
  );
}
