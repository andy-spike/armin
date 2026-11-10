import { decodeEntities } from "./html";

/**
 * Anki image occlusion (23.10+) stores its masks as cloze markers in the
 * occlusion field, one per shape:
 *
 *   {{c1::image-occlusion:rect:left=.12:top=.3:width=.2:height=.1:oi=1}}
 *   {{c2::image-occlusion:ellipse:left=.5:top=.5:rx=.1:ry=.05}}
 *   {{c3::image-occlusion:polygon:left=.1:top=.1:points=0.1,0.1 0.4,0.1 0.2,0.5}}
 *   {{c0::image-occlusion:text:left=.4:top=.6:text=Aorta:scale=1:fs=.04}}
 *
 * Coordinates are fractions (0–1) of the image, the same unit Armin uses for
 * mask geometry, so no pixel conversion is needed. Shapes grouped in Anki's
 * editor share one cloze number; text shapes are labels drawn on every card
 * (always `c0`). `oi=1` ("occlude inactive") marks the note as "hide all,
 * guess one"; without it, Anki hides only the tested shape. Values escape `:`
 * as `\:`.
 */

const SHAPE_RE =
  /\{\{c(\d+)::image-occlusion:(rect|ellipse|polygon|text)((?::(?:[^}\\]|\\.)*)?)\}\}/g;

export type OcclusionBox = { x: number; y: number; w: number; h: number };

export type OcclusionMask = {
  /** Anki cloze number; the review unit is `c<number>`. */
  num: number;
  /** Bounding box of every shape in the mask. */
  box: OcclusionBox;
  /** Each shape's box when the mask has several shapes. */
  parts?: OcclusionBox[];
  /** True when a box stands in for an ellipse, polygon, or rotated shape. */
  approximated: boolean;
};

export type OcclusionParse = {
  masks: OcclusionMask[];
  /** Anki's "hide all, guess one" mode (`oi=1`); false means hide one. */
  hideAll: boolean;
  /** Text labels Anki draws on the image, which Armin can't show. */
  labels: number;
};

/** The most separate boxes one Armin mask keeps; more are merged into their bounds. */
const MAX_PARTS = 32;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const round = (value: number) => Math.round(value * 10_000) / 10_000;

function props(source: string) {
  const out: Record<string, string> = {};
  // A private-use character stands in for escaped colons while splitting.
  for (const part of source.replaceAll("\\:", "").split(":")) {
    const eq = part.indexOf("=");
    if (eq > 0) out[part.slice(0, eq).trim()] = part.slice(eq + 1).replaceAll("", ":");
  }
  return out;
}

/** The smallest box holding every `[x, y]` point. */
export function boundsOf(points: readonly (readonly number[])[]): OcclusionBox {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function unionBox(a: OcclusionBox, b: OcclusionBox): OcclusionBox {
  return boundsOf([
    [a.x, a.y],
    [a.x + a.w, a.y + a.h],
    [b.x, b.y],
    [b.x + b.w, b.y + b.h],
  ]);
}

/**
 * Bounding box of a box rotated clockwise by `degrees` around its top-left
 * corner, which is how Anki's fabric.js shapes rotate. The image's aspect ratio
 * isn't known here, so rotating in fractional units is itself approximate.
 */
function rotatedBox(box: OcclusionBox, degrees: number): OcclusionBox {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    [0, 0],
    [box.w, 0],
    [0, box.h],
    [box.w, box.h],
  ].map(([dx, dy]) => [box.x + dx * cos - dy * sin, box.y + dx * sin + dy * cos]);
  return boundsOf(corners);
}

function shapeBox(kind: string, values: Record<string, string>) {
  const num = (key: string) => Number(values[key]);
  const angle = Number(values.angle ?? 0);
  const rotated = Number.isFinite(angle) && angle % 360 !== 0;
  const placed = (box: OcclusionBox, approximated: boolean) =>
    rotated ? { box: rotatedBox(box, angle), approximated: true } : { box, approximated };
  if (kind === "rect") {
    return placed({ x: num("left"), y: num("top"), w: num("width"), h: num("height") }, false);
  }
  if (kind === "ellipse") {
    // Anki stores the ellipse's top-left corner and its radii.
    return placed({ x: num("left"), y: num("top"), w: num("rx") * 2, h: num("ry") * 2 }, true);
  }
  const points = (values.points ?? "")
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number))
    .filter((pair) => pair.length === 2 && pair.every(Number.isFinite));
  if (points.length === 0) return null;
  const bounds = boundsOf(points);
  // fabric.js draws a polygon's points at its left/top, which moves with the
  // shape while the stored points may keep their original position.
  const left = num("left");
  const top = num("top");
  return placed(
    {
      ...bounds,
      x: Number.isFinite(left) ? left : bounds.x,
      y: Number.isFinite(top) ? top : bounds.y,
    },
    true,
  );
}

/** A box clamped to the image and rounded, or null when nothing of it is on the image. */
export function finishBox(box: OcclusionBox): OcclusionBox | null {
  if (!Object.values(box).every(Number.isFinite)) return null;
  const x = clamp(box.x);
  const y = clamp(box.y);
  const right = clamp(box.x + box.w);
  const bottom = clamp(box.y + box.h);
  if (right - x <= 0 || bottom - y <= 0) return null;
  return {
    x: round(x),
    y: round(y),
    w: Math.max(0.001, round(right - x)),
    h: Math.max(0.001, round(bottom - y)),
  };
}

/**
 * One mask from the boxes of its shapes: their bounds, plus each box when
 * there are several (merged into one when there are too many to keep).
 */
export function maskFromBoxes(boxes: OcclusionBox[]) {
  const finished = boxes.map(finishBox).filter((box): box is OcclusionBox => box !== null);
  if (finished.length === 0) return null;
  const box = finishBox(finished.reduce(unionBox));
  if (!box) return null;
  const parts = finished.length > 1 && finished.length <= MAX_PARTS ? finished : undefined;
  return { box, ...(parts ? { parts } : {}) };
}

/**
 * Read the shapes of an occlusion field. Shapes sharing a cloze number become
 * one mask with a part per shape, so every Anki card keeps exactly one review unit.
 */
export function parseOcclusion(field: string): OcclusionParse {
  const text = decodeEntities(field.replace(/<[^>]*>/g, ""));
  const byNum = new Map<number, { boxes: OcclusionBox[]; approximated: boolean }>();
  let hideAll = false;
  let labels = 0;
  for (const match of text.matchAll(SHAPE_RE)) {
    const num = Number(match[1]);
    if (match[2] === "text" || num === 0) {
      labels++;
      continue;
    }
    const values = props(match[3].slice(1));
    if (values.oi === "1") hideAll = true;
    const shape = shapeBox(match[2], values);
    if (!shape || !Object.values(shape.box).every(Number.isFinite)) continue;
    const entry = byNum.get(num) ?? { boxes: [], approximated: false };
    entry.boxes.push(shape.box);
    entry.approximated ||= shape.approximated;
    byNum.set(num, entry);
  }
  const masks: OcclusionMask[] = [];
  for (const [num, entry] of [...byNum].sort(([a], [b]) => a - b)) {
    const mask = maskFromBoxes(entry.boxes);
    if (mask) masks.push({ num, ...mask, approximated: entry.approximated });
  }
  return { masks, hideAll, labels };
}

/** Does this field hold Anki occlusion markers? */
export function hasOcclusionMarkers(field: string) {
  return field.includes("image-occlusion:");
}

/**
 * Closet's occlusion syntax (`[#!occlusions [[rect0::x,y,w,h]] … #]`), used by
 * AnKing's "IO-one by one" note type. Its pixel coordinates need the image
 * size, and its templates reveal one shape at a time, which Armin doesn't map.
 */
export function hasClosetOcclusions(field: string) {
  return /\[#!occlusions?\b/i.test(field);
}
