import { callToolResult } from "@convex-dev/mcp";
import {
  flashcardDisplay,
  type FlashcardContent,
  type FlashcardType,
} from "@armin/core/flashcard-types";
import type { Id } from "../_generated/dataModel";

const MAX_TEXT_CHARS = 4000;
const MAX_PREVIEW_CHARS = 160;

export type AgentLink = {
  uri: string;
  name: string;
  description?: string;
};

export type AgentToolResult = {
  value: Record<string, unknown>;
  text: string;
  links?: AgentLink[];
};

export type AgentWriteToolResult = AgentToolResult & {
  deckId: Id<"decks">;
  summary: string;
};

export function siteUrl() {
  return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function deckUrl(deckId: string) {
  return `${siteUrl()}/deck/${deckId}`;
}

export function deckLink(deck: { _id: string; name: string }) {
  return { uri: deckUrl(deck._id), name: deck.name, description: "Open in Armin" };
}

export function plainText(text: string, max = MAX_PREVIEW_CHARS) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export function cardPreview(type: FlashcardType, content: FlashcardContent) {
  const display = flashcardDisplay(type, content);
  return plainText(display.front || display.back) || "(no text)";
}

function boundText(text: string) {
  if (text.length <= MAX_TEXT_CHARS) return text;
  const cut = text.slice(0, MAX_TEXT_CHARS);
  const line = cut.lastIndexOf("\n");
  return `${cut.slice(0, line > 0 ? line : MAX_TEXT_CHARS)}\n… Truncated. Narrow the request with a smaller limit or a more specific query.`;
}

export function agentResult({ value, text, links }: AgentToolResult) {
  return callToolResult({
    content: [
      { type: "text", text: boundText(text) },
      ...(links ?? []).map((link) => ({ type: "resource_link" as const, ...link })),
    ],
    structuredContent: value,
  });
}
