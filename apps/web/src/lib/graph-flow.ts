import { MarkerType, Position, type Edge, type XYPosition } from "@xyflow/react";
import type { UiDeckGraph } from "@/types/view-models";
import { CARD_NODE_HEIGHT, CARD_NODE_WIDTH } from "@/lib/graph-dimensions";
import type { CardFlowNode } from "@/components/prerequisite-graph/flashcard-node";

const CARD_PREVIEW_LIMIT = 240;

export const EDGE_STROKE = "var(--color-border-strong)";
export const EDGE_STROKE_ACCENT = "var(--color-accent)";

export const EDGE_MARKER_END = {
  type: MarkerType.ArrowClosed,
  width: 14,
  height: 14,
  color: "var(--color-border-strong)",
} as const;

export const EDGE_MARKER_END_ACCENT = {
  type: MarkerType.ArrowClosed,
  width: 14,
  height: 14,
  color: "var(--color-accent)",
} as const;

export type EdgeEmphasis = "active" | "dimmed" | null;

export type GraphFlowEdgeData = { emphasis: EdgeEmphasis };

export type GraphFlowEdge = Edge<GraphFlowEdgeData>;

export function makeFlowEdge(prereqId: string, dependentId: string): Edge {
  return {
    id: `${prereqId}-${dependentId}`,
    source: prereqId,
    target: dependentId,
    type: "floating",
    markerEnd: EDGE_MARKER_END,
    style: {
      stroke: EDGE_STROKE,
      strokeWidth: 1.5,
    },
    data: { emphasis: null },
  } as GraphFlowEdge;
}

export function styleEdgeForEmphasis(edge: Edge, emphasis: EdgeEmphasis): Edge {
  if ((edge.data as Partial<GraphFlowEdgeData> | undefined)?.emphasis === emphasis) {
    return edge;
  }
  if (emphasis === "active") {
    return {
      ...edge,
      data: { ...edge.data, emphasis },
      markerEnd: EDGE_MARKER_END_ACCENT,
      style: { stroke: EDGE_STROKE_ACCENT, strokeWidth: 2 },
    };
  }
  return {
    ...edge,
    data: { ...edge.data, emphasis },
    markerEnd: EDGE_MARKER_END,
    style: {
      stroke: EDGE_STROKE,
      strokeWidth: 1.5,
      opacity: emphasis === "dimmed" ? 0.25 : 1,
    },
  };
}

export function incidentNodeIdsOf(edges: UiDeckGraph["edges"]): Set<string> {
  const incident = new Set<string>();
  for (const edge of edges) {
    incident.add(edge.prereqId);
    incident.add(edge.dependentId);
  }
  return incident;
}

function fallbackPositionFor(index: number) {
  const columns = 5;
  const column = index % columns;
  const row = Math.floor(index / columns);

  return {
    x: column * (CARD_NODE_WIDTH + 48),
    y: row * (CARD_NODE_HEIGHT + 56),
  };
}

export function graphNodePreview(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= CARD_PREVIEW_LIMIT) return compact;
  return `${compact.slice(0, CARD_PREVIEW_LIMIT - 1).trimEnd()}…`;
}

const CARD_NODE_HANDLES = [
  {
    id: "top",
    type: "source" as const,
    position: Position.Top,
    x: CARD_NODE_WIDTH / 2,
    y: 0,
  },
  {
    id: "right",
    type: "source" as const,
    position: Position.Right,
    x: CARD_NODE_WIDTH,
    y: CARD_NODE_HEIGHT / 2,
  },
  {
    id: "bottom",
    type: "source" as const,
    position: Position.Bottom,
    x: CARD_NODE_WIDTH / 2,
    y: CARD_NODE_HEIGHT,
  },
  {
    id: "left",
    type: "source" as const,
    position: Position.Left,
    x: 0,
    y: CARD_NODE_HEIGHT / 2,
  },
];

export function toFlowNode(
  node: UiDeckGraph["nodes"][number],
  incidentNodeIds: Set<string>,
  position = { x: 0, y: 0 },
): CardFlowNode {
  return {
    id: node.id,
    type: "card",
    position,
    initialWidth: CARD_NODE_WIDTH,
    initialHeight: CARD_NODE_HEIGHT,
    handles: CARD_NODE_HANDLES,
    measured: { width: CARD_NODE_WIDTH, height: CARD_NODE_HEIGHT },
    data: {
      front: graphNodePreview(node.front),
      back: graphNodePreview(node.back),
      type: node.type,
      state: node.state,
      locked: node.locked,
      archived: node.archived,
      isIsolated: !incidentNodeIds.has(node.id),
      emphasis: null,
    },
  };
}

function yieldToScheduler(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      window.requestIdleCallback(() => resolve(), { timeout: 50 });
      return;
    }
    setTimeout(resolve, 0);
  });
}

type BuildGraphFlowElementsOptions = {
  signal: AbortSignal;
  chunkSize?: number;
};

export async function buildGraphFlowElementsAsync(
  graph: UiDeckGraph,
  savedPositions: Map<string, XYPosition>,
  options: BuildGraphFlowElementsOptions,
): Promise<{ nodes: CardFlowNode[]; edges: Edge[] } | null> {
  const { signal, chunkSize = 1000 } = options;
  if (signal.aborted) return null;

  const incidentNodeIds = incidentNodeIdsOf(graph.edges);

  const nodes: CardFlowNode[] = [];
  for (let index = 0; index < graph.nodes.length; index++) {
    const node = graph.nodes[index];
    nodes.push(
      toFlowNode(node, incidentNodeIds, savedPositions.get(node.id) ?? fallbackPositionFor(index)),
    );
    if ((index + 1) % chunkSize === 0) {
      await yieldToScheduler();
      if (signal.aborted) return null;
    }
  }

  const edges: Edge[] = [];
  for (let index = 0; index < graph.edges.length; index++) {
    const edge = graph.edges[index];
    edges.push(makeFlowEdge(edge.prereqId, edge.dependentId));
    if ((index + 1) % chunkSize === 0) {
      await yieldToScheduler();
      if (signal.aborted) return null;
    }
  }

  if (signal.aborted) return null;
  return { nodes, edges };
}

export function refreshNodeData(
  nodes: CardFlowNode[],
  edges: UiDeckGraph["edges"],
): CardFlowNode[] {
  const incidentNodeIds = incidentNodeIdsOf(edges);
  let changed = false;
  const nextNodes = nodes.map((node) => {
    const isIsolated = !incidentNodeIds.has(node.id);
    if (node.data.isIsolated === isIsolated) return node;
    changed = true;
    return {
      ...node,
      data: {
        ...node.data,
        isIsolated,
      },
    };
  });
  return changed ? nextNodes : nodes;
}
