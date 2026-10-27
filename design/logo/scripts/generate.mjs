// Generates every Armin logo SVG, plus the shape data the web app renders inline.
// Usage (from the repo root): node design/logo/scripts/generate.mjs
// The wordmark comes from svg/armin-wordmark.svg, made by wordmark.py; run that first if it changes.
import { readFileSync, writeFileSync } from "node:fs";

const svgDir = new URL("../svg/", import.meta.url);
const brandPaths = new URL("../../../apps/web/src/components/brand-paths.ts", import.meta.url);
const C = {
  paper: "#FFFCF0",
  ink: "#100F0F",
  teal: "#1C6C66",
  cyan6: "#24837B",
  cyan4: "#3AA99F",
  cyan2: "#A2DECE",
};
const f = (n) => +n.toFixed(2);

// The "wide tree": cards are nodes, prerequisites are edges. Nodes are [x, y, r, goal].
// The crown's tips sit on an arch, and every inner tip has two parents.
const full = {
  nodes: [
    [50, 90, 7.2],
    [50, 67, 6.2],
    [31, 52, 5.6],
    [69, 52, 5.6],
    [15.5, 39, 4.9],
    [38.5, 33.5, 4.9],
    [61.5, 33.5, 4.9],
    [84.5, 39, 4.9],
    [8, 22.5, 4.4, 1],
    [27.5, 14.5, 4.4, 1],
    [50, 11, 4.4, 1],
    [72.5, 14.5, 4.4, 1],
    [92, 22.5, 4.4, 1],
  ],
  edges: [
    [0, 1],
    [1, 2],
    [1, 3],
    [2, 4],
    [2, 5],
    [3, 6],
    [3, 7],
    [4, 8],
    [4, 9],
    [5, 9],
    [5, 10],
    [6, 10],
    [6, 11],
    [7, 11],
    [7, 12],
  ],
};
// 32px: drop some shared links so the crown doesn't clot, keeping the silhouette.
const medium = {
  nodes: full.nodes,
  edges: [
    [0, 1],
    [1, 2],
    [1, 3],
    [2, 4],
    [2, 5],
    [3, 6],
    [3, 7],
    [4, 8],
    [5, 9],
    [5, 10],
    [6, 10],
    [6, 11],
    [7, 12],
  ],
};
// 16px and small UI sizes: root, fork, two branches, four tips on the arch.
const small = {
  nodes: [
    [50, 88, 9],
    [50, 64, 7.5],
    [28, 46, 7],
    [72, 46, 7],
    [12, 24, 6.5, 1],
    [38, 16, 6.5, 1],
    [62, 16, 6.5, 1],
    [88, 24, 6.5, 1],
  ],
  edges: [
    [0, 1],
    [1, 2],
    [1, 3],
    [2, 4],
    [2, 5],
    [3, 6],
    [3, 7],
  ],
};

const themes = {
  teal: { bg: C.teal, line: C.paper, node: C.paper, goal: C.cyan2 },
  ink: { bg: C.ink, line: C.paper, node: C.paper, goal: C.cyan4 },
  paper: { bg: C.paper, line: C.ink, node: C.ink, goal: C.cyan6 },
};

// Lays the graph out in a `box`-sized area (percent of `side`) centred in a side x side square.
function layout(g, { box = 64, grow = 1, ox = 0, oy = 0, side = 100 } = {}) {
  const xs = g.nodes.flatMap(([x, , r]) => [x - r * grow, x + r * grow]);
  const ys = g.nodes.flatMap(([, y, r]) => [y - r * grow, y + r * grow]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = ((box / Math.max(x1 - x0, y1 - y0)) * side) / 100;
  const T = (x, y) => [
    f(ox + side / 2 + (x - (x0 + x1) / 2) * k),
    f(oy + side * 0.49 + (y - (y0 + y1) / 2) * k),
  ];
  return {
    d: g.edges
      .map(([a, b]) => `M${T(...g.nodes[a]).join(" ")}L${T(...g.nodes[b]).join(" ")}`)
      .join(""),
    nodes: g.nodes.map(([x, y, r, goal]) => {
      const [cx, cy] = T(x, y);
      return { cx, cy, r: f(r * grow * k), goal: Boolean(goal) };
    }),
  };
}
function mark(g, t, { stroke = 2.4, side = 100, ...opts } = {}) {
  const { d, nodes } = layout(g, { side, ...opts });
  const dots = nodes
    .map((n) => `<circle cx="${n.cx}" cy="${n.cy}" r="${n.r}" fill="${n.goal ? t.goal : t.node}"/>`)
    .join("");
  return `<path d="${d}" fill="none" stroke="${t.line}" stroke-width="${f((stroke * side) / 100)}" stroke-linecap="round"/>${dots}`;
}
const icon = (g, t, opts) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${t.bg}"/>${mark(g, t, opts)}</svg>\n`;

const files = {
  "armin-icon": icon(full, themes.teal),
  "armin-icon-ink": icon(full, themes.ink),
  "armin-icon-paper": icon(full, themes.paper),
  "armin-icon-64": icon(full, themes.teal, { box: 70, stroke: 3.4, grow: 1.12 }),
  "armin-icon-32": icon(medium, themes.teal, { box: 78, stroke: 4.6, grow: 1.25 }),
  "armin-icon-16": icon(small, themes.teal, { box: 86, stroke: 8, grow: 1.05 }),
  // Android adaptive icon foreground: transparent, mark inside the 66% safe zone.
  "armin-adaptive-foreground": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${mark(full, themes.teal, { box: 50, stroke: 2.2 })}</svg>\n`,
};

// Wordmark: outlined once from Source Serif 4 Semibold; every lockup reuses these paths.
const wm = readFileSync(new URL("armin-wordmark.svg", svgDir), "utf8");
const [wx, wy, ww, wh] = wm
  .match(/viewBox="([^"]+)"/)[1]
  .split(" ")
  .map(Number);
const wordPath = wm.match(/ d="([^"]+)"/)[1];
const XH = Number(wm.match(/data-x-height="(\d+)"/)[1]);

// Lockup rule: wordmark x-height = 0.4 x icon side; gap = 0.3 x icon side; x-height centred on the icon.
const SIDE = 80;
const s = (0.4 * SIDE) / XH;
const word = (x, baseline, fill) =>
  `<path transform="translate(${f(x - wx * s)} ${f(baseline)}) scale(${f(s * 1e4) / 1e4})" d="${wordPath}" fill="${fill}"/>`;
function lockup(t, text, panel) {
  const pad = 20;
  const gap = 0.3 * SIDE;
  const W = pad + SIDE + gap + ww * s + pad;
  const H = pad * 2 + SIDE;
  const baseline = pad + SIDE / 2 + (XH * s) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${H}"><rect width="${f(W)}" height="${H}" fill="${panel}"/>` +
    `<rect x="${pad}" y="${pad}" width="${SIDE}" height="${SIDE}" fill="${t.bg}"/>` +
    mark(full, t, { side: SIDE, ox: pad, oy: pad, box: 70, stroke: 2.8 }) +
    `${word(pad + SIDE + gap, baseline, text)}</svg>\n`
  );
}
files["armin-lockup-light"] = lockup(themes.teal, C.ink, C.paper);
files["armin-lockup-dark"] = lockup(themes.teal, C.paper, C.ink);

// Bare marks without the square, for use on the app's own background.
const bare = (g, opts) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${mark(g, { line: C.ink, node: C.ink, goal: C.cyan6 }, { box: 96, ...opts })}</svg>\n`;
files["armin-mark"] = bare(full, { stroke: 3 });
// 16-24 px UI sizes: the full tree with heavier nodes and strokes keeps the arched crown legible.
const ui = { stroke: 6, grow: 1.3 };
files["armin-mark-small"] = bare(full, ui);

for (const [name, content] of Object.entries(files))
  writeFileSync(new URL(`${name}.svg`, svgDir), content);

// Shape data for the web app's inline <ArminMark> and <ArminWordmark>, so the UI uses the same geometry.
const uiMark = layout(full, { box: 96, grow: ui.grow });
writeFileSync(
  brandPaths,
  `// Generated by design/logo/scripts/generate.mjs. Do not edit by hand.\n` +
    `export const markEdges = ${JSON.stringify(uiMark.d)};\n` +
    `export const markStroke = ${ui.stroke};\n` +
    `export const markNodes = ${JSON.stringify(uiMark.nodes)};\n` +
    `export const wordmarkViewBox = ${JSON.stringify(`${wx} ${wy} ${ww} ${wh}`)};\n` +
    `export const wordmarkPath = ${JSON.stringify(wordPath.replace(/(\d+\.\d{2})\d+/g, "$1"))};\n`,
);
console.log(Object.keys(files).join("\n"));
