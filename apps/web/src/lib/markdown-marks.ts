import type { MarkdownExtension } from "@tanstack/markdown";

const WHITESPACE = /\s/;

function scriptEnd(source: string, start: number, marker: string) {
  for (let i = start; i < source.length; i++) {
    const ch = source[i]!;
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === marker) return i > start ? i : -1;
    if (WHITESPACE.test(ch)) return -1;
  }
  return -1;
}

function highlightEnd(source: string, start: number) {
  if (start >= source.length || WHITESPACE.test(source[start]!)) return -1;
  for (let i = start; i < source.length - 1; i++) {
    const ch = source[i]!;
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "\n" && source[i + 1] === "\n") return -1;
    if (ch === "=" && source[i + 1] === "=" && source[i + 2] !== "=") {
      return i > start && !WHITESPACE.test(source[i - 1]!) ? i : -1;
    }
  }
  return -1;
}

export const inlineMarks: MarkdownExtension = {
  name: "armin-inline-marks",
  inlineParser: {
    markers: "^~=",
    parse: ({ source, index, parseInline }) => {
      const ch = source[index];
      if (ch === "=") {
        if (source[index + 1] !== "=" || source[index - 1] === "=" || source[index + 2] === "=")
          return undefined;
        const end = highlightEnd(source, index + 2);
        if (end === -1) return undefined;
        return {
          node: {
            type: "inlineComponent",
            name: "mark",
            tagName: "mark",
            attributes: {},
            children: parseInline(source.slice(index + 2, end)),
          },
          length: end + 2 - index,
        };
      }
      if (ch !== "^" && ch !== "~") return undefined;
      if (ch === "~" && (source[index + 1] === "~" || source[index - 1] === "~")) return undefined;
      const end = scriptEnd(source, index + 1, ch);
      if (end === -1 || (ch === "~" && source[end + 1] === "~")) return undefined;
      const inner = source.slice(index + 1, end).replace(/\\ /g, " ");
      const tag = ch === "^" ? "sup" : "sub";
      return {
        node: {
          type: "inlineComponent",
          name: tag,
          tagName: tag,
          attributes: {},
          children: parseInline(inner),
        },
        length: end + 1 - index,
      };
    },
  },
};

export function hasInlineMarks(markdown: string) {
  const prose = markdown
    .replace(/(`{3,}|~{3,})[^\n]*\n[\s\S]*?\1/g, "")
    .replace(/`+[^`]*`+/g, "")
    .replace(/\\./g, "");
  return (
    /(?<![~\\])~(?!~)(?:[^\s~\\]|\\.)+~(?!~)/.test(prose) ||
    /\^(?:[^\s^\\]|\\.)+\^/.test(prose) ||
    /(?<!=)==(?!=)\S(?:[^\n]*?\S)?==(?!=)/.test(prose)
  );
}
