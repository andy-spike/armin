import { decodeEntities } from "./html";

const SHAPE_RE = /\{\{c(\d+)::image-occlusion:(rect|ellipse|polygon):([^}]*)\}\}/g;

export type OcclusionBox = { x: number; y: number; w: number; h: number };

export type OcclusionMask = {
  num: number;
  box: OcclusionBox;
  approximated: boolean;
};

export type OcclusionParse = {
  masks: OcclusionMask[];
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

function boundsOf(points: number[][]): OcclusionBox {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
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
    return placed({ x: num("left"), y: num("top"), w: num("rx") * 2, h: num("ry") * 2 }, true);
  }
  const points = (values.points ?? "")
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number))
    .filter((pair) => pair.length === 2 && pair.every(Number.isFinite));
  if (points.length === 0) return null;
  return { box: boundsOf(points), approximated: true };
}

function union(a: OcclusionBox, b: OcclusionBox): OcclusionBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

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

export function hasOcclusionMarkers(field: string) {
  return field.includes("image-occlusion:");
}
