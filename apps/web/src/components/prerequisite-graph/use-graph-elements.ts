import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { Edge, XYPosition } from "@xyflow/react";
import type { UiDeckGraph } from "@/types/view-models";
import {
  graphNodePreview,
  incidentNodeIdsOf,
  makeFlowEdge,
  refreshNodeData,
  styleEdgeForEmphasis,
  toFlowNode,
} from "@/lib/graph-flow";
import type { CardFlowNode, NodeEmphasis } from "./flashcard-node";
import type { useGraphSearch } from "./use-graph-search";

type GraphNode = UiDeckGraph["nodes"][number];
type SetNodes = Dispatch<SetStateAction<CardFlowNode[]>>;
type SetEdges = Dispatch<SetStateAction<Edge[]>>;

/**
 * Keep the canvas in step with the deck after the initial build: add and
 * remove nodes, mirror the persisted edges, and refresh node content. Each
 * effect stays dormant until `initialFlowLoaded` so it doesn't fight the build.
 */
export function useGraphElementSync({
  graph,
  nodeById,
  nodePlacements,
  initialFlowLoaded,
  screenToFlowPosition,
  setNodes,
  setEdges,
}: {
  graph: UiDeckGraph;
  nodeById: Map<string, GraphNode>;
  nodePlacements?: Record<string, XYPosition>;
  /** Set by the initial build; the effects stay dormant until then. */
  initialFlowLoaded: RefObject<boolean>;
  screenToFlowPosition: (position: XYPosition) => XYPosition;
  setNodes: SetNodes;
  setEdges: SetEdges;
}) {
  const knownNodeIds = useRef(new Set<string>());
  /** The initial build's nodes, so later syncs add and remove only the difference. */
  const seedKnownNodes = useCallback((nodeIds: string[]) => {
    knownNodeIds.current = new Set(nodeIds);
  }, []);

  // Incrementally add/remove nodes as the underlying deck changes, preserving
  // the positions of cards that are already on the canvas.
  useEffect(() => {
    if (!initialFlowLoaded.current) return;
    const currentIds = new Set(graph.nodes.map((n) => n.id));
    const added = graph.nodes.filter((n) => !knownNodeIds.current.has(n.id));
    const removed = [...knownNodeIds.current].filter((id) => !currentIds.has(id));

    if (removed.length > 0) {
      const removedIds = new Set(removed);
      setNodes((current) => current.filter((n) => !removedIds.has(n.id)));
      setEdges((current) =>
        current.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target)),
      );
    }

    if (added.length > 0) {
      const fallback = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const incidentNodeIds = incidentNodeIdsOf(graph.edges);

      setNodes((current) => [
        ...current,
        ...added.map((node, index) => {
          const saved = node.x != null && node.y != null ? { x: node.x, y: node.y } : undefined;
          const placement = saved ?? nodePlacements?.[node.id];
          return toFlowNode(
            node,
            incidentNodeIds,
            placement ?? {
              x: fallback.x + index * 32,
              y: fallback.y + index * 32,
            },
          );
        }),
      ]);
    }

    knownNodeIds.current = currentIds;
  }, [
    graph.edges,
    graph.nodes,
    initialFlowLoaded,
    nodePlacements,
    screenToFlowPosition,
    setEdges,
    setNodes,
  ]);

  // Keep the rendered edges in sync with the persisted prerequisite edges so
  // arrows survive a reload of the graph.
  useEffect(() => {
    if (!initialFlowLoaded.current) return;
    setEdges((current) => {
      const desiredIds = new Set(graph.edges.map((e) => `${e.prereqId}-${e.dependentId}`));
      const currentIds = new Set(current.map((e) => e.id));
      const kept = current.filter((e) => desiredIds.has(e.id));
      const additions = graph.edges
        .filter((e) => !currentIds.has(`${e.prereqId}-${e.dependentId}`))
        .map((e) => makeFlowEdge(e.prereqId, e.dependentId));
      if (additions.length === 0 && kept.length === current.length) {
        return current;
      }
      return [...kept, ...additions];
    });
  }, [graph.edges, initialFlowLoaded, setEdges]);

  useEffect(() => {
    if (!initialFlowLoaded.current) return;
    setNodes((current) => {
      let changed = false;
      const updated = current.map((node) => {
        const source = nodeById.get(node.id);
        if (!source) return node;
        const front = graphNodePreview(source.front);
        const back = graphNodePreview(source.back);
        if (
          node.data.front === front &&
          node.data.back === back &&
          node.data.type === source.type &&
          node.data.state === source.state &&
          node.data.locked === source.locked &&
          node.data.archived === source.archived
        ) {
          return node;
        }
        changed = true;
        return {
          ...node,
          data: {
            front,
            back,
            type: source.type,
            state: source.state,
            locked: source.locked,
            archived: source.archived,
            isIsolated: node.data.isIsolated,
            emphasis: node.data.emphasis,
          },
        };
      });
      const withIsolation = refreshNodeData(changed ? updated : current, graph.edges);
      return changed || withIsolation !== current ? withIsolation : current;
    });
  }, [graph.edges, initialFlowLoaded, nodeById, setNodes]);

  return { seedKnownNodes };
}

/**
 * Re-derive selection and search emphasis for every node and edge. The selected
 * card, its incident edges, and its direct neighbors light up; out-of-scope
 * elements dim.
 */
export function useGraphEmphasis({
  graph,
  nodeById,
  selectedId,
  search,
  setNodes,
  setEdges,
}: {
  graph: UiDeckGraph;
  nodeById: Map<string, GraphNode>;
  selectedId: string | null;
  search: ReturnType<typeof useGraphSearch>;
  setNodes: SetNodes;
  setEdges: SetEdges;
}) {
  useEffect(() => {
    const neighborIds = new Set<string>();
    if (selectedId) {
      for (const e of graph.edges) {
        if (e.prereqId === selectedId) neighborIds.add(e.dependentId);
        if (e.dependentId === selectedId) neighborIds.add(e.prereqId);
      }
    }
    setNodes((current) => {
      let changed = false;
      const nextNodes = current.map((node) => {
        const source = nodeById.get(node.id);
        if (!source) return node;
        let emphasis: NodeEmphasis;
        if (selectedId) {
          if (source.id === selectedId) emphasis = "active";
          else if (neighborIds.has(source.id)) emphasis = "connected";
          else emphasis = "dimmed";
        } else if (search.currentMatchId === source.id) {
          emphasis = "active";
        } else if (!search.matches || search.matches.has(source.id)) {
          emphasis = null;
        } else {
          emphasis = "dimmed";
        }
        if (node.data.emphasis === emphasis) return node;
        changed = true;
        return { ...node, data: { ...node.data, emphasis } };
      });
      return changed ? nextNodes : current;
    });

    const searchMatches = search.matches;
    const inScope = (id: string) => nodeById.has(id) && (!searchMatches || searchMatches.has(id));
    setEdges((current) => {
      let changed = false;
      const nextEdges = current.map((edge) => {
        let next: Edge;
        if (selectedId) {
          next = styleEdgeForEmphasis(
            edge,
            edge.source === selectedId || edge.target === selectedId ? "active" : "dimmed",
          );
        } else if (searchMatches) {
          next = styleEdgeForEmphasis(
            edge,
            inScope(edge.source) && inScope(edge.target) ? null : "dimmed",
          );
        } else {
          next = styleEdgeForEmphasis(edge, null);
        }
        if (next !== edge) changed = true;
        return next;
      });
      return changed ? nextEdges : current;
    });
  }, [
    selectedId,
    search.matches,
    search.currentMatchId,
    nodeById,
    graph.nodes,
    graph.edges,
    setNodes,
    setEdges,
  ]);
}
