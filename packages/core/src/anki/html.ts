import { ANKI_MEDIA_PREFIX, type ImportWarningCode } from "./types";

/**
 * Anki field HTML → Markdown. Armin renders Markdown (react-markdown + GFM)
 * without raw HTML, so every supported tag maps to Markdown and the rest keeps
 * only its text. A small tolerant tokenizer stands in for a DOM so the code runs
 * in browsers, React Native, and Convex alike.
 */

const SUPPORTED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"]);
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

// --- Tokenizer and tree ---

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

/** Tags that implicitly close an open sibling of the same family. */
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
      // Raw-text elements: swallow everything up to the closing tag.
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

// --- Markdown rendering ---

export type HtmlConversion = {
  markdown: string;
  /** Anki media file names referenced by the kept images. */
  media: string[];
};

export type HtmlWarningSink = (code: ImportWarningCode) => void;

export type HtmlOptions = {
  mediaNames: ReadonlySet<string>;
  warn: HtmlWarningSink;
  /** Plain text for fields Armin shows without Markdown (occlusion header/extra). */
  plain?: boolean;
};

const MATH_RE =
  /\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\[latex\][\s\S]*?\[\/latex\]|\[\$\$?\][\s\S]*?\[\/\$\$?\]/g;
const SOUND_RE = /\[sound:[^\]]*\]/g;

/** Escape characters that would start Markdown syntax when they appear in plain text. */
function escapeMarkdown(text: string) {
  return text
    .replace(/[\\`*[\]<]/g, "\\$&")
    .replace(/_/g, (ch, offset: number) => {
      const word = (c: string | undefined) => c !== undefined && /[A-Za-z0-9]/.test(c);
      return word(text[offset - 1]) && word(text[offset + 1]) ? ch : "\\_";
    })
    .replace(/~~/g, "\\~\\~")
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
  /** Open emphasis wrappers, so nested duplicates don't produce `****`. */
  open: { bold: number; italic: number; strike: number };
};

function textOf(nodes: HtmlNode[]): string {
  return nodes
    .map((node) => ("text" in node ? decodeEntities(node.text) : textOf(node.children)))
    .join("");
}

function imageExtension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function encodeMediaName(name: string) {
  return encodeURIComponent(name).replace(/[()]/g, (ch) => (ch === "(" ? "%28" : "%29"));
}

export type ImageCheck =
  | { ok: true; name: string; placeholder: string }
  | { ok: false; reason: "missing_media" | "unsupported_image_removed" };

/** Check an `<img src>` against the package media and Armin's supported formats. */
export function inspectImage(rawSrc: string, mediaNames: ReadonlySet<string>): ImageCheck {
  let name = rawSrc.trim();
  // Remote images aren't part of the package, so they count as missing.
  if (/^(?:https?:|data:|\/\/)/i.test(name)) return { ok: false, reason: "missing_media" };
  try {
    name = decodeURIComponent(name);
  } catch {
    // Keep the raw name when it isn't valid percent-encoding.
  }
  if (!SUPPORTED_IMAGE_EXTENSIONS.has(imageExtension(name))) {
    return { ok: false, reason: "unsupported_image_removed" };
  }
  if (!mediaNames.has(name)) return { ok: false, reason: "missing_media" };
  return { ok: true, name, placeholder: `${ANKI_MEDIA_PREFIX}${encodeMediaName(name)}` };
}

/** Resolve an `<img src>` to a placeholder reference, or null when it can't be kept. */
function imagePlaceholder(rawSrc: string, state: RenderState) {
  const image = inspectImage(rawSrc, state.options.mediaNames);
  if (!image.ok) {
    state.options.warn(image.reason);
    return null;
  }
  state.media.add(image.name);
  return image.placeholder;
}

/**
 * Render children as a sequence of blocks. Consecutive inline content forms one
 * paragraph; block elements each become their own block.
 */
function renderBlocks(nodes: HtmlNode[], state: RenderState): string[] {
  const blocks: string[] = [];
  let inline = "";
  const flush = () => {
    const trimmed = trimInline(inline.replace(/( {2}\n)[ \t]+/g, "$1"));
    if (trimmed) blocks.push(trimmed);
    inline = "";
  };
  for (const node of nodes) {
    if ("text" in node || !BLOCK_TAGS.has(node.tag)) {
      inline += renderInline(node, state);
      continue;
    }
    flush();
    blocks.push(...renderBlockElement(node, state));
  }
  flush();
  return blocks;
}

function trimInline(text: string) {
  // Keep intentional hard breaks inside, strip them at the edges.
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
    // Irregular tables degrade to one line per row.
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
  return el.children.map((child) => renderInline(child, state)).join("");
}

/** Wrap inline content in a Markdown delimiter, keeping edge whitespace outside it. */
function wrap(content: string, open: string, close = open) {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(content)!;
  if (!match[2]) return content;
  return `${match[1]}${open}${match[2]}${close}${match[3]}`;
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
    case "audio":
      state.options.warn("audio_removed");
      return "";
    case "video":
      state.options.warn("video_removed");
      return "";
    case "sup":
    case "sub":
    case "span":
    case "font":
    case "u":
    case "mark":
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
      // Ruby annotations: keep the reading in brackets so it isn't glued to the base text.
      return node.tag === "rt" && textOf(node.children).trim()
        ? `(${textOf(node.children).trim()})`
        : "";
    default:
      if (SKIPPED_TAGS.has(node.tag)) return "";
      if (BLOCK_TAGS.has(node.tag)) {
        // A block nested inside inline content: set it off with a line break.
        const blocks = renderBlockElement(node, state);
        return blocks.length ? `  \n${blocks.join("\n\n")}  \n` : "";
      }
      return children();
  }
}

/** Collapse whitespace artifacts without disturbing code fences. */
function tidy(markdown: string) {
  return markdown
    .split(/(```+[\s\S]*?```+)/)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part
            // Two trailing spaces are a hard break; anything else is stray.
            .replace(/([ \t]*)\n/g, (_, spaces: string) => (spaces.length >= 2 ? "  \n" : "\n"))
            .replace(/(?: {2}\n){2,}/g, "\n\n")
            .replace(/ {2}\n(?=\n)/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            // Runs of spaces left where something was removed.
            .replace(/(\S) {2,}(?=\S)/g, "$1 "),
    )
    .join("")
    .trim();
}

export function htmlToMarkdown(html: string, options: HtmlOptions): HtmlConversion {
  const state: RenderState = {
    options,
    media: new Set(),
    open: { bold: 0, italic: 0, strike: 0 },
  };
  let source = html;

  if (/<script\b|<style\b/i.test(source)) options.warn("scripts_removed");
  if (source.search(SOUND_RE) !== -1) options.warn("audio_removed");
  source = source.replace(SOUND_RE, "");
  if (source.search(MATH_RE) !== -1) options.warn("math_as_text");

  const tree = parseHtml(source);
  const markdown = tidy(renderBlocks(tree.children, state).join("\n\n"));
  return { markdown, media: [...state.media] };
}
