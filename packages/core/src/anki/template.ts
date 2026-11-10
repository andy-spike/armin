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
  deck: string;
  subdeck: string;
  notetype: string;
  card: string;
  /** Cloze number for `{{cloze:Field}}` (card ord + 1). */
  clozeNum: number;
  /** The rendered front, substituted for `{{FrontSide}}`. */
  frontSide: string;
  side: "front" | "back";
  /** Whether a substituted field still shows content after conversion. */
  fieldIsUsable?: (html: string) => boolean;
};

/**
 * `usedField`: a field shows something (Anki generates the card only then).
 * `unusableField`: a field had content, but none of it survives conversion.
 * `tts`: a `{{tts …:Field}}` reference was dropped (Armin doesn't speak text).
 */
type RenderResult = {
  html: string;
  usedField: boolean;
  unusableField: boolean;
  tts: boolean;
};

const filterName = (filter: string) => filter.split(/\s/)[0].toLowerCase();

function applyFilters(
  value: string,
  filters: string[],
  ctx: TemplateContext,
  result: RenderResult,
) {
  let out = value;
  for (const filter of filters) {
    const name = filterName(filter);
    if (name === "tts") {
      if (!isFieldEmpty(value)) result.tts = true;
      return "";
    }
    if (name === "type") return "";
    if (name === "text") out = escapeHtml(stripHtml(out));
    else if (name === "furigana" || name === "kana" || name === "kanji") out = furigana(out, name);
    else if (name === "cloze" || name === "cloze-only") {
      const { text } = convertAnkiCloze(out);
      out = renderClozeText(text, ctx.side === "front" ? ctx.clozeNum : null);
    }
    // Unknown filters show the plain field value.
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
      const filters = node.filters.filter((filter) => filterName(filter) !== "hint");
      const hint = filters.length !== node.filters.length;
      const value = applyFilters(raw, filters, ctx, result);
      if (ctx.fields.has(node.name) && !isFieldEmpty(value)) {
        if (ctx.fieldIsUsable && !ctx.fieldIsUsable(value)) result.unusableField = true;
        else result.usedField = true;
      }
      if (hint) {
        // A hint shows nothing on the front, and its own labelled section on the back.
        if (ctx.side === "back" && !isFieldEmpty(value))
          out += `<h3>${escapeHtml(node.name)}</h3>${value}`;
      } else {
        out += value;
      }
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
      // Tags are imported as card tags; a template's tag container is UI, not content.
      return "";
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
  const result: RenderResult = {
    html: "",
    usedField: false,
    unusableField: false,
    tts: false,
  };
  result.html = renderNodes(parseTemplate(source), ctx, result);
  return result;
}

/**
 * What a template side refers to: the fields it shows or tests in sections,
 * whether it repeats `{{FrontSide}}`, and the field a `{{type:Field}}` box asks for.
 */
export function templateRefs(source: string) {
  const fields = new Set<string>();
  let frontSide = false;
  let typeField: string | null = null;
  const walk = (nodes: Node[]) => {
    for (const node of nodes) {
      if (node.kind === "text") continue;
      if (node.name === "FrontSide") frontSide = true;
      else fields.add(node.name);
      if (node.kind === "section") walk(node.children);
      else if (!typeField && node.filters.some((filter) => filterName(filter) === "type"))
        typeField = node.name;
    }
  };
  walk(parseTemplate(source));
  return { fields, frontSide, typeField: typeField as string | null };
}

const FRONT_MARK = "\u{F8FF}FRONT\u{F8FF}";
const ANSWER_RULE_RE = /<hr\s+id\s*=\s*["']?answer["']?\s*\/?>/i;

/**
 * Render one card: the front, and the back with the repeated front removed.
 * Returns null when Anki would not generate the card (the front shows no field),
 * and `{ unusableFront: true }` when its front content doesn't survive conversion.
 * `tts` says a text-to-speech reference was dropped from either side.
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
  if (!front.usedField) {
    if (front.unusableField || front.tts) return { unusableFront: true as const, tts: front.tts };
    return null;
  }
  if (isFieldEmpty(front.html)) return null;

  const back = renderTemplate(template.afmt, { ...ctx, side: "back", frontSide: FRONT_MARK });
  const rule = ANSWER_RULE_RE.exec(back.html);
  let backHtml = (rule ? back.html.slice(rule.index + rule[0].length) : back.html)
    .split(FRONT_MARK)
    .join("");
  // A back that only repeats the front has nothing new to show.
  if (isFieldEmpty(backHtml)) backHtml = front.html;
  return {
    front: front.html,
    back: backHtml,
    tts: front.tts || back.tts,
    answerRule: rule !== null,
  };
}

/**
 * Drop one or more copies of the front from the start of a back that has no
 * `<hr id=answer>` (JLPT-style templates repeat the front by hand). Falls back
 * to the front so the back is never empty.
 */
export function stripRepeatedFront(front: string, back: string) {
  const normalize = (block: string) => block.replace(/\s+/g, " ").trim();
  const frontBlocks = front
    .split(/\n{2,}/)
    .map(normalize)
    .filter(Boolean);
  if (frontBlocks.length === 0) return back;
  const backBlocks = back.split(/\n{2,}/);
  let index = 0;
  while (index + frontBlocks.length <= backBlocks.length) {
    const repeated = frontBlocks.every(
      (block, offset) => normalize(backBlocks[index + offset] ?? "") === block,
    );
    if (!repeated) break;
    index += frontBlocks.length;
  }
  if (index === 0) return back;
  return backBlocks.slice(index).join("\n\n").trim() || front;
}
