import { internal } from "../_generated/api";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { adjustReviewUnitCount } from "./study";

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
 * Delete a deck with its flashcards, review units, edges, image links, and
 * settings in one transaction, using deck-wide reads so the work fits Convex
 * limits at the beta quotas. Review history can be arbitrarily long, so it is
 * removed afterwards by a resumable batch job; queues and export ignore
 * history whose deck or review unit is gone. Callers bump the library revision.
 */
export async function deleteDeckCascade(ctx: MutationCtx, deck: Doc<"decks">) {
  const libraryId = deck.libraryId;
  const [flashcards, units, edges, settings] = await Promise.all([
    ctx.db
      .query("flashcards")
      .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
      .collect(),
    ctx.db
      .query("reviewUnits")
      .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
      .collect(),
    ctx.db
      .query("prereqs")
      .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
      .collect(),
    ctx.db
      .query("deckSettings")
      .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
      .unique(),
  ]);
  const flashcardIds = new Set(flashcards.map((flashcard) => flashcard._id));
  const links = (
    await ctx.db
      .query("flashcardMedia")
      .withIndex("by_library_file", (q) => q.eq("libraryId", libraryId))
      .collect()
  ).filter((link) => flashcardIds.has(link.flashcardId));

  await adjustReviewUnitCount(ctx, libraryId, -units.length);
  for (const edge of edges) await ctx.db.delete(edge._id);
  for (const unit of units) await ctx.db.delete(unit._id);
  for (const link of links) await ctx.db.delete(link._id);
  for (const flashcard of flashcards) await ctx.db.delete(flashcard._id);
  if (settings) await ctx.db.delete(settings._id);
  await ctx.db.delete(deck._id);

  const fileNames = [...new Set(links.map((link) => link.fileName))];
  if (fileNames.length > 0) {
    await ctx.scheduler.runAfter(60 * 60_000, internal.media.collectUnreferenced, {
      libraryId,
      fileNames,
    });
  }
  await ctx.scheduler.runAfter(0, internal.deletion.cleanupRemovedUnits, {
    unitIds: units.map((unit) => unit._id),
  });
}
