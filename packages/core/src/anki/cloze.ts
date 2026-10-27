import { clozeClusters } from "../flashcard-rules";

/**
 * Anki cloze syntax → Armin cloze syntax.
 *
 * Anki writes `{{c1::answer}}` / `{{c1::answer::hint}}` and allows nesting;
 * Armin writes `{{1::answer}}` / `{{1::answer::hint}}` and cannot nest. Armin
 * does let several deletions share one cluster number, so a nested deletion is
 * flattened by splitting the outer one around it:
 *
 *   {{c1::a {{c2::b}} c}}  →  {{1::a }}{{2::b}}{{1:: c}}
 *
 * Both clusters keep a review unit; the one difference from Anki is that card 1
 * shows the inner answer instead of hiding it too.
 */

type Item = string | ClozeNode;
type ClozeNode = { num: number; items: Item[] };

// Anki also lets one deletion serve several cards: `{{c1,2::answer}}`.
const OPEN_RE = /\{\{c(\d+(?:,\d+)*)::/y;

/** Parse the Anki markers into a tree; unmatched openers stay literal text. */
function parse(source: string, state: { shared: boolean }) {
  const root: ClozeNode = { num: 0, items: [] };
  const stack: ClozeNode[] = [root];
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
      // Armin deletions belong to one cluster, so a shared one keeps the lowest.
      const nums = open[1].split(",").map(Number);
      if (nums.length > 1) state.shared = true;
      const node: ClozeNode = { num: Math.min(...nums), items: [] };
      stack[stack.length - 1].items.push(node);
      stack.push(node);
      i += open[0].length;
      continue;
    }
    if (source.startsWith("}}", i) && stack.length > 1) {
      flush();
      stack.pop();
      i += 2;
      continue;
    }
    text += source[i++];
  }
  flush();
  // Unclosed clozes: treat what was collected as ordinary content of the cloze.
  return root;
}

type Piece = { num: number | null; text: string };

/** Flatten the tree into plain pieces and (possibly repeated) numbered deletions. */
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
        // Same cluster: the inner text is just more of this deletion.
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

/** Split `answer::hint` on the first separator, as both Anki and Armin do. */
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

  // A hint rides on the piece that carried the `::`; later pieces of the same
  // deletion have none.
  const text = pieces
    .map((piece) => {
      if (piece.num === null) return piece.text;
      const { answer, hint } = split(piece.text);
      // Whitespace-only pieces left over from splitting stay plain text.
      if (!answer.trim()) return answer;
      return hint ? `{{${piece.num}::${answer}::${hint}}}` : `{{${piece.num}::${answer}}}`;
    })
    .join("");
  return { text, nested: state.nested, shared: state.shared };
}

/** Deletions with no answer left after HTML conversion can't be studied: drop them. */
export function dropEmptyClozes(text: string) {
  return text.replace(/\{\{\d+::\s*(?:::[\s\S]*?)?\}\}/g, "");
}

const CLOZE_RE = /\{\{(\d+)::([\s\S]+?)\}\}/g;

/**
 * Keep only the `max` lowest cluster numbers; the other deletions become plain
 * text. Returns the (possibly unchanged) text and whether anything was cut.
 */
export function limitClozeClusters(text: string, max: number) {
  const clusters = clozeClusters(text);
  if (clusters.length <= max) return { text, trimmed: false };
  const keep = new Set(clusters.slice(0, max));
  const trimmed = text.replace(CLOZE_RE, (whole, num: string, body: string) =>
    keep.has(Number(num)) ? whole : body.split("::")[0],
  );
  return { text: trimmed, trimmed: true };
}
