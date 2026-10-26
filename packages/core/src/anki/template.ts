import { renderClozeText } from "../flashcard-rules";
import { convertAnkiCloze } from "./cloze";
import { decodeEntities } from "./html";
import type { AnkiNotetype, AnkiTemplate } from "./types";

/**
 * A small renderer for Anki card templates, used for notetypes that don't map
 * onto an Armin type. It covers what real decks use: field substitution,
 * conditional sections, `FrontSide`, special fields, and the common filters.
 */

type Node =
  | { kind: "text"; text: string }
  | { kind: "var"; name: string; filters: string[] }
  | { kind: "section"; name: string; inverted: boolean; children: Node[] };

const TAG_RE = /\{\{([^{}]*)\}\}/g;

function parseTemplate(source: string) {
  const root: Node[] = [];
  const stack: { name: string; inverted: boolean; children: Node[] }[] = [];
  const current = () => (stack.length ? stack[stack.length - 1].children : root);
  let last = 0;
  for (const match of source.matchAll(TAG_RE)) {
    if (match.index > last) current().push({ kind: "text", text: source.slice(last, match.index) });
    last = match.index + match[0].length;
    const body = match[1].trim();
    if (body.startsWith("!")) continue;
    if (body.startsWith("#") || body.startsWith("^")) {
      const section = { name: body.slice(1).trim(), inverted: body[0] === "^", children: [] };
      current().push({ kind: "section", ...section });
      stack.push(section);
    } else if (body.startsWith("/")) {
      const name = body.slice(1).trim();
      const index = stack.map((s) => s.name).lastIndexOf(name);
      if (index !== -1) stack.length = index;
    } else {
      const parts = body.split(":");
      current().push({
        kind: "var",
        name: parts[parts.length - 1].trim(),
        // The filter next to the field name runs first.
        filters: parts
          .slice(0, -1)
          .map((p) => p.trim())
          .reverse(),
      });
    }
  }
  if (last < source.length) current().push({ kind: "text", text: source.slice(last) });
  return root;
}

export const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Anki treats a field as empty when only markup and whitespace remain. */
export function isFieldEmpty(html: string) {
  const text = html.replace(/<(?!img\b)[^>]*>/gi, "").replace(/&nbsp;/gi, " ");
  return /^[\s​]*$/.test(text);
}

function stripHtml(html: string) {
  return decodeEntities(
    html.replace(/<br\s*\/?>|<\/(?:div|p|li)>/gi, "\n").replace(/<[^>]*>/g, ""),
  ).trim();
}

function furigana(html: string, mode: "furigana" | "kana" | "kanji") {
  return html.replace(/ ?([^ >]+?)\[(.+?)\]/g, (whole, base: string, reading: string) => {
    if (reading.startsWith("sound:")) return whole;
    if (mode === "kana") return reading;
    if (mode === "kanji") return base;
    return `<ruby>${base}<rt>${reading}</rt></ruby>`;
  });
}

export type TemplateContext = {
  fields: ReadonlyMap<string, string>;
  tags: string;
  deck: string;
  subdeck: string;
  notetype: string;
  card: string;
  /** Cloze number for `{{cloze:Field}}` (card ord + 1). */
  clozeNum: number;
  /** The rendered front, substituted for `{{FrontSide}}`. */
  frontSide: string;
  side: "front" | "back";
};

type RenderResult = { html: string; usedField: boolean };

function applyFilters(value: string, filters: string[], ctx: TemplateContext) {
  let out = value;
  for (const filter of filters) {
    const name = filter.split(/\s/)[0].toLowerCase();
    if (name === "type" || name === "tts") return "";
    if (name === "text") out = escapeHtml(stripHtml(out));
    else if (name === "furigana" || name === "kana" || name === "kanji") out = furigana(out, name);
    else if (name === "cloze" || name === "cloze-only") {
      const { text } = convertAnkiCloze(out);
      out = renderClozeText(text, ctx.side === "front" ? ctx.clozeNum : null);
    }
    // hint and unknown filters show the plain field value.
  }
  return out;
}

function renderNodes(nodes: Node[], ctx: TemplateContext, result: RenderResult): string {
  let out = "";
  for (const node of nodes) {
    if (node.kind === "text") {
      out += node.text;
    } else if (node.kind === "section") {
      const filled = !isFieldEmpty(lookup(node.name, ctx) ?? "");
      if (filled !== node.inverted) out += renderNodes(node.children, ctx, result);
    } else {
      const raw = lookup(node.name, ctx);
      if (raw === undefined) continue;
      const value = applyFilters(raw, node.filters, ctx);
      if (ctx.fields.has(node.name) && !isFieldEmpty(value)) result.usedField = true;
      out += value;
    }
  }
  return out;
}

function lookup(name: string, ctx: TemplateContext) {
  const field = ctx.fields.get(name);
  if (field !== undefined) return field;
  switch (name) {
    case "FrontSide":
      return ctx.frontSide;
    case "Tags":
      return escapeHtml(ctx.tags);
    case "Deck":
      return escapeHtml(ctx.deck);
    case "Subdeck":
      return escapeHtml(ctx.subdeck);
    case "Card":
      return escapeHtml(ctx.card);
    case "Type":
      return escapeHtml(ctx.notetype);
    default:
      return undefined;
  }
}

export function renderTemplate(source: string, ctx: TemplateContext): RenderResult {
  const result: RenderResult = { html: "", usedField: false };
  result.html = renderNodes(parseTemplate(source), ctx, result);
  return result;
}

const FRONT_MARK = "\u{F8FF}FRONT\u{F8FF}";
const ANSWER_RULE_RE = /<hr\s+id\s*=\s*["']?answer["']?\s*\/?>/i;

/**
 * Render one card: the front, and the back with the repeated front removed.
 * Returns null when Anki would not generate the card (the front shows no field).
 */
export function renderCard(
  notetype: AnkiNotetype,
  template: AnkiTemplate,
  base: Omit<TemplateContext, "frontSide" | "side" | "card" | "notetype">,
) {
  const ctx: TemplateContext = {
    ...base,
    notetype: notetype.name,
    card: template.name,
    frontSide: "",
    side: "front",
  };
  const front = renderTemplate(template.qfmt, ctx);
  if (!front.usedField || isFieldEmpty(front.html)) return null;

  const back = renderTemplate(template.afmt, { ...ctx, side: "back", frontSide: FRONT_MARK });
  const rule = ANSWER_RULE_RE.exec(back.html);
  let backHtml = rule
    ? back.html.slice(rule.index + rule[0].length)
    : back.html.split(FRONT_MARK).join("");
  backHtml = backHtml.split(FRONT_MARK).join("");
  // A back that only repeats the front has nothing new to show.
  if (isFieldEmpty(backHtml)) backHtml = front.html;
  return { front: front.html, back: backHtml };
}
