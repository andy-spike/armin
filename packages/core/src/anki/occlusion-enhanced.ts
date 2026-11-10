import type { FlashcardContent } from "../flashcard-types";
import { decodeEntities, decodeMediaName, inspectImage } from "./html";
import { maskFromBoxes, type OcclusionBox } from "./occlusion";
import {
  canvasMatrix,
  parseSvg,
  shapeOf,
  withTransform,
  type Matrix,
  type SvgNode,
} from "./svg-shapes";
import { escapeHtml } from "./template";
import type { AnkiNote, ImportOmittedReason, ImportWarningCode } from "./types";

/**
 * Image Occlusion Enhanced, the add-on Anki used before its built-in image
 * occlusion (glutanimate/image-occlusion-enhanced, `ngen.py`), makes one note
 * per mask. Every note of one occlusion shares the image and an ID prefix:
 *
 *   ID (hidden)     <uniq_id>-<occl_tp>-<note_nr>, e.g. 3f2a…9c-ao-2
 *   Image           <img src="heart.png" />
 *   Question Mask   <img src="3f2a…9c-ao-2-Q.svg" />
 *   Answer Mask     <img src="3f2a…9c-ao-2-A.svg" />
 *   Original Mask   <img src="3f2a…9c-ao-O.svg" />
 *
 * `occl_tp` is `ao` ("Hide All, Guess One") or `oa` ("Hide One, Guess One").
 * The mask files are SVGs as wide and tall as the image; their last top-level
 * group is the "Masks" layer, whose children are the shapes, each with the
 * note ID of the card that tests it. A `<g>` there is one mask made of several
 * shapes. The question mask fills the tested shape with the "qfill" color
 * (default #FF7E7E) and gives it the `qshape` class.
 *
 * Armin turns each occlusion into one image occlusion card, a mask per note.
 */

const ID_RE = /^([A-Za-z0-9]+)-(ao|oa)-(\d+)$/;
const IMG_SRC_RE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const MASK_NAME_RE = /-[QAO]\.svg$/i;
const DEFAULT_QFILL = "#ff7e7e";

export type IoeId = { uniq: string; mode: "ao" | "oa"; nr: number; id: string };

/** The note's IOE ID, or null when the field doesn't hold one. */
export function parseIoeId(field: string): IoeId | null {
  const id = decodeEntities(field.replace(/<[^>]*>/g, "")).trim();
  const match = ID_RE.exec(id);
  return match ? { uniq: match[1], mode: match[2] as "ao" | "oa", nr: Number(match[3]), id } : null;
}

/** The file an `<img>` field points at. */
export function imageFileName(field: string) {
  const match = IMG_SRC_RE.exec(field);
  if (!match) return null;
  return decodeMediaName(decodeEntities(match[1] ?? match[2] ?? match[3] ?? "").trim()) || null;
}

/** Is this field an IOE mask reference (`<img src="…-Q.svg">`)? */
export function isMaskField(field: string, side: "Q" | "A" | "O" | null = null) {
  if (!/\.svg/i.test(field)) return false;
  const name = imageFileName(field);
  if (!name || !MASK_NAME_RE.test(name)) return false;
  return side === null || name.slice(-5, -4).toUpperCase() === side;
}

/**
 * Mask files the notes refer to. The reader passes their text to the converter
 * as `AnkiCollection.occlusionMasks`, since the converter never reads media.
 */
export function occlusionMaskNames(notes: readonly AnkiNote[]) {
  const names = new Set<string>();
  for (const note of notes) {
    for (const field of note.fields) {
      const name = isMaskField(field) ? imageFileName(field) : null;
      // Answer masks (`-A.svg`) are never read: the original and question masks suffice.
      if (name && !/-a\.svg$/i.test(name)) names.add(name);
    }
  }
  return [...names];
}

// --- Mask files ---

type MaskDoc = { shapes: SvgNode[]; matrix: Matrix; labels: boolean };

const isElement = (node: SvgNode) => node.name !== "title" && node.name !== "desc";

/** A mask file's "Masks" layer (its last top-level group) and how to place its shapes. */
function readMaskDoc(text: string | undefined): MaskDoc | null {
  if (!text) return null;
  const svg = parseSvg(text);
  const canvas = svg && canvasMatrix(svg);
  if (!svg || !canvas) return null;
  const layers = svg.children.filter((node) => node.name === "g");
  const layer = svg.children.filter((node) => node.name !== "defs").at(-1);
  if (!layer || layer.name !== "g") return null;
  return {
    shapes: layer.children.filter(isElement),
    matrix: withTransform(canvas, layer),
    // Anything drawn on another layer ("Labels") is shown on every card.
    labels: layers.some((other) => other !== layer && other.children.some(isElement)),
  };
}

function hasAttr(node: SvgNode, test: (node: SvgNode) => boolean): boolean {
  return test(node) || node.children.some((child) => hasAttr(child, test));
}

const fillOf = (node: SvgNode) =>
  (node.attrs.fill ?? /(?:^|;)\s*fill\s*:\s*([^;]+)/i.exec(node.attrs.style ?? "")?.[1] ?? "")
    .trim()
    .toLowerCase();

/** The shape a note tests: by its ID in the original mask, else marked in its question mask. */
/** `questionDoc` is parsed only when the original mask can't name the shape. */
function testedShape(
  id: IoeId | null,
  original: MaskDoc | null,
  questionDoc: () => MaskDoc | null,
) {
  const byId = id && original?.shapes.find((node) => node.attrs.id === id.id);
  if (byId) return { node: byId, doc: original! };
  const question = questionDoc();
  if (question) {
    const marked =
      question.shapes.find((node) =>
        hasAttr(node, (n) => /\bqshape\b/.test(n.attrs.class ?? "")),
      ) ?? question.shapes.find((node) => hasAttr(node, (n) => fillOf(n) === DEFAULT_QFILL));
    if (marked) return { node: marked, doc: question };
    // "Hide one" question masks hold only the tested shape.
    if (id?.mode === "oa" && question.shapes.length === 1) {
      return { node: question.shapes[0], doc: question };
    }
  }
  const byOrder = id && original?.shapes[id.nr - 1];
  return byOrder ? { node: byOrder, doc: original! } : null;
}

// --- Notetype ---

export type IoeFields = {
  id: number;
  image: number;
  header: number | null;
  question: number | null;
  answer: number | null;
  original: number | null;
  /** Footer, Remarks, Sources, Extra 1, Extra 2, and any field the user added. */
  extras: number[];
};

/**
 * The IOE field layout of a notetype, found by the add-on's default field
 * names and otherwise by content, since users can rename fields. Null when the
 * notes aren't IOE notes.
 */
export function ioeFields(names: readonly string[], notes: readonly AnkiNote[]): IoeFields | null {
  const sample = notes.slice(0, 200);
  const named = (pattern: RegExp) => {
    const index = names.findIndex((name) => pattern.test(name.trim()));
    return index === -1 ? null : index;
  };
  const holding = (test: (field: string) => boolean) => {
    const index = names.findIndex((_, i) => sample.some((note) => test(note.fields[i] ?? "")));
    return index === -1 ? null : index;
  };
  const id = holding((field) => parseIoeId(field) !== null);
  const question = named(/^question mask$/i) ?? holding((field) => isMaskField(field, "Q"));
  const answer = named(/^answer mask$/i) ?? holding((field) => isMaskField(field, "A"));
  const original = named(/^original mask$/i) ?? holding((field) => isMaskField(field, "O"));
  if (id === null || (question === null && original === null)) return null;
  const taken = new Set([id, question, answer, original]);
  const image =
    named(/^image$/i) ??
    holding((field) => /<img\b/i.test(field) && !isMaskField(field)) ??
    names.findIndex((_, i) => !taken.has(i));
  if (image === -1 || taken.has(image)) return null;
  taken.add(image);
  const header = named(/^header$/i);
  if (header !== null && !taken.has(header)) taken.add(header);
  return {
    id,
    image,
    header: header !== null && header !== image ? header : null,
    question,
    answer,
    original,
    extras: names.map((_, i) => i).filter((i) => !taken.has(i)),
  };
}

// --- One occlusion ---

export type IoeContext = {
  fieldNames: string[];
  mediaNames: ReadonlySet<string>;
  svg: boolean;
  masks: Readonly<Record<string, string>>;
  md: (html: string) => string;
};

export type IoeGroupResult =
  | {
      ok: true;
      content: { type: "image_occlusion"; content: FlashcardContent };
      /** Per note, in mask order. */
      approximated: boolean[];
      warnings: ImportWarningCode[];
    }
  | { ok: false; reason: ImportOmittedReason; warnings: ImportWarningCode[] };

/** IOE notes of one occlusion, ordered as their masks. */
export function sortIoeNotes(notes: AnkiNote[], fields: IoeFields) {
  const nr = (note: AnkiNote) => parseIoeId(note.fields[fields.id] ?? "")?.nr ?? Infinity;
  return [...notes].sort((a, b) => nr(a) - nr(b) || a.id.localeCompare(b.id));
}

/** The occlusion a note belongs to: its ID prefix, else its original mask file. */
export function ioeGroupKey(note: AnkiNote, fields: IoeFields) {
  const id = parseIoeId(note.fields[fields.id] ?? "");
  if (id) return `id:${id.uniq}`;
  const original =
    fields.original === null ? null : imageFileName(note.fields[fields.original] ?? "");
  return original ? `mask:${original.replace(/-[a-z]{2}-O\.svg$/i, "")}` : `note:${note.id}`;
}

/** One Armin card for the notes of one occlusion, already in mask order. */
export function prepareIoeGroup(
  notes: AnkiNote[],
  fields: IoeFields,
  ctx: IoeContext,
): IoeGroupResult {
  const field = (note: AnkiNote, index: number | null) =>
    index === null ? "" : (note.fields[index] ?? "");
  const warnings: ImportWarningCode[] = [];

  const imageName = notes.map((note) => IMG_SRC_RE.exec(field(note, fields.image))).find(Boolean);
  if (!imageName) return { ok: false, reason: "missing_image", warnings: ["missing_media"] };
  const image = inspectImage(
    decodeEntities(imageName[1] ?? imageName[2] ?? imageName[3] ?? ""),
    ctx.mediaNames,
    ctx.svg,
  );
  if (!image.ok) {
    return {
      ok: false,
      reason: image.reason === "missing_media" ? "missing_image" : "unsupported_image",
      warnings: [image.reason],
    };
  }

  const docs = new Map<string, MaskDoc | null>();
  const doc = (note: AnkiNote, index: number | null) => {
    const name = index === null ? null : imageFileName(field(note, index));
    if (!name) return null;
    if (!docs.has(name)) docs.set(name, readMaskDoc(ctx.masks[name]));
    return docs.get(name)!;
  };

  const masks: { box: OcclusionBox; parts?: OcclusionBox[] }[] = [];
  const approximated: boolean[] = [];
  let labels = false;
  let hideAll = 0;
  for (const note of notes) {
    const id = parseIoeId(field(note, fields.id));
    const original = doc(note, fields.original);
    const tested = testedShape(id, original, () => doc(note, fields.question));
    const shape = tested && shapeOf(tested.node, tested.doc.matrix);
    const mask = shape && maskFromBoxes(shape.boxes);
    if (!tested || !shape || !mask) return { ok: false, reason: "unreadable_masks", warnings };
    masks.push(mask);
    approximated.push(shape.approximated);
    labels ||= Boolean(original?.labels);
    if (id?.mode !== "oa") hideAll++;
  }
  if (labels) warnings.push("occlusion_labels_removed");

  const first = (index: number | null) =>
    notes.map((note) => ctx.md(field(note, index)).trim()).find(Boolean) ?? "";
  const header = first(fields.header);
  const sections = fields.extras.flatMap((index) => {
    const markdown = first(index);
    if (!markdown) return [];
    const name = ctx.fieldNames[index]?.trim() || `Field ${index + 1}`;
    // The add-on shows the footer under the image without a caption.
    if (/^footer$/i.test(name)) return [markdown];
    return [`**${ctx.md(escapeHtml(name)).trim()}**\n\n${markdown}`];
  });
  const extra = sections.join("\n\n");

  return {
    ok: true,
    approximated,
    warnings,
    content: {
      type: "image_occlusion",
      content: {
        baseImage: image.placeholder,
        masks: masks.map((mask, index) => ({
          id: `c${index + 1}`,
          geometry: mask.box,
          ...(mask.parts ? { parts: mask.parts } : {}),
        })),
        ...(header ? { header } : {}),
        ...(extra ? { extra } : {}),
        revealMode: hideAll * 2 >= notes.length ? "hide_all" : "hide_one",
      },
    },
  };
}
