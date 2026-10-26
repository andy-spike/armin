import { decodeEntities } from "./html";

/**
 * Anki image occlusion (23.10+) stores its masks as cloze markers in the
 * occlusion field, one per shape:
 *
 *   {{c1::image-occlusion:rect:left=.12:top=.3:width=.2:height=.1:oi=1}}
 *   {{c2::image-occlusion:ellipse:left=.5:top=.5:rx=.1:ry=.05}}
 *   {{c3::image-occlusion:polygon:points=0.1,0.1 0.4,0.1 0.2,0.5}}
 *
 * Coordinates are fractions (0–1) of the image, the same unit Armin uses for
 * mask geometry, so no pixel conversion is needed.
 */

const SHAPE_RE = /\{\{c(\d+)::image-occlusion:(rect|ellipse|polygon):([^}]*)\}\}/g;

export type OcclusionBox = { x: number; y: number; w: number; h: number };

export type OcclusionMask = {
  /** Anki cloze number; the review unit is `c<number>`. */
  num: number;
  box: OcclusionBox;
  /** True when the box stands in for an ellipse, polygon, or several shapes. */
  approximated: boolean;
};

export type OcclusionParse = {
  masks: OcclusionMask[];
  /** Anki's "hide all, guess one" mode (`oi=1`); false means hide one. */
  hideAll: boolean;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

function props(source: string) {
  const out: Record<string, string> = {};
  for (const part of source.split(":")) {
    const eq = part.indexOf("=");
    if (eq > 0) out[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return out;
}

function shapeBox(kind: string, values: Record<string, string>) {
  const num = (key: string) => Number(values[key]);
  if (kind === "rect") {
    return { box: { x: num("left"), y: num("top"), w: num("width"), h: num("height") } };
  }
  if (kind === "ellipse") {
    // Anki stores the ellipse's top-left corner and its radii.
    return {
      box: { x: num("left"), y: num("top"), w: num("rx") * 2, h: num("ry") * 2 },
      approximated: true,
    };
  }
  const points = (values.points ?? "")
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number))
    .filter((pair) => pair.length === 2 && pair.every(Number.isFinite));
  if (points.length === 0) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { box: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }, approximated: true };
}

function union(a: OcclusionBox, b: OcclusionBox): OcclusionBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/**
 * Read the shapes of an occlusion field. Shapes sharing a cloze number become
 * one mask (their bounding box), so every Anki card keeps exactly one review unit.
 */
export function parseOcclusion(field: string): OcclusionParse {
  const text = decodeEntities(field.replace(/<[^>]*>/g, ""));
  const byNum = new Map<number, OcclusionMask>();
  let hideAll = false;
  for (const match of text.matchAll(SHAPE_RE)) {
    const values = props(match[3]);
    if (values.oi === "1") hideAll = true;
    const shape = shapeBox(match[2], values);
    if (!shape || !Object.values(shape.box).every(Number.isFinite)) continue;
    const num = Number(match[1]);
    const existing = byNum.get(num);
    const approximated = "approximated" in shape && Boolean(shape.approximated);
    byNum.set(
      num,
      existing
        ? { num, box: union(existing.box, shape.box), approximated: true }
        : { num, box: shape.box, approximated },
    );
  }
  const masks = [...byNum.values()]
    .sort((a, b) => a.num - b.num)
    .map((mask) => {
      const x = clamp(mask.box.x);
      const y = clamp(mask.box.y);
      const w = Math.max(0.001, clamp(mask.box.x + mask.box.w) - x);
      const h = Math.max(0.001, clamp(mask.box.y + mask.box.h) - y);
      return { ...mask, box: { x, y, w, h } };
    });
  return { masks, hideAll };
}

/** Does this field hold Anki occlusion markers? */
export function hasOcclusionMarkers(field: string) {
  return field.includes("image-occlusion:");
}
