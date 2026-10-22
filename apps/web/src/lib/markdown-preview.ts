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

/**
 * Markdown sources store HTML-looking text as entities (the editor writes
 * `&lt;script&gt;` for a literal `<script>`), so tiles must decode one level
 * before showing the text. React still renders the result as text.
 */
function decodeHtmlEntities(source: string) {
  return source.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]+));/gi,
    (match, decimal: string | undefined, hex: string | undefined, named: string | undefined) => {
      const code = decimal
        ? Number(decimal)
        : hex
          ? Number.parseInt(hex, 16)
          : undefined;
      if (code !== undefined) {
        return code >= 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      return NAMED_HTML_ENTITIES[(named ?? "").toLowerCase()] ?? match;
    },
  );
}

/** Fast plain-text excerpt for card grid previews (avoids react-markdown per tile). */
export function stripMarkdownForPreview(source: string): string {
  const text = source
    // The serializer escapes markdown syntax with a backslash; keep the
    // literal character so underscores and asterisks in the source survive.
    .replace(/\\([\\`*_[\]{}()#+\-.!>~])/g, "$1")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
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
    .replace(/\s+/g, " ")
    .trim();

  return decodeHtmlEntities(text);
}
