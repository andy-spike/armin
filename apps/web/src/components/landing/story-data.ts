/**
 * The landing page's example library. Positions are the centre of each card in
 * % of the graph box; foundations sit low, what builds on them sits higher.
 * The deck is the part the story walks through; the field around it is the rest
 * of the subject, revealed when the camera pulls back.
 */

export type NodeId = "calls" | "stack" | "arrays" | "recursion" | "tables" | "memo" | "dp";
export type NodeState = "learned" | "due" | "locked" | "new";

export type DeckNode = { id: NodeId; label: string; x: number; y: number; needs: NodeId[] };

export const DECK: DeckNode[] = [
  { id: "calls", label: "Function calls", x: 17, y: 88, needs: [] },
  { id: "stack", label: "The call stack", x: 49, y: 88, needs: [] },
  { id: "arrays", label: "Arrays", x: 82, y: 88, needs: [] },
  { id: "recursion", label: "Recursion", x: 31, y: 62, needs: ["calls", "stack"] },
  { id: "tables", label: "Lookup tables", x: 79, y: 62, needs: ["arrays"] },
  { id: "memo", label: "Memoization", x: 55, y: 37, needs: ["recursion", "tables"] },
  { id: "dp", label: "Dynamic programming", x: 55, y: 12, needs: ["memo"] },
];

export const DECK_EDGES = DECK.flatMap((node) =>
  node.needs.map((from) => ({ from, to: node.id, key: `${from}-${node.id}` })),
);

/** The cards the review beat grades, with the chip each one shows afterwards. */
export const GRADED: { id: NodeId; grade: "good" | "easy"; label: string }[] = [
  { id: "calls", grade: "good", label: "Good · 3d" },
  { id: "stack", grade: "easy", label: "Easy · 8d" },
  { id: "arrays", grade: "good", label: "Good · 3d" },
];

export type FieldNode = { id: string; label: string; x: number; y: number; needs: string[] };

const WIDE_ROW = [-80, -37, 6, 49, 92, 135, 178];
const SIDES = [-80, -38, 138, 180];

const ROWS: { y: number; xs: number[]; labels: string[] }[] = [
  {
    y: 160,
    xs: WIDE_ROW,
    labels: ["Values", "Variables", "Expressions", "Booleans", "Conditionals", "Loops", "Strings"],
  },
  {
    y: 125,
    xs: WIDE_ROW,
    labels: ["Functions", "Scope", "Memory", "Pointers", "Lists", "Indexing", "Iteration"],
  },
  { y: 88, xs: SIDES, labels: ["Sets", "Hashing", "Sorting", "Big-O"] },
  { y: 52, xs: SIDES, labels: ["Hash maps", "Trees", "Binary search", "Merge sort"] },
  { y: 20, xs: SIDES, labels: ["Tries", "Heaps", "Divide and conquer", "Greedy choice"] },
  { y: -12, xs: SIDES, labels: ["Graphs", "Priority queues", "Backtracking", "Intervals"] },
  {
    y: -45,
    xs: WIDE_ROW,
    labels: ["BFS", "DFS", "Shortest paths", "Knapsack", "Edit distance", "Scheduling", "Pruning"],
  },
  {
    y: -80,
    xs: WIDE_ROW,
    labels: [
      "Topological sort",
      "Dijkstra",
      "Bellman-Ford",
      "Alignment",
      "Bitmask DP",
      "Network flow",
      "NP-hardness",
    ],
  },
];

type Point = { id: string; x: number; y: number };

const fieldPoints: Point[] = ROWS.flatMap((row, r) =>
  row.xs.map((x, i) => ({
    id: `f${r}-${i}`,
    // A small fixed jitter, so the field reads as a graph rather than a table.
    x: x + (((i * 5 + r * 3) % 5) - 2) * 1.5,
    y: row.y + (((i * 7 + r) % 5) - 2) * 1.2,
  })),
);

/** Each card rests on the one or two nearest cards in the band below it. */
function needsOf(point: Point, candidates: Point[], index: number) {
  return candidates
    .filter((c) => c.y > point.y + 15 && c.y <= point.y + 60 && Math.abs(c.x - point.x) < 50)
    .sort((a, b) => Math.abs(a.x - point.x) - Math.abs(b.x - point.x))
    .slice(0, index % 2 === 0 ? 2 : 1)
    .map((c) => c.id);
}

const allPoints: Point[] = [...fieldPoints, ...DECK];

export const FIELD: FieldNode[] = fieldPoints.map((point, i) => {
  const row = ROWS[Number(point.id.slice(1).split("-")[0])]!;
  const col = Number(point.id.split("-")[1]);
  return { ...point, label: row.labels[col]!, needs: needsOf(point, allPoints, i) };
});

/** The deck's foundations rest on field cards too; only the pull-back shows it. */
const foundationEdges = DECK.filter((node) => node.needs.length === 0).flatMap((node, i) =>
  needsOf(node, fieldPoints, i).map((from) => ({ from, to: node.id })),
);

export const FIELD_EDGES = [
  ...FIELD.flatMap((node) => node.needs.map((from) => ({ from, to: node.id }))),
  ...foundationEdges,
].map((edge) => ({ ...edge, key: `${edge.from}-${edge.to}` }));

const POSITIONS = new Map<string, { x: number; y: number }>(allPoints.map((p) => [p.id, p]));

/** A vertical S-curve from a prerequisite up to the card that needs it. */
export function edgePath(from: string, to: string) {
  const a = POSITIONS.get(from)!;
  const b = POSITIONS.get(to)!;
  const mid = (a.y + b.y) / 2;
  return `M ${a.x} ${a.y} C ${a.x} ${mid}, ${b.x} ${mid}, ${b.x} ${b.y}`;
}

const DECK_IDS = new Set<string>(DECK.map((node) => node.id));

/**
 * Field states for a learning front at `waveY`: everything below it is learned,
 * and a card opens once all of its prerequisites are. Deck cards count as
 * learned by the time the field is visible.
 */
export function fieldStates(waveY: number) {
  const learned = new Set<string>(DECK_IDS);
  for (const node of FIELD) if (node.y > waveY) learned.add(node.id);
  return new Map<string, NodeState>(
    FIELD.map((node) => [
      node.id,
      learned.has(node.id)
        ? "learned"
        : node.needs.every((id) => learned.has(id))
          ? "due"
          : "locked",
    ]),
  );
}

export const FIELD_WAVE_START = 110;
export const FIELD_WAVE_END = -30;

export const CARD_FRONT = "When does memoization change a recursion's complexity?";
export const CARD_BACK =
  "When the same subproblems recur. Caching each fib(k) turns O(2ⁿ) calls into O(n).";
