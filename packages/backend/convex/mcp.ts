import { McpServer, tool, type McpUser, type ToolCtx } from "@convex-dev/mcp";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { AGENT_SCOPES, agentSiteUrl, hashSecret, newSecret } from "./model/agentAuth";
import {
  agentInstructions,
  agentToolArgs,
  agentToolDescriptions,
  agentToolReturns,
  agentToolSchemas,
  agentToolScopes,
  agentToolTitles,
  type AgentToolName,
} from "./model/agentTools";
import { agentInputJsonSchema } from "./model/agentInput";
import { agentResult, type AgentToolResult } from "./model/agentResults";

import {
  agentGuideReturns,
  agentImportToolArgs,
  agentImportToolDescriptions,
  agentImportToolSchemas,
  agentImportToolScopes,
  agentImportToolTitles,
} from "./model/agentImportTools";

const READ_ONLY = new Set<AgentToolName>([
  "list_decks",
  "search_cards",
  "read_deck",
  "get_study_overview",
  "get_card_details",
  "get_due_cards",
]);

const NON_DESTRUCTIVE = new Set<AgentToolName>(["save_cards", "rate_card"]);

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

async function run(ctx: ToolCtx, name: AgentToolName, input: unknown, user: McpUser<string>) {
  const scope = agentToolScopes[name];
  await ctx.runMutation(internal.agents.touchConnection, {
    user,
    read: READ_ONLY.has(name),
  });
  const result: AgentToolResult = READ_ONLY.has(name)
    ? await ctx.runQuery(internal.agentAuthoring.read, { user, scope, tool: name, input })
    : await ctx.runMutation(internal.agentAuthoring.write, {
        user,
        scope,
        tool: name,
        input,
        fingerprint: await hashSecret(JSON.stringify({ tool: name, input })),
      });
  return agentResult(result);
}

const annotations = (name: AgentToolName) => ({
  readOnlyHint: READ_ONLY.has(name),
  destructiveHint: !READ_ONLY.has(name) && !NON_DESTRUCTIVE.has(name),
  idempotentHint: true,
  openWorldHint: false,
});

const importReadOnly = new Set(["get_guide", "anki_import_status"]);
const importTools = Object.fromEntries(
  (Object.keys(agentImportToolArgs) as (keyof typeof agentImportToolArgs)[]).map((name) => [
    name,
    tool({
      title: agentImportToolTitles[name],
      description: agentImportToolDescriptions[name],
      args: agentImportToolArgs[name],
      inputSchema: agentInputJsonSchema(agentImportToolSchemas[name]),
      returns: name === "get_guide" ? agentGuideReturns : v.any(),
      scope: agentImportToolScopes[name],
      annotations: {
        readOnlyHint: importReadOnly.has(name),
        destructiveHint: name === "anki_import_cancel",
        idempotentHint: name !== "anki_import_upload_token",
        openWorldHint: false,
      },
      handler: async (ctx, input, user) => {
        const scope = agentImportToolScopes[name];
        await ctx.runMutation(internal.agents.touchConnection, {
          user,
          read: importReadOnly.has(name),
        });
        if (importReadOnly.has(name))
          return ctx.runQuery(internal.agentImports.read, { user, scope, tool: name, input });
        const uploadToken =
          name === "anki_import_start" || name === "anki_import_upload_token"
            ? newSecret()
            : undefined;
        const result = await ctx.runMutation(internal.agentImports.write, {
          user,
          scope,
          tool: name,
          input,
          fingerprint: await hashSecret(JSON.stringify({ tool: name, input })),
          ...(uploadToken ? { uploadTokenHash: await hashSecret(uploadToken) } : {}),
        });
        return uploadToken && result.uploadTokenIssued
          ? {
              ...result,
              uploadToken,
              ...(typeof result.importId === "string"
                ? { uploadUrl: `${agentSiteUrl()}/agent-imports/${result.importId}/media` }
                : {}),
            }
          : result;
      },
    }),
  ]),
);

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
  consentUrl: new URL("/connect-agent", siteUrl).toString(),
  scopes: AGENT_SCOPES,
  allowedOrigins,
  deviceFlow: false,
  tools: {
    ...importTools,
    list_decks: tool({
      title: agentToolTitles.list_decks,
      description: agentToolDescriptions.list_decks,
      args: agentToolArgs.list_decks,
      inputSchema: agentInputJsonSchema(agentToolSchemas.list_decks),
      returns: agentToolReturns.list_decks,
      annotations: annotations("list_decks"),
      scope: agentToolScopes.list_decks,
      handler: (ctx, args, user) => run(ctx, "list_decks", args, user),
    }),
    search_cards: tool({
      title: agentToolTitles.search_cards,
      description: agentToolDescriptions.search_cards,
      args: agentToolArgs.search_cards,
      inputSchema: agentInputJsonSchema(agentToolSchemas.search_cards),
      returns: agentToolReturns.search_cards,
      annotations: annotations("search_cards"),
      scope: agentToolScopes.search_cards,
      handler: (ctx, args, user) => run(ctx, "search_cards", args, user),
    }),
    read_deck: tool({
      title: agentToolTitles.read_deck,
      description: agentToolDescriptions.read_deck,
      args: agentToolArgs.read_deck,
      inputSchema: agentInputJsonSchema(agentToolSchemas.read_deck),
      returns: agentToolReturns.read_deck,
      annotations: annotations("read_deck"),
      scope: agentToolScopes.read_deck,
      handler: (ctx, args, user) => run(ctx, "read_deck", args, user),
    }),
    get_study_overview: tool({
      title: agentToolTitles.get_study_overview,
      description: agentToolDescriptions.get_study_overview,
      args: agentToolArgs.get_study_overview,
      inputSchema: agentInputJsonSchema(agentToolSchemas.get_study_overview),
      returns: agentToolReturns.get_study_overview,
      annotations: annotations("get_study_overview"),
      scope: agentToolScopes.get_study_overview,
      handler: (ctx, args, user) => run(ctx, "get_study_overview", args, user),
    }),
    get_card_details: tool({
      title: agentToolTitles.get_card_details,
      description: agentToolDescriptions.get_card_details,
      args: agentToolArgs.get_card_details,
      inputSchema: agentInputJsonSchema(agentToolSchemas.get_card_details),
      returns: agentToolReturns.get_card_details,
      annotations: annotations("get_card_details"),
      scope: agentToolScopes.get_card_details,
      handler: (ctx, args, user) => run(ctx, "get_card_details", args, user),
    }),
    get_due_cards: tool({
      title: agentToolTitles.get_due_cards,
      description: agentToolDescriptions.get_due_cards,
      args: agentToolArgs.get_due_cards,
      inputSchema: agentInputJsonSchema(agentToolSchemas.get_due_cards),
      returns: agentToolReturns.get_due_cards,
      annotations: annotations("get_due_cards"),
      scope: agentToolScopes.get_due_cards,
      handler: (ctx, args, user) => run(ctx, "get_due_cards", args, user),
    }),
    save_cards: tool({
      title: agentToolTitles.save_cards,
      description: agentToolDescriptions.save_cards,
      args: agentToolArgs.save_cards,
      inputSchema: agentInputJsonSchema(agentToolSchemas.save_cards),
      returns: agentToolReturns.save_cards,
      annotations: annotations("save_cards"),
      scope: agentToolScopes.save_cards,
      handler: (ctx, args, user) => run(ctx, "save_cards", args, user),
    }),
    update_card: tool({
      title: agentToolTitles.update_card,
      description: agentToolDescriptions.update_card,
      args: agentToolArgs.update_card,
      inputSchema: agentInputJsonSchema(agentToolSchemas.update_card),
      returns: agentToolReturns.update_card,
      annotations: annotations("update_card"),
      scope: agentToolScopes.update_card,
      handler: (ctx, args, user) => run(ctx, "update_card", args, user),
    }),
    set_card_archived: tool({
      title: agentToolTitles.set_card_archived,
      description: agentToolDescriptions.set_card_archived,
      args: agentToolArgs.set_card_archived,
      inputSchema: agentInputJsonSchema(agentToolSchemas.set_card_archived),
      returns: agentToolReturns.set_card_archived,
      annotations: annotations("set_card_archived"),
      scope: agentToolScopes.set_card_archived,
      handler: (ctx, args, user) => run(ctx, "set_card_archived", args, user),
    }),
    update_deck: tool({
      title: agentToolTitles.update_deck,
      description: agentToolDescriptions.update_deck,
      args: agentToolArgs.update_deck,
      inputSchema: agentInputJsonSchema(agentToolSchemas.update_deck),
      returns: agentToolReturns.update_deck,
      annotations: annotations("update_deck"),
      scope: agentToolScopes.update_deck,
      handler: (ctx, args, user) => run(ctx, "update_deck", args, user),
    }),
    set_prerequisite: tool({
      title: agentToolTitles.set_prerequisite,
      description: agentToolDescriptions.set_prerequisite,
      args: agentToolArgs.set_prerequisite,
      inputSchema: agentInputJsonSchema(agentToolSchemas.set_prerequisite),
      returns: agentToolReturns.set_prerequisite,
      annotations: annotations("set_prerequisite"),
      scope: agentToolScopes.set_prerequisite,
      handler: (ctx, args, user) => run(ctx, "set_prerequisite", args, user),
    }),
    move_card: tool({
      title: agentToolTitles.move_card,
      description: agentToolDescriptions.move_card,
      args: agentToolArgs.move_card,
      inputSchema: agentInputJsonSchema(agentToolSchemas.move_card),
      returns: agentToolReturns.move_card,
      annotations: annotations("move_card"),
      scope: agentToolScopes.move_card,
      handler: (ctx, args, user) => run(ctx, "move_card", args, user),
    }),
    rate_card: tool({
      title: agentToolTitles.rate_card,
      description: agentToolDescriptions.rate_card,
      args: agentToolArgs.rate_card,
      inputSchema: agentInputJsonSchema(agentToolSchemas.rate_card),
      returns: agentToolReturns.rate_card,
      annotations: annotations("rate_card"),
      scope: agentToolScopes.rate_card,
      handler: (ctx, args, user) => run(ctx, "rate_card", args, user),
    }),
  },
});
