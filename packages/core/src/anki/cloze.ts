import { clozeClusters } from "../flashcard-rules";

type Item = string | ClozeNode;
type ClozeNode = { num: number; items: Item[] };

const OPEN_RE = /\{\{c(\d+(?:,\d+)*)::/y;

function parse(source: string, state: { shared: boolean }) {
  const root: ClozeNode = { num: 0, items: [] };
  const stack: ClozeNode[] = [root];
  const braces = [0];
  let text = "";
  const flush = () => {
    if (text) stack[stack.length - 1].items.push(text);
    text = "";
  };
  for (let i = 0; i < source.length;) {
    OPEN_RE.lastIndex = i;
    const open = OPEN_RE.exec(source);
    if (open) {
      flush();
      const nums = open[1].split(",").map(Number);
      if (nums.length > 1) state.shared = true;
      const node: ClozeNode = { num: Math.min(...nums), items: [] };
      stack[stack.length - 1].items.push(node);
      stack.push(node);
      braces.push(0);
      i += open[0].length;
      continue;
    }
    if (source.startsWith("}}", i) && stack.length > 1 && braces.at(-1) === 0) {
      flush();
      stack.pop();
      braces.pop();
      i += 2;
      continue;
    }
    if (source[i] === "\\" && i + 1 < source.length) {
      text += source.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (stack.length > 1) {
      if (source[i] === "{") braces[braces.length - 1]++;
      else if (source[i] === "}" && braces.at(-1)! > 0) braces[braces.length - 1]--;
    }
    text += source[i++];
  }
  flush();
  return root;
}

type Piece = { num: number | null; text: string };

function flatten(node: ClozeNode, pieces: Piece[], state: { nested: boolean }) {
  let buffer = "";
  const flush = () => {
    if (buffer) pieces.push({ num: node.num || null, text: buffer });
    buffer = "";
  };
  const walk = (items: Item[]) => {
    for (const item of items) {
      if (typeof item === "string") {
        buffer += item;
      } else if (item.num === node.num) {
        state.nested = true;
        walk(item.items);
      } else {
        if (node.num !== 0) state.nested = true;
        flush();
        flatten(item, pieces, state);
      }
    }
  };
  walk(node.items);
  flush();
}

function split(body: string) {
  const sep = body.indexOf("::");
  return sep === -1
    ? { answer: body, hint: "" }
    : { answer: body.slice(0, sep), hint: body.slice(sep + 2) };
}

export type ClozeConversion = { text: string; nested: boolean; shared: boolean };

export function convertAnkiCloze(source: string): ClozeConversion {
  const state = { nested: false, shared: false };
  const root = parse(source, state);
  const pieces: Piece[] = [];
  flatten(root, pieces, state);

  const text = pieces
    .map((piece) => {
      if (piece.num === null) return piece.text;
      const { answer, hint } = split(piece.text);
      if (!answer.trim()) return answer;
      return hint ? `{{${piece.num}::${answer}::${hint}}}` : `{{${piece.num}::${answer}}}`;
    })
    .join("");
  return { text, nested: state.nested, shared: state.shared };
}

export function dropEmptyClozes(text: string) {
  return text.replace(/\{\{\d+::\s*(?:::[\s\S]*?)?\}\}/g, "");
}

const CLOZE_RE = /\{\{(\d+)::([\s\S]+?)\}\}/g;

export function limitClozeClusters(text: string, max: number) {
  const clusters = clozeClusters(text);
  if (clusters.length <= max) return { text, trimmed: false };
  const keep = new Set(clusters.slice(0, max));
  const trimmed = text.replace(CLOZE_RE, (whole, num: string, body: string) =>
    keep.has(Number(num)) ? whole : body.split("::")[0],
  );
  return { text: trimmed, trimmed: true };
}
