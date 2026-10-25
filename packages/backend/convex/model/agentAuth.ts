import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { fail } from "./errors";

export const agentScope = v.union(
  v.literal("created"),
  v.literal("selected"),
  v.literal("library"),
);
export const permissionFields = {
  scope: agentScope,
  deckIds: v.array(v.id("decks")),
  allowCreateDecks: v.boolean(),
  allowEdits: v.boolean(),
};
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export async function hashSecret(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Called only in actions, where cryptographic randomness is available. */
export function newSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function agentAccess(ctx: QueryCtx, tokenHash: string) {
  const connection = await ctx.db
    .query("agentConnections")
    .withIndex("by_access", (q) => q.eq("accessHash", tokenHash))
    .unique();
  if (!connection || connection.revokedAt || (connection.accessExpiresAt ?? 0) <= Date.now()) {
    fail("UNAUTHENTICATED", "Reconnect your assistant in Armin.");
  }
  const library = await ctx.db.get(connection.libraryId);
  if (!library || library.status !== "active")
    fail("UNAUTHENTICATED", "This library is unavailable.");
  return { connection, library };
}

export async function canAccessDeck(
  ctx: QueryCtx,
  connection: Doc<"agentConnections">,
  deckId: Id<"decks">,
) {
  if (connection.scope === "library" || connection.deckIds.includes(deckId)) return true;
  const created = await ctx.db
    .query("agentCreatedDecks")
    .withIndex("by_connection_deck", (q) =>
      q.eq("connectionId", connection._id).eq("deckId", deckId),
    )
    .unique();
  return Boolean(created);
}

export async function requireDeck(
  ctx: QueryCtx,
  connection: Doc<"agentConnections">,
  deckId: Id<"decks">,
  edit = false,
) {
  const deck = await ctx.db.get(deckId);
  if (
    !deck ||
    deck.libraryId !== connection.libraryId ||
    !(await canAccessDeck(ctx, connection, deckId))
  ) {
    fail("NOT_FOUND", "Deck not found or not shared with this connection.");
  }
  if (edit && !connection.allowEdits) {
    const created = await ctx.db
      .query("agentCreatedDecks")
      .withIndex("by_connection_deck", (q) =>
        q.eq("connectionId", connection._id).eq("deckId", deckId),
      )
      .unique();
    if (!created)
      fail(
        "INVALID",
        "Editing existing decks is disabled for this connection. Change its permissions in Armin.",
      );
  }
  return deck;
}
