import { AUDIO_MIME_BY_EXT } from "@armin/core/media";

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

function decodeHtmlEntities(source: string) {
  return source.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]+));/gi,
    (match, decimal: string | undefined, hex: string | undefined, named: string | undefined) => {
      const code = decimal ? Number(decimal) : hex ? Number.parseInt(hex, 16) : undefined;
      if (code !== undefined) {
        return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      }
      return NAMED_HTML_ENTITIES[(named ?? "").toLowerCase()] ?? match;
    },
  );
}

const AUDIO_MARKDOWN_RE = new RegExp(
  `!\\[[^\\]]*\\]\\([^)]*\\.(?:${Object.keys(AUDIO_MIME_BY_EXT).join("|")})\\)`,
  "g",
);

export function stripMarkdownForPreview(source: string): string {
  const text = source
    .replace(/\\([\\`*_[\]{}()#+\-.!>~^=])/g, "$1")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(AUDIO_MARKDOWN_RE, "[Audio]")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[Image]")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/==(\S(?:.*?\S)?)==/g, "$1")
    .replace(/\^(\S+?)\^/g, "$1")
    .replace(/~(\S+?)~/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return decodeHtmlEntities(text);
}
