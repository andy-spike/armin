import { vMcpUser, type McpUser } from "@convex-dev/mcp";
import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { fail } from "./errors";

export const AGENT_SCOPES = {
  "armin:read": "Read your decks, cards, prerequisite links, study stats, and card details.",
  "armin:write": "Create and edit cards and decks, and change prerequisite links.",
  "armin:import":
    "Convert and stage Anki imports, including image uploads, and publish them after you approve.",
  "armin:study": "Show the cards that are due and record your own ratings.",
} as const;

export type AgentScope = keyof typeof AGENT_SCOPES;

const LEGACY_SCOPE = "armin:author";
export const RECONNECT_MESSAGE =
  "Armin's assistant permissions changed. Reconnect this assistant in Armin to continue.";

export const MAX_CONNECTIONS = 20;
export const DAY = 24 * 60 * 60_000;

export const agentUser = vMcpUser();

export function isAgentScope(value: string): value is AgentScope {
  return Object.prototype.hasOwnProperty.call(AGENT_SCOPES, value);
}

export function agentSiteUrl() {
  const site = process.env.CONVEX_SITE_URL;
  if (!site) fail("UNAUTHENTICATED", "Assistant connections are unavailable on this deployment.");
  return site.replace(/\/+$/, "");
}

export function agentResource() {
  return `${agentSiteUrl()}/mcp`;
}

export async function hashSecret(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function newSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function activeComponentGrant(ctx: QueryCtx, user: McpUser<string>) {
  const grants = await ctx.runQuery(components.mcp.grants.list, { userId: user.userId });
  const grant = grants.find((row) => row._id === user.connectionId);
  if (!grant || grant.kind !== "oauth" || grant.resource !== agentResource())
    fail("UNAUTHENTICATED", "Reconnect your assistant in Armin.");
  if (!grant.scopes.some(isAgentScope)) {
    if (grant.scopes.includes(LEGACY_SCOPE)) fail("UNAUTHENTICATED", RECONNECT_MESSAGE);
    fail("UNAUTHENTICATED", "Reconnect your assistant in Armin.");
  }
  return grant;
}

export async function agentAccess(ctx: QueryCtx, user: McpUser<string>, scope: string) {
  const grant = await activeComponentGrant(ctx, user);
  if (!isAgentScope(scope)) fail("INVALID", "Unknown tool permission.");
  if (!grant.scopes.includes(scope))
    fail(
      "UNAUTHENTICATED",
      `This assistant connection does not include the ${scope} permission. Reconnect it in Armin to grant it.`,
    );
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

export async function requireDeck(
  ctx: QueryCtx,
  connection: Doc<"agentConnections">,
  deckId: Id<"decks">,
) {
  const deck = await ctx.db.get(deckId);
  if (!deck || deck.libraryId !== connection.libraryId || deck.staging)
    fail("NOT_FOUND", "Deck not found.");
  return deck;
}
