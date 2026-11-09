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

export async function readableLibrary(ctx: QueryCtx): Promise<Doc<"libraries"> | null> {
  const viewer = await getViewer(ctx);
  if (!viewer?.library || viewer.library.status !== "active") return null;
  return viewer.library;
}

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

export async function owned<
  T extends "decks" | "flashcards" | "reviewUnits" | "reviewLogs" | "exports",
>(ctx: QueryCtx, library: Doc<"libraries">, id: Id<T>): Promise<Doc<T> | null> {
  const doc = (await ctx.db.get(id)) as (Doc<T> & { libraryId: Id<"libraries"> }) | null;
  if (!doc || doc.libraryId !== library._id || ("staging" in doc && doc.staging)) return null;
  if ("deckId" in doc) {
    const deckId =
      "reviewUnitId" in doc
        ? (await ctx.db.get(doc.reviewUnitId as Id<"reviewUnits">))?.deckId
        : (doc.deckId as Id<"decks">);
    if (!deckId) return null;
    const deck = await ctx.db.get(deckId);
    if (!deck || deck.libraryId !== library._id || deck.staging) return null;
  }
  return doc;
}

export async function readableDeck(ctx: QueryCtx, library: Doc<"libraries">, deckId: string) {
  const id = ctx.db.normalizeId("decks", deckId);
  return id ? owned(ctx, library, id) : null;
}

export async function ownedOrFail<
  T extends "decks" | "flashcards" | "reviewUnits" | "reviewLogs" | "exports",
>(ctx: QueryCtx, library: Doc<"libraries">, id: Id<T>, label: string): Promise<Doc<T>> {
  const doc = await owned(ctx, library, id);
  if (!doc) fail("NOT_FOUND", `${label} not found.`);
  return doc;
}

export async function activeDeckIds(ctx: QueryCtx, libraryId: Id<"libraries">) {
  return new Set(
    (
      await ctx.db
        .query("decks")
        .withIndex("by_library", (q) => q.eq("libraryId", libraryId))
        .collect()
    )
      .filter((deck) => !deck.staging)
      .map((deck) => deck._id),
  );
}

export async function rowsInDecks<
  T extends "flashcards" | "reviewUnits" | "prereqs" | "deckSettings",
>(ctx: QueryCtx, table: T, deckIds: Iterable<Id<"decks">>) {
  const rows = [];
  for (const deckId of deckIds) {
    rows.push(
      ...(await ctx.db
        .query(table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_deck" as never, (q: any) => q.eq("deckId", deckId))
        .collect()),
    );
  }
  return rows;
}
