import { ANKI_MEDIA_PREFIX, type ImportWarningCode } from "./types";
import { splitMath } from "../math";
import { renderMath } from "../math-render";

const SUPPORTED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"]);
const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  "mp3",
  "ogg",
  "oga",
  "opus",
  "m4a",
  "wav",
  "flac",
  "aac",
]);
const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "m4v",
  "webm",
  "mkv",
  "mov",
  "avi",
  "ogv",
  "flv",
  "mpg",
  "mpeg",
  "wmv",
  "3gp",
]);
const VOID_TAGS = new Set(["br", "img", "hr", "input", "meta", "link", "source", "wbr", "area"]);
const SKIPPED_TAGS = new Set(["script", "style", "head", "title", "template", "noscript"]);
const BLOCK_TAGS = new Set([
  "div",
  "p",
  "ul",
  "ol",
  "li",
  "table",
  "tr",
  "blockquote",
  "pre",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "section",
  "article",
  "header",
  "footer",
  "center",
  "dl",
  "dt",
  "dd",
  "figure",
  "figcaption",
]);

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  bull: "•",
  middot: "·",
  deg: "°",
  plusmn: "±",
  times: "×",
  divide: "÷",
  larr: "←",
  rarr: "→",
  uarr: "↑",
  darr: "↓",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  sect: "§",
  para: "¶",
  iexcl: "¡",
  iquest: "¿",
};

export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

type HtmlNode = HtmlElement | { text: string };
type HtmlElement = {
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
};

const TOKEN_RE =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!(?:doctype)[^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|[^<]+|</gi;
const ATTR_RE = /([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function parseAttrs(source: string) {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(ATTR_RE)) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

const IMPLICIT_CLOSE: Record<string, string[]> = {
  li: ["li"],
  p: ["p"],
  tr: ["tr", "td", "th"],
  td: ["td", "th"],
  th: ["td", "th"],
  dt: ["dt", "dd"],
  dd: ["dt", "dd"],
};
const IMPLICIT_CLOSE_BARRIERS = new Set(["ul", "ol", "table", "dl", "blockquote", "div"]);

function parseHtml(html: string) {
  const root: HtmlElement = { tag: "#root", attrs: {}, children: [] };
  const stack: HtmlElement[] = [root];
  const top = () => stack[stack.length - 1];

  const closeImplicit = (tag: string) => {
    const closes = IMPLICIT_CLOSE[tag];
    if (!closes) return;
    for (let i = stack.length - 1; i > 0; i--) {
      if (IMPLICIT_CLOSE_BARRIERS.has(stack[i].tag)) return;
      if (closes.includes(stack[i].tag)) {
        stack.length = i;
        return;
      }
    }
  };

  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(html)) !== null) {
    const [token, closing, rawTag, rawAttrs] = match;
    if (rawTag === undefined) {
      if (token.startsWith("<!")) continue;
      top().children.push({ text: token });
      continue;
    }
    const tag = rawTag.toLowerCase();
    if (closing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    closeImplicit(tag);
    const element: HtmlElement = { tag, attrs: parseAttrs(rawAttrs ?? ""), children: [] };
    top().children.push(element);
    if (VOID_TAGS.has(tag) || /\/\s*$/.test(rawAttrs ?? "")) continue;
    if (tag === "script" || tag === "style") {
      const end = html.slice(TOKEN_RE.lastIndex).search(new RegExp(`</${tag}\\s*>`, "i"));
      if (end === -1) {
        TOKEN_RE.lastIndex = html.length;
      } else {
        const closeLength = html.slice(TOKEN_RE.lastIndex + end).indexOf(">") + 1;
        TOKEN_RE.lastIndex += end + closeLength;
      }
      continue;
    }
    stack.push(element);
  }
  return root;
}

export type HtmlConversion = {
  markdown: string;
  media: string[];
};

export type HtmlWarningSink = (code: ImportWarningCode) => void;

export type HtmlOptions = {
  mediaNames: ReadonlySet<string>;
  warn: HtmlWarningSink;
  plain?: boolean;
  svg?: boolean;
};

const SOUND_RE = /\[sound:([^\]]*)\]/g;
const AUDIO_TAG = "armin-audio";

function escapeMarkdown(text: string) {
  return text
    .replace(/[\\`*[\]<]/g, "\\$&")
    .replace(/_/g, (ch, offset: number) => {
      const word = (c: string | undefined) => c !== undefined && /[A-Za-z0-9]/.test(c);
      return word(text[offset - 1]) && word(text[offset + 1]) ? ch : "\\_";
    })
    .replace(/[~^]/g, "\\$&")
    .replace(/==/g, "\\=\\=")
    .replace(/^(\s*)([#>+-])(?=\s|$|>)/gm, "$1\\$2")
    .replace(/^(\s*\d+)([.)])(?=\s)/gm, "$1\\$2")
    .replace(/^(\s*)([-=*_]{3,})\s*$/gm, (_, indent: string, rule: string) => `${indent}\\${rule}`)
    .replace(/&(?=#?\w+;)/g, "\\&");
}

function escapeText(text: string, plain: boolean) {
  return plain ? text : escapeMarkdown(text);
}

type RenderState = {
  options: HtmlOptions;
  media: Set<string>;
  open: { bold: number; italic: number; strike: number; sup: number; sub: number; mark: number };
};

function textOf(nodes: HtmlNode[]): string {
  return nodes
    .map((node) => ("text" in node ? decodeEntities(node.text) : textOf(node.children)))
    .join("");
}

function fileExtension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function encodeMediaName(name: string) {
  return encodeURIComponent(name).replace(/[()]/g, (ch) => (ch === "(" ? "%28" : "%29"));
}

export type ImageCheck =
  | { ok: true; name: string; placeholder: string }
  | { ok: false; reason: "missing_media" | "unsupported_image_removed" };

export function decodeMediaName(encoded: string) {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function packageFile(rawSrc: string) {
  if (/^(?:https?:|data:|\/\/)/i.test(rawSrc.trim())) return null;
  const name = decodeMediaName(rawSrc.trim());
  return { name, ext: fileExtension(name) };
}

export function isSupportedAudioName(name: string) {
  return SUPPORTED_AUDIO_EXTENSIONS.has(fileExtension(name));
}

export function inspectImage(
  rawSrc: string,
  mediaNames: ReadonlySet<string>,
  svg = false,
): ImageCheck {
  const file = packageFile(rawSrc);
  if (!file) return { ok: false, reason: "missing_media" };
  const { name, ext } = file;
  if (!SUPPORTED_IMAGE_EXTENSIONS.has(ext) && !(svg && ext === "svg")) {
    return { ok: false, reason: "unsupported_image_removed" };
  }
  if (!mediaNames.has(name)) return { ok: false, reason: "missing_media" };
  return { ok: true, name, placeholder: `${ANKI_MEDIA_PREFIX}${encodeMediaName(name)}` };
}

export type AudioCheck =
  | { ok: true; name: string; placeholder: string }
  | { ok: false; reason: "missing_media" | "audio_removed" | "video_removed" };

export function inspectAudio(rawSrc: string, mediaNames: ReadonlySet<string>): AudioCheck {
  const file = packageFile(rawSrc);
  if (!file) return { ok: false, reason: "missing_media" };
  const { name, ext } = file;
  if (VIDEO_EXTENSIONS.has(ext)) return { ok: false, reason: "video_removed" };
  if (!SUPPORTED_AUDIO_EXTENSIONS.has(ext)) return { ok: false, reason: "audio_removed" };
  if (!mediaNames.has(name)) return { ok: false, reason: "missing_media" };
  return { ok: true, name, placeholder: `${ANKI_MEDIA_PREFIX}${encodeMediaName(name)}` };
}

function audioMarkdown(rawSrc: string, state: RenderState) {
  if (state.options.plain) {
    state.options.warn("audio_removed");
    return "";
  }
  const audio = inspectAudio(rawSrc, state.options.mediaNames);
  if (!audio.ok) {
    state.options.warn(audio.reason);
    return "";
  }
  state.media.add(audio.name);
  return `![audio](${audio.placeholder})`;
}

function isAccentColor(value: string) {
  const color = value.trim().toLowerCase();
  if (!color || /^(?:inherit|initial|unset|transparent|currentcolor|none|var\()/.test(color))
    return false;
  const named: Record<string, string> = {
    black: "#000000",
    white: "#ffffff",
    gray: "#808080",
    grey: "#808080",
    silver: "#c0c0c0",
    darkgray: "#a9a9a9",
    darkgrey: "#a9a9a9",
    lightgray: "#d3d3d3",
    lightgrey: "#d3d3d3",
    dimgray: "#696969",
    dimgrey: "#696969",
    gainsboro: "#dcdcdc",
    whitesmoke: "#f5f5f5",
  };
  let rgb: number[] | null = null;
  const hex = /^#([0-9a-f]{3,8})$/.exec(named[color] ?? color);
  if (hex) {
    const digits =
      hex[1].length <= 4
        ? hex[1]
            .split("")
            .map((d) => d + d)
            .join("")
        : hex[1];
    rgb = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
  } else {
    const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?/.exec(color);
    if (fn) {
      if (fn[4] !== undefined && parseFloat(fn[4]) === 0) return false;
      rgb = [fn[1], fn[2], fn[3]].map(Number);
    }
  }
  if (!rgb) return /^[a-z]+$|^hsla?\(/.test(color);
  const max = Math.max(...rgb) / 255;
  const min = Math.min(...rgb) / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;
  return saturation > 0.25 && max > 0.2;
}

function highlighted(el: HtmlElement) {
  if (el.tag === "mark" || el.tag === "u") return true;
  if (el.tag === "font" && el.attrs.color && isAccentColor(el.attrs.color)) return true;
  const style = el.attrs.style ?? "";
  for (const match of style.matchAll(/(?:^|;)\s*(color|background(?:-color)?)\s*:\s*([^;]+)/gi)) {
    if (isAccentColor(match[2])) return true;
  }
  return false;
}

function imagePlaceholder(rawSrc: string, state: RenderState) {
  const image = inspectImage(rawSrc, state.options.mediaNames, state.options.svg);
  if (!image.ok) {
    state.options.warn(image.reason);
    return null;
  }
  state.media.add(image.name);
  return image.placeholder;
}

function renderBlocks(nodes: HtmlNode[], state: RenderState): string[] {
  const blocks: string[] = [];
  let inline = "";
  let previous: HtmlNode | undefined;
  const flush = () => {
    const trimmed = trimInline(inline.replace(/( {2}\n)[ \t]+/g, "$1"));
    if (trimmed) blocks.push(trimmed);
    inline = "";
  };
  for (const node of nodes) {
    if ("text" in node || !BLOCK_TAGS.has(node.tag)) {
      inline = appendInline(inline, renderInline(node, state), node, previous, state);
      previous = node;
      continue;
    }
    flush();
    previous = undefined;
    blocks.push(...renderBlockElement(node, state));
  }
  flush();
  return blocks;
}

function trimInline(text: string) {
  return text.replace(/^(?:[ \t]*\n)+|(?:[ \t]*\n)+[ \t]*$/g, "").replace(/^[ \t]+|[ \t]+$/g, "");
}

function renderBlockElement(el: HtmlElement, state: RenderState): string[] {
  const plain = state.options.plain;
  switch (el.tag) {
    case "ul":
    case "ol": {
      const items = el.children.filter(
        (child): child is HtmlElement => "tag" in child && child.tag === "li",
      );
      const loose = el.children.filter((child) => !("tag" in child) || child.tag !== "li");
      const lines: string[] = [];
      items.forEach((item, index) => {
        const marker = plain ? "•" : el.tag === "ol" ? `${index + 1}.` : "-";
        const indent = " ".repeat(plain ? 0 : marker.length + 1);
        const body = renderBlocks(item.children, state);
        if (body.length === 0) return;
        const text = body.join("\n").split("\n");
        lines.push(
          `${marker} ${text[0]}`,
          ...text.slice(1).map((line) => (line ? `${indent}${line}` : line)),
        );
      });
      const prefix = renderBlocks(loose, state);
      return [...prefix, ...(lines.length > 0 ? [lines.join("\n")] : [])];
    }
    case "li": {
      const body = renderBlocks(el.children, state);
      return body.length > 0 ? [`${plain ? "•" : "-"} ${body.join("\n")}`] : [];
    }
    case "table":
      return renderTable(el, state);
    case "blockquote": {
      const body = renderBlocks(el.children, state).join("\n\n");
      if (!body) return [];
      return [
        plain
          ? body
          : body
              .split("\n")
              .map((line) => `> ${line}`.trimEnd())
              .join("\n"),
      ];
    }
    case "pre": {
      const code = textOf(el.children).replace(/^\n+|\s+$/g, "");
      if (!code) return [];
      return [plain ? code : fence(code)];
    }
    case "hr":
      return plain ? [] : ["---"];
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const text = trimInline(renderInlineChildren(el, state)).replace(/\s*\n\s*/g, " ");
      if (!text) return [];
      return [plain ? text : `${"#".repeat(Number(el.tag[1]))} ${text}`];
    }
    default:
      return renderBlocks(el.children, state);
  }
}

function fence(code: string) {
  let ticks = "```";
  while (code.includes(ticks)) ticks += "`";
  return `${ticks}\n${code}\n${ticks}`;
}

function renderTable(table: HtmlElement, state: RenderState): string[] {
  const rows: HtmlElement[] = [];
  const collect = (nodes: HtmlNode[]) => {
    for (const node of nodes) {
      if (!("tag" in node)) continue;
      if (node.tag === "tr") rows.push(node);
      else if (["thead", "tbody", "tfoot"].includes(node.tag)) collect(node.children);
    }
  };
  collect(table.children);
  const cells = rows.map((row) =>
    row.children.filter(
      (child): child is HtmlElement => "tag" in child && (child.tag === "td" || child.tag === "th"),
    ),
  );
  const width = Math.max(0, ...cells.map((row) => row.length));
  const simple =
    !state.options.plain &&
    rows.length > 0 &&
    width > 0 &&
    cells.every((row) => row.length === width) &&
    cells.every((row) =>
      row.every(
        (cell) =>
          !cell.attrs.colspan &&
          !cell.attrs.rowspan &&
          !cell.children.some(
            (child) =>
              "tag" in child &&
              BLOCK_TAGS.has(child.tag) &&
              child.tag !== "div" &&
              child.tag !== "p",
          ),
      ),
    );
  const renderCell = (cell: HtmlElement) =>
    trimInline(renderInlineChildren(cell, state))
      .replace(/\s*\n\s*/g, " ")
      .replace(/\|/g, "\\|");
  if (!simple) {
    return cells
      .map((row) =>
        row
          .map((cell) => trimInline(renderBlocks(cell.children, state).join(" ")))
          .filter(Boolean)
          .join(state.options.plain ? " | " : " · "),
      )
      .filter(Boolean);
  }
  const lines = cells.map((row) => `| ${row.map(renderCell).join(" | ")} |`);
  lines.splice(1, 0, `| ${Array.from({ length: width }, () => "---").join(" | ")} |`);
  return [lines.join("\n")];
}

function renderInlineChildren(el: HtmlElement, state: RenderState) {
  let result = "";
  let previous: HtmlNode | undefined;
  for (const child of el.children) {
    result = appendInline(result, renderInline(child, state), child, previous, state);
    previous = child;
  }
  return result;
}

function appendInline(
  result: string,
  next: string,
  node: HtmlNode,
  previous: HtmlNode | undefined,
  state: RenderState,
) {
  const bold = (item?: HtmlNode) =>
    item && "tag" in item && (item.tag === "b" || item.tag === "strong");
  if (
    !state.options.plain &&
    state.open.bold === 0 &&
    bold(previous) &&
    bold(node) &&
    result.endsWith("**") &&
    next.startsWith("**")
  ) {
    return result.slice(0, -2) + next.slice(2);
  }
  return result + next;
}

const LEADING_PUNCTUATION_RE = /^[\p{P}\p{S}]/u;
const TRAILING_PUNCTUATION_RE = /[\p{P}\p{S}]$/u;

function wrap(content: string, open: string, close = open) {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(content)!;
  const inner = match[2];
  if (!inner) return content;
  const head = LEADING_PUNCTUATION_RE.test(inner) ? "\u200B" : "";
  const tail = TRAILING_PUNCTUATION_RE.test(inner) ? "\u200B" : "";
  return `${match[1]}${open}${head}${inner}${tail}${close}${match[3]}`;
}

function renderInline(node: HtmlNode, state: RenderState): string {
  if ("text" in node) {
    const decoded = decodeEntities(node.text)
      .replace(/[\r\n\t]+/g, " ")
      .replace(/ /g, " ");
    return escapeText(decoded, Boolean(state.options.plain));
  }
  const plain = Boolean(state.options.plain);
  const children = () => renderInlineChildren(node, state);
  const emphasize = (el: HtmlElement, kind: keyof RenderState["open"], mark: string) => {
    if (plain || state.open[kind] > 0) return renderInlineChildren(el, state);
    state.open[kind]++;
    const inner = renderInlineChildren(el, state);
    state.open[kind]--;
    return wrap(inner, mark);
  };
  switch (node.tag) {
    case "br":
      return plain ? "\n" : "  \n";
    case "b":
    case "strong":
      return emphasize(node, "bold", "**");
    case "i":
    case "em":
    case "cite":
    case "dfn":
      return emphasize(node, "italic", "*");
    case "s":
    case "del":
    case "strike":
      return emphasize(node, "strike", "~~");
    case "code":
    case "kbd":
    case "samp":
    case "tt": {
      const text = textOf(node.children).replace(/\s+/g, " ");
      if (!text.trim()) return "";
      if (plain) return text;
      let ticks = "`";
      while (text.includes(ticks)) ticks += "`";
      const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
      return `${ticks}${pad}${text.trim()}${pad}${ticks}`;
    }
    case "a": {
      const href = (node.attrs.href ?? "").trim();
      const label = children();
      if (!/^https?:\/\//i.test(href) || plain) return label;
      if (!label.trim()) return "";
      const safe = href.replace(/[()\s]/g, (ch) => encodeURIComponent(ch));
      return `[${label.replace(/\n+/g, " ")}](${safe})`;
    }
    case "img": {
      const src = node.attrs.src ?? "";
      if (plain) return "";
      if (!src) return "";
      const placeholder = imagePlaceholder(src, state);
      return placeholder ? `![](${placeholder})` : "";
    }
    case AUDIO_TAG:
      return audioMarkdown(decodeURIComponent(node.attrs["data-src"] ?? ""), state);
    case "audio": {
      const sourceTag = node.children.find(
        (child): child is HtmlElement => "tag" in child && child.tag === "source",
      );
      const src = node.attrs.src ?? sourceTag?.attrs.src ?? "";
      if (src) return audioMarkdown(src, state);
      state.options.warn("audio_removed");
      return "";
    }
    case "video":
      state.options.warn("video_removed");
      return "";
    case "sup":
    case "sub": {
      const kind = node.tag;
      if (plain || state.open[kind] > 0) return children();
      state.open[kind]++;
      const inner = trimInline(children());
      state.open[kind]--;
      if (!inner) return "";
      const mark = kind === "sup" ? "^" : "~";
      return `${mark}${inner.replace(/\s*\n\s*/g, " ").replace(/ /g, "\\ ")}${mark}`;
    }
    case "span":
    case "font":
    case "u":
    case "mark":
      return highlighted(node) ? emphasize(node, "mark", "==") : children();
    case "small":
    case "big":
    case "ins":
    case "label":
    case "abbr":
    case "q":
    case "bdi":
    case "bdo":
    case "ruby":
    case "rb":
      return children();
    case "rt":
    case "rp":
      return node.tag === "rt" && textOf(node.children).trim()
        ? `(${textOf(node.children).trim()})`
        : "";
    default:
      if (SKIPPED_TAGS.has(node.tag)) return "";
      if (BLOCK_TAGS.has(node.tag)) {
        const blocks = renderBlockElement(node, state);
        return blocks.length ? `  \n${blocks.join("\n\n")}  \n` : "";
      }
      return children();
  }
}

function tidy(markdown: string) {
  return markdown
    .split(/(```+[\s\S]*?```+)/)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part
            .replace(/([ \t]*)\n/g, (_, spaces: string) => (spaces.length >= 2 ? "  \n" : "\n"))
            .replace(/(?: {2}\n){2,}/g, "\n\n")
            .replace(/ {2}\n(?=\n)/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .replace(/(\S) {2,}(?=\S)/g, "$1 "),
    )
    .join("")
    .trim();
}

export function htmlToMarkdown(html: string, options: HtmlOptions): HtmlConversion {
  const state: RenderState = {
    options,
    media: new Set(),
    open: { bold: 0, italic: 0, strike: 0, sup: 0, sub: 0, mark: 0 },
  };
  let source = html;

  if (/<script\b|<style\b/i.test(source)) options.warn("scripts_removed");
  source = source.replace(
    SOUND_RE,
    (_, name: string) =>
      `<${AUDIO_TAG} data-src="${encodeURIComponent(decodeEntities(name))}"></${AUDIO_TAG}>`,
  );
  if (/\[latex\]/i.test(source)) options.warn("math_as_text");
  const math: string[] = [];
  let marker = "\uE000math";
  while (source.includes(marker)) marker += "x";
  source = splitMath(source)
    .map((part) => {
      if (part.kind === "text") return part.raw;
      const tex = decodeEntities(
        part.tex
          .replace(/<br\s*\/?\s*>/gi, "\n")
          .replace(/<\/?(?:span|div|b|i|em|strong|font)\b[^>]*>/gi, ""),
      );
      if (renderMath(tex, part.display).error) options.warn("math_unsupported");
      math.push(part.display ? `\\[${tex}\\]` : `\\(${tex}\\)`);
      return `${marker}${math.length - 1}\uE001`;
    })
    .join("");

  const tree = parseHtml(source);
  const markdown = tidy(renderBlocks(tree.children, state).join("\n\n")).replace(
    new RegExp(`${marker}(\\d+)\uE001`, "g"),
    (_, index: string) => math[Number(index)]!,
  );
  return { markdown, media: [...state.media] };
}
