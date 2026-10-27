/** Source-only math parsing shared by import, editors, and both clients. */
export type MathPart =
  | { kind: "text"; raw: string }
  | { kind: "math"; raw: string; tex: string; display: boolean };

const DELIMITERS = [
  ["\\(", "\\)", false],
  ["\\[", "\\]", true],
  ["$$", "$$", true],
  ["$", "$", false],
  ["[$$]", "[/$$]", true],
  ["[$]", "[/$]", false],
] as const;

function escaped(source: string, index: number) {
  let slashes = 0;
  while (index > 0 && source[--index] === "\\") slashes++;
  return slashes % 2 === 1;
}

/** Read one delimited expression without consuming ordinary currency. */
export function mathAt(source: string, index: number) {
  if (escaped(source, index)) return null;
  for (const [open, close, display] of DELIMITERS) {
    if (!source.startsWith(open, index)) continue;
    const start = index + open.length;
    if (open === "$" && (source[start] === "$" || /\s/.test(source[start] ?? ""))) continue;
    let end = source.indexOf(close, start);
    while (end !== -1 && escaped(source, end)) end = source.indexOf(close, end + close.length);
    if (end === -1) return null;
    const tex = source.slice(start, end);
    if (!tex.trim()) return null;
    if (open === "$" && (/\s$/.test(tex) || /[\r\n]/.test(tex) || /\d/.test(source[end + 1] ?? "")))
      return null;
    return { kind: "math" as const, raw: source.slice(index, end + close.length), tex, display };
  }
  return null;
}

/** Keep fenced/inline code literal. Unclosed math also stays literal. */
export function splitMath(source: string): MathPart[] {
  const parts: MathPart[] = [];
  let start = 0;
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if ((char === "`" || char === "~") && !escaped(source, index)) {
      let end = index;
      while (source[end] === char) end++;
      const marker = source.slice(index, end);
      if (char === "`" || marker.length >= 3) {
        const close = source.indexOf(marker, end);
        index = close === -1 ? source.length : close + marker.length;
        continue;
      }
    }
    const math = (char === "\\" || char === "$" || char === "[") && mathAt(source, index);
    if (!math) {
      index++;
      continue;
    }
    if (index > start) parts.push({ kind: "text", raw: source.slice(start, index) });
    parts.push(math);
    index += math.raw.length;
    start = index;
  }
  if (start < source.length) parts.push({ kind: "text", raw: source.slice(start) });
  return parts;
}

export function hasMath(source: string) {
  return splitMath(source).some((part) => part.kind === "math");
}
