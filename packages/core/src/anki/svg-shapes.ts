import { decodeEntities } from "./html";
import { boundsOf, type OcclusionBox } from "./occlusion";

export type SvgNode = { name: string; attrs: Record<string, string>; children: SvgNode[] };

const MAX_NODES = 20_000;
const MAX_DEPTH = 64;

const TAG_RE =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR_RE = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function localName(name: string) {
  const colon = name.lastIndexOf(":");
  return (colon === -1 ? name : name.slice(colon + 1)).toLowerCase();
}

function parseAttrs(source: string) {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(ATTR_RE)) {
    const name = match[1].toLowerCase();
    if (name.startsWith("xmlns")) continue;
    attrs[localName(name)] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

export function parseSvg(text: string): SvgNode | null {
  const root: SvgNode = { name: "#document", attrs: {}, children: [] };
  const stack = [root];
  let count = 0;
  for (const match of text.matchAll(TAG_RE)) {
    if (!match[2]) continue;
    const name = localName(match[2]);
    if (match[1]) {
      const open = stack.findLastIndex((node) => node.name === name);
      if (open > 0) stack.length = open;
      continue;
    }
    if (++count > MAX_NODES) return null;
    const body = match[3];
    const selfClosing = /\/\s*$/.test(body);
    const node: SvgNode = {
      name,
      attrs: parseAttrs(selfClosing ? body.replace(/\/\s*$/, "") : body),
      children: [],
    };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) {
      if (stack.length >= MAX_DEPTH) return null;
      stack.push(node);
    }
  }
  const find = (node: SvgNode): SvgNode | null =>
    node.name === "svg" ? node : (node.children.map(find).find(Boolean) ?? null);
  return find(root);
}

export type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

const apply = (m: Matrix, [x, y]: readonly number[]) => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

const NUMBER_RE = /[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
const numbersIn = (text: string | undefined) => [...(text ?? "").matchAll(NUMBER_RE)].map(Number);

function parseTransform(text: string | undefined): Matrix {
  let result = IDENTITY;
  for (const [, name, args] of (text ?? "").matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const v = numbersIn(args);
    const rad = (degrees: number) => (degrees * Math.PI) / 180;
    let m: Matrix | null = null;
    switch (name.toLowerCase()) {
      case "matrix":
        if (v.length === 6) m = v as Matrix;
        break;
      case "translate":
        m = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
        break;
      case "scale":
        m = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
        break;
      case "rotate": {
        const a = rad(v[0] ?? 0);
        const [cx, cy] = [v[1] ?? 0, v[2] ?? 0];
        m = multiply(
          multiply(
            [1, 0, 0, 1, cx, cy],
            [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0],
          ),
          [1, 0, 0, 1, -cx, -cy],
        );
        break;
      }
      case "skewx":
        m = [1, 0, Math.tan(rad(v[0] ?? 0)), 1, 0, 0];
        break;
      case "skewy":
        m = [1, Math.tan(rad(v[0] ?? 0)), 0, 1, 0, 0];
        break;
    }
    if (m && m.every(Number.isFinite)) result = multiply(result, m);
  }
  return result;
}

const attr = (node: SvgNode, name: string) => Number.parseFloat(node.attrs[name] ?? "0");

function ellipsePoints(cx: number, cy: number, rx: number, ry: number) {
  return Array.from({ length: 36 }, (_, i) => {
    const angle = (i * Math.PI) / 18;
    return [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)];
  });
}

function pathPoints(d: string) {
  const points: number[][] = [];
  let [x, y, startX, startY] = [0, 0, 0, 0];
  for (const [, command, args] of d.matchAll(
    /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g,
  )) {
    const v = numbersIn(args);
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    const at = (dx: number, dy: number) => (relative ? [x + dx, y + dy] : [dx, dy]);
    if (upper === "Z") {
      [x, y] = [startX, startY];
      continue;
    }
    if (upper === "H" || upper === "V") {
      for (const value of v) {
        if (upper === "H") x = relative ? x + value : value;
        else y = relative ? y + value : value;
        points.push([x, y]);
      }
      continue;
    }
    const size = { M: 2, L: 2, T: 2, S: 4, Q: 4, C: 6, A: 7 }[upper] ?? 2;
    for (let i = 0; i + size <= v.length; i += size) {
      const group = v.slice(i, i + size);
      if (upper === "A") {
        const end = at(group[5], group[6]);
        const [rx, ry] = [Math.abs(group[0]), Math.abs(group[1])];
        const midX = (x + end[0]) / 2;
        const midY = (y + end[1]) / 2;
        points.push([x, y], end, [midX - rx, midY - ry], [midX + rx, midY + ry]);
        [x, y] = end;
      } else {
        for (let j = 0; j < size; j += 2) points.push(at(group[j], group[j + 1]));
        [x, y] = points[points.length - 1];
      }
      if (upper === "M" && i === 0) [startX, startY] = [x, y];
    }
  }
  return points;
}

function localPoints(node: SvgNode) {
  switch (node.name) {
    case "rect": {
      const [x, y, w, h] = [
        attr(node, "x"),
        attr(node, "y"),
        attr(node, "width"),
        attr(node, "height"),
      ];
      if (!(w > 0 && h > 0)) return [];
      return [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h],
      ];
    }
    case "ellipse":
      return ellipsePoints(attr(node, "cx"), attr(node, "cy"), attr(node, "rx"), attr(node, "ry"));
    case "circle":
      return ellipsePoints(attr(node, "cx"), attr(node, "cy"), attr(node, "r"), attr(node, "r"));
    case "line":
      return [
        [attr(node, "x1"), attr(node, "y1")],
        [attr(node, "x2"), attr(node, "y2")],
      ];
    case "polygon":
    case "polyline": {
      const v = numbersIn(node.attrs.points);
      const points = [];
      for (let i = 0; i + 1 < v.length; i += 2) points.push([v[i], v[i + 1]]);
      return points;
    }
    case "path":
      return pathPoints(node.attrs.d ?? "");
    default:
      return [];
  }
}

const NON_DRAWING = new Set(["title", "desc", "defs", "metadata", "style", "script", "text"]);

export type SvgShape = {
  boxes: OcclusionBox[];
  approximated: boolean;
};

export function shapeOf(node: SvgNode, inherited: Matrix = IDENTITY): SvgShape {
  const matrix = withTransform(inherited, node);
  if (node.name === "g" || node.name === "a" || node.name === "switch") {
    const children = node.children
      .filter((child) => !NON_DRAWING.has(child.name))
      .map((child) => shapeOf(child, matrix));
    return {
      boxes: children.flatMap((child) => child.boxes),
      approximated: children.some((child) => child.approximated),
    };
  }
  if (NON_DRAWING.has(node.name)) return { boxes: [], approximated: false };
  const points = localPoints(node).filter((point) => point.every(Number.isFinite));
  if (points.length === 0) return { boxes: [], approximated: false };
  const axisAligned = Math.abs(matrix[1]) < 1e-9 && Math.abs(matrix[2]) < 1e-9;
  return {
    boxes: [boundsOf(points.map((point) => apply(matrix, point)))],
    approximated: node.name !== "rect" || !axisAligned,
  };
}

function length(value: string | undefined) {
  const match = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(px)?\s*$/i.exec(value ?? "");
  const number = match ? Number(match[1]) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function canvasMatrix(svg: SvgNode): Matrix | null {
  const box = numbersIn(svg.attrs.viewbox);
  if (box.length === 4 && box[2] > 0 && box[3] > 0) {
    return [1 / box[2], 0, 0, 1 / box[3], -box[0] / box[2], -box[1] / box[3]];
  }
  const width = length(svg.attrs.width);
  const height = length(svg.attrs.height);
  return width && height ? [1 / width, 0, 0, 1 / height, 0, 0] : null;
}

export function withTransform(inherited: Matrix, node: SvgNode) {
  return multiply(inherited, parseTransform(node.attrs.transform));
}
