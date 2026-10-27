import { internal } from "../_generated/api";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Mark the user's library as deleting and start bounded cleanup. Runs inside
 * the Better Auth user-delete trigger, so access ends in the same transaction
 * that removes the user; reads and writes check `status === "active"`.
 */
export async function markLibraryDeleting(ctx: GenericMutationCtx<DataModel>, ownerId: string) {
  const library = await ctx.db
    .query("libraries")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .unique();
  if (!library) return;
  if (library.status !== "deleting") {
    await ctx.db.patch(library._id, {
      status: "deleting",
      deletionRequestedAt: Date.now(),
    });
  }
  await ctx.scheduler.runAfter(0, internal.deletion.cleanupLibrary, {
    libraryId: library._id,
  });
}

/**
 * Removing the deck is the atomic visibility boundary. Every study entry point
 * rejects rows whose deck no longer exists; the scheduled job then removes
 * those rows in bounded transactions. Callers bump the library revision.
 */
export async function deleteDeckCascade(ctx: MutationCtx, deck: Doc<"decks">) {
  await ctx.db.delete(deck._id);
  await ctx.scheduler.runAfter(0, internal.deletion.cleanupDeck, {
    libraryId: deck.libraryId,
    deckId: deck._id,
  });
}
