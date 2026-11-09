import { markEdges, markNodes, markStroke } from "../../../web/src/components/brand-paths";

const round = (value: number) => Math.round(value * 100) / 100;

function circle(cx: number, cy: number, r: number) {
  return `M${round(cx - r)} ${cy}a${r} ${r} 0 1 0 ${round(2 * r)} 0a${r} ${r} 0 1 0 ${round(-2 * r)} 0Z`;
}

function capsule(x1: number, y1: number, x2: number, y2: number, width: number) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const r = width / 2;
  const nx = (-(y2 - y1) / length) * r;
  const ny = ((x2 - x1) / length) * r;
  return [
    `M${round(x1 + nx)} ${round(y1 + ny)}`,
    `L${round(x2 + nx)} ${round(y2 + ny)}`,
    `A${r} ${r} 0 0 0 ${round(x2 - nx)} ${round(y2 - ny)}`,
    `L${round(x1 - nx)} ${round(y1 - ny)}`,
    `A${r} ${r} 0 0 0 ${round(x1 + nx)} ${round(y1 + ny)}Z`,
  ].join("");
}

const edges = [...markEdges.matchAll(/M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)/g)].map((match) => {
  const [x1, y1, x2, y2] = match.slice(1).map(Number);
  return capsule(x1, y1, x2, y2, markStroke);
});

export const logo = {
  /** The drawing's box; callers size it by height and keep the ratio. */
  width: 100,
  height: 100,
  paths: [...edges, ...markNodes.map((node) => circle(node.cx, node.cy, node.r))],
};
