import { decodeEntities } from "./html";

const SHAPE_RE =
  /\{\{c(\d+)::image-occlusion:(rect|ellipse|polygon|text)((?::(?:[^}\\]|\\.)*)?)\}\}/g;

export type OcclusionBox = { x: number; y: number; w: number; h: number };

export type OcclusionMask = {
  num: number;
  box: OcclusionBox;
  parts?: OcclusionBox[];
  approximated: boolean;
};

export type OcclusionParse = {
  masks: OcclusionMask[];
  hideAll: boolean;
  labels: number;
};

const MAX_PARTS = 32;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const round = (value: number) => Math.round(value * 10_000) / 10_000;

function props(source: string) {
  const out: Record<string, string> = {};
  for (const part of source.replaceAll("\\:", "").split(":")) {
    const eq = part.indexOf("=");
    if (eq > 0) out[part.slice(0, eq).trim()] = part.slice(eq + 1).replaceAll("", ":");
  }
  return out;
}

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
    return placed({ x: num("left"), y: num("top"), w: num("rx") * 2, h: num("ry") * 2 }, true);
  }
  const points = (values.points ?? "")
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number))
    .filter((pair) => pair.length === 2 && pair.every(Number.isFinite));
  if (points.length === 0) return null;
  const bounds = boundsOf(points);
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

export function maskFromBoxes(boxes: OcclusionBox[]) {
  const finished = boxes.map(finishBox).filter((box): box is OcclusionBox => box !== null);
  if (finished.length === 0) return null;
  const box = finishBox(finished.reduce(unionBox));
  if (!box) return null;
  const parts = finished.length > 1 && finished.length <= MAX_PARTS ? finished : undefined;
  return { box, ...(parts ? { parts } : {}) };
}

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

export function hasOcclusionMarkers(field: string) {
  return field.includes("image-occlusion:");
}

export function hasClosetOcclusions(field: string) {
  return /\[#!occlusions?\b/i.test(field);
}
