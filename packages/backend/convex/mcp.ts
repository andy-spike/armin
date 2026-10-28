import { McpServer, tool, type McpUser, type ToolCtx } from "@convex-dev/mcp";
import type { GenericValidator, Infer } from "convex/values";
import { components, internal } from "./_generated/api";
import { AGENT_SCOPE, hashSecret } from "./model/agentAuth";
import {
  agentInstructions,
  agentToolArgs,
  agentToolDescriptions,
  agentToolReturns,
  agentToolTitles,
  type AgentToolName,
} from "./model/agentTools";

/**
 * The hosted MCP server. The component owns OAuth, token storage, audience
 * binding, and the protocol. Every tool passes the component-verified identity
 * to an internal function, which re-reads the grant and the library in the same
 * transaction as the read or write.
 */

const READ_ONLY = new Set<AgentToolName>(["list_decks", "read_deck", "read_prerequisites"]);

const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
const allowedOrigins = [
  process.env.CONVEX_SITE_URL,
  siteUrl,
  "https://chatgpt.com",
  "https://claude.ai",
  "https://claude.com",
  ...(process.env.AGENT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
].filter((origin): origin is string => Boolean(origin));

async function run<R extends GenericValidator>(
  ctx: ToolCtx,
  name: AgentToolName,
  input: unknown,
  user: McpUser<string>,
): Promise<Infer<R>> {
  // Record the connection (and its recent use) before the data operation. A
  // revoked grant fails here, and each operation re-checks it again.
  await ctx.runMutation(internal.agents.touchConnection, { user });
  const result = READ_ONLY.has(name)
    ? await ctx.runQuery(internal.agentAuthoring.read, { user, tool: name, input })
    : await ctx.runMutation(internal.agentAuthoring.write, {
        user,
        tool: name,
        input,
        fingerprint: await hashSecret(JSON.stringify({ tool: name, input })),
      });
  return result as Infer<R>;
}

const annotations = (name: AgentToolName) => ({
  readOnlyHint: READ_ONLY.has(name),
  destructiveHint: !READ_ONLY.has(name) && name !== "save_cards",
  idempotentHint: true,
  openWorldHint: false,
});

/** Bound tool request bodies before the component parses JSON. */
class ArminMcpServer extends McpServer<string> {
  override async handleMcp(ctx: ToolCtx, request: Request) {
    const maxBytes = 1_048_576;
    const reader = request.body?.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let body = "";
    if (reader) {
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > maxBytes) {
            await reader.cancel();
            return new Response("Request too large", { status: 413 });
          }
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    }
    return super.handleMcp(ctx, new Request(request, { method: "POST", body }));
  }
}

export const mcp = new ArminMcpServer(components.mcp, {
  name: "Armin",
  title: "Armin",
  version: "1.0.0",
  instructions: agentInstructions,
  // The component sends users to `${consentUrl}?request=<id>`; the web app's
  // existing /connect-agent page already reads that parameter.
  consentUrl: new URL("/connect-agent", siteUrl).toString(),
  scopes: {
    [AGENT_SCOPE]: "Create, read, and edit cards, decks, and prerequisites in your Armin library",
  },
  allowedOrigins,
  // Device authorization is off: browser consent is the only approval path.
  deviceFlow: false,
  tools: {
    list_decks: tool({
      title: agentToolTitles.list_decks,
      description: agentToolDescriptions.list_decks,
      args: agentToolArgs.list_decks,
      returns: agentToolReturns.list_decks,
      annotations: annotations("list_decks"),
      scope: AGENT_SCOPE,
      handler: (ctx, args, user) =>
        run<typeof agentToolReturns.list_decks>(ctx, "list_decks", args, user),
    }),
    read_deck: tool({
      title: agentToolTitles.read_deck,
      description: agentToolDescriptions.read_deck,
      args: agentToolArgs.read_deck,
      returns: agentToolReturns.read_deck,
      annotations: annotations("read_deck"),
      scope: AGENT_SCOPE,
      handler: (ctx, args, user) =>
        run<typeof agentToolReturns.read_deck>(ctx, "read_deck", args, user),
    }),
    read_prerequisites: tool({
      title: agentToolTitles.read_prerequisites,
      description: agentToolDescriptions.read_prerequisites,
      args: agentToolArgs.read_prerequisites,
      returns: agentToolReturns.read_prerequisites,
      annotations: annotations("read_prerequisites"),
      scope: AGENT_SCOPE,
      handler: (ctx, args, user) =>
        run<typeof agentToolReturns.read_prerequisites>(ctx, "read_prerequisites", args, user),
    }),
    save_cards: tool({
      title: agentToolTitles.save_cards,
      description: agentToolDescriptions.save_cards,
      args: agentToolArgs.save_cards,
      returns: agentToolReturns.save_cards,
      annotations: annotations("save_cards"),
      scope: AGENT_SCOPE,
      handler: (ctx, args, user) =>
        run<typeof agentToolReturns.save_cards>(ctx, "save_cards", args, user),
    }),
    update_card: tool({
      title: agentToolTitles.update_card,
      description: agentToolDescriptions.update_card,
      args: agentToolArgs.update_card,
      returns: agentToolReturns.update_card,
      annotations: annotations("update_card"),
      scope: AGENT_SCOPE,
      handler: (ctx, args, user) =>
        run<typeof agentToolReturns.update_card>(ctx, "update_card", args, user),
    }),
    set_card_archived: tool({
      title: agentToolTitles.set_card_archived,
      description: agentToolDescriptions.set_card_archived,
      args: agentToolArgs.set_card_archived,
      returns: agentToolReturns.set_card_archived,
      annotations: annotations("set_card_archived"),
      scope: AGENT_SCOPE,
      handler: (ctx, args, user) =>
        run<typeof agentToolReturns.set_card_archived>(ctx, "set_card_archived", args, user),
    }),
    update_deck: tool({
      title: agentToolTitles.update_deck,
      description: agentToolDescriptions.update_deck,
      args: agentToolArgs.update_deck,
      returns: agentToolReturns.update_deck,
      annotations: annotations("update_deck"),
      scope: AGENT_SCOPE,
      handler: (ctx, args, user) =>
        run<typeof agentToolReturns.update_deck>(ctx, "update_deck", args, user),
    }),
    set_prerequisite: tool({
      title: agentToolTitles.set_prerequisite,
      description: agentToolDescriptions.set_prerequisite,
      args: agentToolArgs.set_prerequisite,
      returns: agentToolReturns.set_prerequisite,
      annotations: annotations("set_prerequisite"),
      scope: AGENT_SCOPE,
      handler: (ctx, args, user) =>
        run<typeof agentToolReturns.set_prerequisite>(ctx, "set_prerequisite", args, user),
    }),
    move_card: tool({
      title: agentToolTitles.move_card,
      description: agentToolDescriptions.move_card,
      args: agentToolArgs.move_card,
      returns: agentToolReturns.move_card,
      annotations: annotations("move_card"),
      scope: AGENT_SCOPE,
      handler: (ctx, args, user) =>
        run<typeof agentToolReturns.move_card>(ctx, "move_card", args, user),
    }),
  },
});
