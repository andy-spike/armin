import {
  addGraphEdge,
  createGraphCycleIndex,
  graphEdgeKey,
  wouldCreateCycleIndexed,
} from "@armin/core/prereq-graph";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { fail } from "./errors";
import { MAX_PREREQS_PER_DECK } from "./limits";
import { refreshDependentSubgraph, SettingsCache } from "./study";

type Link = { prereqId: Id<"flashcards">; dependentId: Id<"flashcards"> };

/*
 * Prerequisite link writes shared by the graph editor and the assistant tools.
 * The cycle rules come from `@armin/core/prereq-graph`, the same ones the web
 * canvas uses before it sends a link.
 */

/**
 * Add links inside one deck; callers check both cards belong to it. Links
 * already present are skipped. A self-link, a cycle (including one formed by
 * links earlier in the same call), or passing the per-deck cap rejects the
 * whole write. Locks are refreshed downstream of every added link.
 */
export async function linkPrerequisites(
  ctx: MutationCtx,
  deck: Doc<"decks">,
  links: Link[],
  now: number,
) {
  const existing = await ctx.db
    .query("prereqs")
    .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
    .take(MAX_PREREQS_PER_DECK + 1);
  const index = createGraphCycleIndex(existing);
  const added: Link[] = [];
  for (const link of links) {
    if (index.edgeKeys.has(graphEdgeKey(link.prereqId, link.dependentId))) continue;
    if (link.prereqId === link.dependentId) {
      fail("INVALID", "A flashcard cannot be its own prerequisite.");
    }
    if (wouldCreateCycleIndexed(index, link.prereqId, link.dependentId)) {
      fail("INVALID", "That link would create a cycle in the prerequisite graph.");
    }
    if (existing.length + added.length >= MAX_PREREQS_PER_DECK) {
      fail("QUOTA", `The beta allows ${MAX_PREREQS_PER_DECK} prerequisite links per deck.`);
    }
    addGraphEdge(index, link);
    added.push(link);
  }
  for (const link of added) {
    await ctx.db.insert("prereqs", { ...link, libraryId: deck.libraryId, deckId: deck._id });
  }
  if (added.length > 0) {
    const settings = new SettingsCache(ctx, deck.libraryId);
    await refreshDependentSubgraph(
      ctx,
      added.map((link) => link.dependentId),
      settings,
      now,
    );
  }
  return added;
}

/** Remove one link and recompute what it gated. */
export async function unlinkPrerequisite(ctx: MutationCtx, edge: Doc<"prereqs">, now: number) {
  await ctx.db.delete(edge._id);
  const settings = new SettingsCache(ctx, edge.libraryId);
  await refreshDependentSubgraph(ctx, [edge.dependentId], settings, now);
}
