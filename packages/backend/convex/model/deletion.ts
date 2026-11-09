import { internal } from "../_generated/api";
import { requestBillingSync } from "./billing";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function markLibraryDeleting(ctx: GenericMutationCtx<DataModel>, ownerId: string) {
  await requestBillingSync(ctx, ownerId, { deleted: true });
  const library = await ctx.db
    .query("libraries")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .unique();
  if (!library) return;
  if (library.status !== "deleting") {
    await ctx.db.patch(library._id, { status: "deleting" });
  }
  await ctx.scheduler.runAfter(0, internal.deletion.cleanupLibrary, {
    libraryId: library._id,
  });
}

export async function deleteDeckCascade(ctx: MutationCtx, deck: Doc<"decks">) {
  await ctx.db.delete(deck._id);
  await ctx.scheduler.runAfter(0, internal.deletion.cleanupDeck, {
    libraryId: deck.libraryId,
    deckId: deck._id,
  });
}
