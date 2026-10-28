import { vMcpUser, type McpUser } from "@convex-dev/mcp";
import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { fail } from "./errors";

/**
 * Agent connections are owned by the `@convex-dev/mcp` component: it verifies
 * the bearer token, binds it to the audience, and stores the grant. Armin keeps
 * an `agentConnections` row per component grant for provenance, activity, the
 * connection cap, and app-side revocation.
 *
 * One approved connection can use every tool on its user's whole library.
 * There are no per-deck, read-only, or edit permissions to check.
 */
export const AGENT_SCOPE = "armin:author";
export const MAX_CONNECTIONS = 20;
export const DAY = 24 * 60 * 60_000;

/**
 * Validator for passing a component-verified identity into internal functions.
 * Better Auth user ids are strings, and they are what `libraries.ownerId`
 * stores, so the default string validator is the right shape.
 */
export const agentUser = vMcpUser();

/** The canonical HTTP origin that serves the MCP endpoint. */
export function agentSiteUrl() {
  const site = process.env.CONVEX_SITE_URL;
  if (!site) fail("UNAUTHENTICATED", "Assistant connections are unavailable on this deployment.");
  return site.replace(/\/+$/, "");
}

/** The OAuth resource audience of the MCP endpoint. */
export function agentResource() {
  return `${agentSiteUrl()}/mcp`;
}

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

/**
 * Re-read the component grant inside the current transaction. A token is
 * accepted only while its grant still exists, so a revocation committed before
 * this function runs (or a refresh-token replay that deletes the grant) denies
 * the operation. Missing grants fail closed.
 */
export async function activeComponentGrant(ctx: QueryCtx, user: McpUser<string>) {
  const grants = await ctx.runQuery(components.mcp.grants.list, { userId: user.userId });
  const grant = grants.find((row) => row._id === user.connectionId);
  if (
    !grant ||
    grant.kind !== "oauth" ||
    grant.resource !== agentResource() ||
    !grant.scopes.includes(AGENT_SCOPE)
  )
    fail("UNAUTHENTICATED", "Reconnect your assistant in Armin.");
  return grant;
}

/** Resolve the caller's active library and the app record for this grant. */
export async function agentAccess(ctx: QueryCtx, user: McpUser<string>) {
  const grant = await activeComponentGrant(ctx, user);
  const library = await ctx.db
    .query("libraries")
    .withIndex("by_owner", (q) => q.eq("ownerId", user.userId))
    .unique();
  if (!library || library.status !== "active")
    fail("UNAUTHENTICATED", "This library is unavailable.");
  const connection = await ctx.db
    .query("agentConnections")
    .withIndex("by_component", (q) => q.eq("componentConnectionId", user.connectionId))
    .unique();
  if (!connection || connection.revokedAt || connection.libraryId !== library._id)
    fail("UNAUTHENTICATED", "Reconnect your assistant in Armin.");
  return { connection, library, grant };
}

/** Load a deck and confirm it belongs to the connection's library. */
export async function requireDeck(
  ctx: QueryCtx,
  connection: Doc<"agentConnections">,
  deckId: Id<"decks">,
) {
  const deck = await ctx.db.get(deckId);
  if (!deck || deck.libraryId !== connection.libraryId) fail("NOT_FOUND", "Deck not found.");
  return deck;
}
