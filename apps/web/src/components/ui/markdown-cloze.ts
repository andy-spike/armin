import type { Ctx, MilkdownPlugin } from "@milkdown/kit/ctx";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import type { Mark, MarkType } from "@milkdown/kit/prose/model";
import { TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $inputRule, $markSchema, $remark } from "@milkdown/kit/utils";
import { parseClozes } from "@armin/core/flashcard-rules";

/*
 * Cloze deletions as an inline mark, so the card editor shows them as chips
 * instead of `{{1::answer}}` syntax. The stored text is unchanged: Markdown
 * `{{N::answer::hint}}` loads into a `cloze` mark and saves back to exactly that
 * form. Clozes whose answer or hint carries Markdown or math are left to the
 * source editor (see `clozeNeedsSource`), since a chip couldn't round-trip them.
 */

/** One `{{…}}` wrapper with plain-text parts: `{{answer}}`, `{{N::answer}}`, `{{N::answer::hint}}`. */
const CLOZE_SOURCE = /\{\{(?:(\d+)::)?([^{}]*?)(?:::([^{}]*?))?\}\}/g;
const MARKDOWN_SYNTAX = /[*_`~[\]<>\\$|]/;

type ClozeAttrs = { cluster: number | null; hint: string | null };

/** True when some cloze can't be shown as a chip without changing its text. */
export function clozeNeedsSource(value: string) {
  const plain = [...value.matchAll(CLOZE_SOURCE)];
  if (plain.length !== parseClozes(value).length) return true;
  return plain.some(
    ([, , answer, hint]) =>
      answer.trim().length === 0 ||
      answer !== answer.trim() ||
      answer.includes("::") ||
      MARKDOWN_SYNTAX.test(answer) ||
      (hint !== undefined && (hint.length === 0 || MARKDOWN_SYNTAX.test(hint))),
  );
}

type MdNode = { type: string; value?: string; children?: MdNode[]; [key: string]: unknown };

/** Splits plain-text `{{…}}` runs inside text nodes into `cloze` nodes. */
function splitClozes(node: MdNode) {
  if (!node.children) return;
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type !== "text" || !child.value?.includes("{{")) {
      splitClozes(child);
      next.push(child);
      continue;
    }
    const text = child.value;
    let last = 0;
    for (const match of text.matchAll(CLOZE_SOURCE)) {
      const [whole, cluster, answer, hint] = match;
      if (!answer) continue;
      const start = match.index;
      if (start > last) next.push({ type: "text", value: text.slice(last, start) });
      next.push({
        type: "cloze",
        cluster: cluster ? Number(cluster) : null,
        hint: hint ?? null,
        children: [{ type: "text", value: answer }],
      });
      last = start + whole.length;
    }
    if (last < text.length) next.push({ type: "text", value: text.slice(last) });
  }
  node.children = next;
}

const remarkCloze = $remark("remarkCloze", () => () => (tree: unknown) => {
  splitClozes(tree as MdNode);
});

/**
 * Writes a `cloze` node back as `{{N::answer::hint}}`. Registered on
 * remark-stringify's handlers by the editor, next to its other overrides.
 */
export function clozeStringifyHandler(
  node: MdNode,
  _parent: unknown,
  state: {
    containerPhrasing: (node: MdNode, info: Record<string, unknown>) => string;
  },
  info: Record<string, unknown>,
) {
  const answer = state.containerPhrasing(node, { ...info, before: ":", after: "}" });
  const cluster = typeof node.cluster === "number" ? `${node.cluster}::` : "";
  const hint = typeof node.hint === "string" && node.hint ? `::${node.hint}` : "";
  return `{{${cluster}${answer}${hint}}}`;
}

export const clozeSchema = $markSchema("cloze", () => ({
  attrs: {
    cluster: { default: null },
    hint: { default: null },
  },
  // Typing at a chip's edge stays outside it.
  inclusive: false,
  excludes: "cloze",
  parseDOM: [
    {
      tag: "span[data-cloze]",
      getAttrs: (dom) => ({
        cluster: Number((dom as HTMLElement).dataset.cluster) || null,
        hint: (dom as HTMLElement).dataset.hint || null,
      }),
    },
  ],
  // The answer sits in an inner span so its card number can follow it as a
  // superscript, footnote-style, with the hint after that.
  toDOM: (mark) => {
    const cluster = mark.attrs.cluster == null ? "?" : String(mark.attrs.cluster);
    return [
      "span",
      {
        "data-cloze": "",
        class: "cloze-chip",
        "data-cluster": cluster,
        ...(mark.attrs.hint ? { "data-hint": mark.attrs.hint } : {}),
      },
      ["span", { class: "cloze-answer", "data-cluster": cluster }, 0],
    ];
  },
  parseMarkdown: {
    match: (node) => node.type === "cloze",
    runner: (state, node, markType) => {
      state.openMark(markType, { cluster: node.cluster, hint: node.hint });
      state.next(node.children as never);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === "cloze",
    runner: (state, mark) => {
      state.withMark(mark, "cloze", undefined, {
        cluster: mark.attrs.cluster,
        hint: mark.attrs.hint,
      });
    },
  },
}));

function clozeType(state: EditorState): MarkType | undefined {
  return state.schema.marks.cloze;
}

/** One above the highest cloze number in the document. */
export function nextClozeCluster(state: EditorState) {
  const type = clozeType(state);
  let max = 0;
  state.doc.descendants((node) => {
    const mark = type?.isInSet(node.marks);
    if (mark && typeof mark.attrs.cluster === "number") max = Math.max(max, mark.attrs.cluster);
  });
  return max + 1;
}

export type ClozeRange = { from: number; to: number; mark: Mark };

/** The whole chip around `pos`, or null when `pos` isn't in one. */
export function clozeRangeAt(state: EditorState, pos: number): ClozeRange | null {
  const type = clozeType(state);
  if (!type) return null;
  const $pos = state.doc.resolve(pos);
  const parent = $pos.parent;
  const offset = $pos.parentOffset;
  let found: ClozeRange | null = null;
  parent.forEach((child, childOffset) => {
    if (found) return;
    const end = childOffset + child.nodeSize;
    const mark = type.isInSet(child.marks);
    if (mark && childOffset <= offset && offset <= end) {
      found = { from: $pos.start() + childOffset, to: $pos.start() + end, mark };
    }
  });
  if (!found) return null;
  // Extend across neighbours carrying the same mark (bold text inside a chip
  // splits it into several text nodes).
  const range: ClozeRange = found;
  const sameMark = (node: { marks: readonly Mark[] } | null | undefined) =>
    Boolean(node && range.mark.isInSet(node.marks));
  let from = range.from;
  let to = range.to;
  while (from > $pos.start() && sameMark(state.doc.resolve(from).nodeBefore)) {
    from -= state.doc.resolve(from).nodeBefore!.nodeSize;
  }
  while (to < $pos.end() && sameMark(state.doc.resolve(to).nodeAfter)) {
    to += state.doc.resolve(to).nodeAfter!.nodeSize;
  }
  return { from, to, mark: range.mark };
}

/** Rewrites one chip's number or hint. */
export function updateCloze(view: EditorView, range: ClozeRange, attrs: Partial<ClozeAttrs>) {
  const type = clozeType(view.state);
  if (!type) return;
  const mark = type.create({ ...range.mark.attrs, ...attrs });
  view.dispatch(
    view.state.tr.removeMark(range.from, range.to, type).addMark(range.from, range.to, mark),
  );
}

/** Turns a chip back into plain text. */
export function removeCloze(view: EditorView, range: ClozeRange) {
  const type = clozeType(view.state);
  if (!type) return;
  view.dispatch(view.state.tr.removeMark(range.from, range.to, type));
}

/**
 * Typing into a chip keeps the chip. Chips don't extend at their edges, so
 * without this, typing over a chip's whole text (like the "answer"
 * placeholder) would leave plain text. After a keystroke lands in a chip, the
 * chip's marks stay stored so the next keystroke continues the answer; moving
 * the cursor clears them, and typing at a chip's edge then stays outside it.
 */
export function typeIntoCloze(view: EditorView, from: number, to: number, text: string) {
  const { state } = view;
  const type = clozeType(state);
  if (!type) return false;
  let marks: readonly Mark[] | null = null;
  if (from === to) {
    if (state.storedMarks && type.isInSet(state.storedMarks)) marks = state.storedMarks;
  } else {
    const range = clozeRangeAt(state, from);
    if (range && from >= range.from && to <= range.to) {
      marks = state.doc.nodeAt(from)?.marks ?? [range.mark];
    }
  }
  if (!marks) return false;
  const tr = state.tr.replaceWith(from, to, state.schema.text(text, marks));
  tr.setSelection(TextSelection.create(tr.doc, from + text.length)).setStoredMarks(marks);
  view.dispatch(tr);
  return true;
}

const ANSWER_PLACEHOLDER = "answer";

/**
 * Make cloze: wraps the selection in a chip with the next number, inserts a
 * selected "answer" chip at an empty cursor, or unwraps the chip the cursor is
 * in.
 */
export function toggleCloze(view: EditorView) {
  const { state } = view;
  const type = clozeType(state);
  if (!type) return false;
  const { from, to, empty } = state.selection;
  const existing = clozeRangeAt(state, from);
  if (existing && (empty || (from >= existing.from && to <= existing.to))) {
    removeCloze(view, existing);
    return true;
  }
  const mark = type.create({ cluster: nextClozeCluster(state), hint: null });
  let tr: Transaction;
  if (empty) {
    tr = state.tr.insert(from, state.schema.text(ANSWER_PLACEHOLDER, [mark]));
    tr = tr.setSelection(TextSelection.create(tr.doc, from, from + ANSWER_PLACEHOLDER.length));
  } else {
    tr = state.tr.removeMark(from, to, type).addMark(from, to, mark);
  }
  view.dispatch(tr.removeStoredMark(type));
  view.focus();
  return true;
}

/** Typing a whole `{{…}}` turns it into a chip as soon as the `}}` closes it. */
const clozeInputRule = $inputRule(
  (ctx: Ctx) =>
    new InputRule(/\{\{(?:(\d+)::)?([^{}:]+?)(?:::([^{}]+?))?\}\}$/, (state, match, start, end) => {
      void ctx;
      const type = clozeType(state);
      const [, cluster, answer, hint] = match;
      if (!type || !answer.trim()) return null;
      const mark = type.create({
        cluster: cluster ? Number(cluster) : nextClozeCluster(state),
        hint: hint ?? null,
      });
      return state.tr
        .replaceWith(start, end, state.schema.text(answer, [mark]))
        .removeStoredMark(type);
    }),
);

export const clozePlugins: MilkdownPlugin[] = [remarkCloze, clozeSchema, clozeInputRule].flat();
