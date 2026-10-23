import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  ConnectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type IsValidConnection,
  type OnConnectEnd,
  type OnBeforeDelete,
  type OnConnectStart,
  type OnEdgesDelete,
  type OnSelectionChangeFunc,
  type Viewport,
  type XYPosition,
} from "@xyflow/react";
// Loaded with the graph page's code instead of on every page.
import "@xyflow/react/dist/style.css";
import "./graph.css";
import { Link2, Pencil, Plus, Unlink, Trash2 } from "lucide-react";
import type { UiDeckGraph } from "@/types/view-models";
import { createGraphCycleIndex, linkProblem } from "@/lib/graph-cycle";
import {
  EDGE_MARKER_END,
  EDGE_STROKE,
  buildGraphFlowElementsAsync,
  graphNodePreview,
  incidentNodeIdsOf,
  makeFlowEdge,
  refreshNodeData,
  styleEdgeForEmphasis,
  toFlowNode,
} from "@/lib/graph-flow";
import { layoutGraph } from "@/lib/graph-layout";
import { cn } from "@/lib/utils";
import { FloatingEdge } from "./floating-edge";
import {
  FlashcardNode,
  type CardFlowNode,
  type CardNodeData,
  type NodeEmphasis,
} from "./flashcard-node";
import {
  afterCanvasPaint,
  markGraphPerf,
  measureGraphPerf,
} from "@/lib/graph-perf";
import { GraphContextMenu, type GraphMenuItem } from "./graph-context-menu";
import { GraphToolbar } from "./graph-toolbar";
import { useBackgroundLayout } from "./use-background-layout";
import { useGraphSearch } from "./use-graph-search";
import { MAX_ZOOM, MIN_ZOOM, ZoomControl } from "./zoom-control";
import {
  GraphLinkPicker,
  linkPickerContent,
  type LinkPickerRequest,
} from "./graph-link-picker";

const nodeTypes = { card: FlashcardNode };
const edgeTypes = { floating: FloatingEdge };
const fitViewOptions = { padding: 0.2, maxZoom: 1 };
const connectionLineStyle = {
  stroke: "var(--color-accent)",
  strokeWidth: 1.5,
};
const defaultEdgeOptions = {
  type: "floating",
  style: { stroke: EDGE_STROKE, strokeWidth: 1.5 },
  markerEnd: EDGE_MARKER_END,
};

// First-open framing when there's no saved viewport. We deliberately do NOT
// fit the whole graph on open: fitting a large Deck brings every node on-screen,
// which (with virtualization) would force all of them to render at once. Landing
// at a normal zoom keeps the first paint to a screenful of cards; the Fit-view
// control frames the whole graph on demand.
const DEFAULT_VIEWPORT: Viewport = { x: 48, y: 48, zoom: 1 };

type NodePlacement = { flashcardId: string; x: number; y: number };

type MenuState =
  | { kind: "node"; x: number; y: number; nodeId: string }
  | { kind: "edge"; x: number; y: number; edge: Edge }
  | null;
type ConnectMenuState = {
  x: number;
  y: number;
  flow: XYPosition;
  sourceId: string;
} | null;

type PrerequisiteGraphProps = {
  graph: UiDeckGraph;
  deckName?: string;
  onBack?: () => void;
  /** Called with the full link list after the user adds or removes links. */
  onEdgesChange: (edges: UiDeckGraph["edges"]) => void;
  onConnectError?: (message: string) => void;
  nodePlacements?: Record<string, XYPosition>;
  onCreateCardRequest?: (
    flowPosition: XYPosition,
    connectFromNodeId?: string,
  ) => void;
  onEditCardRequest?: (nodeId: string) => void;
  onDeleteCardRequest: (nodeId: string) => void;
  onPersistLayout?: (placements: NodePlacement[]) => void;
  initialViewport?: Viewport;
  onViewportChange?: (viewport: Viewport) => void;
  onReady?: () => void;
};

function savedPositionsOf(graph: UiDeckGraph): Map<string, XYPosition> {
  const map = new Map<string, XYPosition>();
  for (const node of graph.nodes) {
    if (node.x != null && node.y != null) {
      map.set(node.id, { x: node.x, y: node.y });
    }
  }
  return map;
}

/** Card under a screen point, or null when the pointer is on the pane. */
function cardIdAtScreenPoint(point: { x: number; y: number }) {
  const element = document.elementFromPoint(point.x, point.y);
  const card = element?.closest<HTMLElement>(".react-flow__node");
  return card?.dataset.id ?? null;
}

function PaneDoubleClickListener({
  onDoubleClick,
}: {
  onDoubleClick: (screen: { x: number; y: number }, flow: XYPosition) => void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const handlerRef = useRef(onDoubleClick);
  handlerRef.current = onDoubleClick;

  useEffect(() => {
    const onDblClick = (event: Event) => {
      if (!(event instanceof MouseEvent)) return;
      const target = event.target as HTMLElement;
      if (!target.classList.contains("react-flow__pane")) return;
      event.preventDefault();
      handlerRef.current(
        { x: event.clientX, y: event.clientY },
        screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      );
    };

    const pane = document.querySelector(".react-flow__pane");
    pane?.addEventListener("dblclick", onDblClick);
    return () => pane?.removeEventListener("dblclick", onDblClick);
  }, [screenToFlowPosition]);

  return null;
}

function PrerequisiteGraphCanvas({
  graph,
  deckName,
  onBack,
  onEdgesChange: onGraphEdgesChange,
  onConnectError,
  nodePlacements,
  onCreateCardRequest,
  onEditCardRequest,
  onDeleteCardRequest,
  onPersistLayout,
  initialViewport,
  onViewportChange,
  onReady,
}: PrerequisiteGraphProps) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const knownNodeIds = useRef(new Set<string>());
  const connectFrom = useRef<string | null>(null);
  // Set once the async builder commits the first real graph; the incremental
  // sync effects below stay dormant until then so they don't fight the build.
  const initialFlowLoaded = useRef(false);
  const cancelReadySignal = useRef<(() => void) | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [connectMenu, setConnectMenu] = useState<ConnectMenuState>(null);
  const [linkPicker, setLinkPicker] = useState<LinkPickerRequest | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [interactive, setInteractive] = useState(false);
  // Two-part readiness gate: `flowReady` once the async build commits nodes and
  // edges, `reactFlowReady` once ReactFlow's `onInit` fires. Marking the graph
  // interactive needs both, so we never signal ready on the empty init.
  const [flowReady, setFlowReady] = useState(false);
  const [reactFlowReady, setReactFlowReady] = useState(false);

  // Selection + search lens. The selected card lights up itself, its edges, and
  // its direct neighbors; search dims everything outside its scope.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const search = useGraphSearch(graph.nodes, interactive);

  // Start ReactFlow empty: the initial conversion happens off the render path in
  // an abortable, chunked effect (see below) so a large Deck graph can't freeze
  // the renderer while it mounts.
  const [nodes, setNodes, onNodesChange] = useNodesState<CardFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Always-fresh snapshot of node positions for layout persistence.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Keep `onReady` in a ref so the readiness effect doesn't re-run (and cancel a
  // pending ready signal) when the parent passes a fresh callback identity.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => () => cancelReadySignal.current?.(), []);

  // Convert the persisted graph into ReactFlow elements off the render path, in
  // an abortable chunked task. Runs once for the initial graph; afterwards the
  // incremental sync effects own updates. If the route unmounts (or the graph is
  // replaced) before the build finishes, the controller aborts and the stale
  // result is dropped instead of being committed into an unmounted canvas.
  useEffect(() => {
    if (initialFlowLoaded.current) return;
    const controller = new AbortController();
    const { signal } = controller;
    setFlowReady(false);
    setInteractive(false);
    markGraphPerf("buildFlowElements:start");
    void buildGraphFlowElementsAsync(graph, savedPositionsOf(graph), {
      signal,
    }).then((result) => {
      if (!result || signal.aborted) return;
      markGraphPerf("buildFlowElements:end");
      measureGraphPerf(
        "buildFlowElements",
        "buildFlowElements:start",
        "buildFlowElements:end",
      );
      setNodes(result.nodes);
      setEdges(result.edges);
      knownNodeIds.current = new Set(graph.nodes.map((n) => n.id));
      initialFlowLoaded.current = true;
      setFlowReady(true);
    });
    return () => controller.abort();
  }, [graph, setNodes, setEdges]);

  // Signal ready only after both the async build has committed real nodes/edges
  // and ReactFlow has initialized, then reveal the canvas on the next paint. We
  // don't fit-to-all here: framing is handled by `defaultViewport` so the first
  // paint stays cheap (see DEFAULT_VIEWPORT).
  useEffect(() => {
    if (!flowReady || !reactFlowReady || interactive) return;
    cancelReadySignal.current?.();
    cancelReadySignal.current = afterCanvasPaint(() => {
      cancelReadySignal.current = null;
      markGraphPerf("interactive:end");
      measureGraphPerf("interactive", "routeRender:start", "interactive:end");
      setInteractive(true);
      onReadyRef.current?.();
    });
    return () => {
      cancelReadySignal.current?.();
      cancelReadySignal.current = null;
    };
  }, [flowReady, reactFlowReady, interactive]);

  const nodeById = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n])),
    [graph.nodes],
  );
  const graphIndex = useMemo(
    () => createGraphCycleIndex(graph.edges),
    [graph.edges],
  );

  // Incrementally add/remove nodes as the underlying deck changes, preserving
  // the positions of cards that are already on the canvas.
  useEffect(() => {
    if (!initialFlowLoaded.current) return;
    const currentIds = new Set(graph.nodes.map((n) => n.id));
    const added = graph.nodes.filter((n) => !knownNodeIds.current.has(n.id));
    const removed = [...knownNodeIds.current].filter(
      (id) => !currentIds.has(id),
    );

    if (removed.length > 0) {
      const removedIds = new Set(removed);
      setNodes((current) => current.filter((n) => !removedIds.has(n.id)));
      setEdges((current) =>
        current.filter(
          (e) => !removedIds.has(e.source) && !removedIds.has(e.target),
        ),
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
          const saved =
            node.x != null && node.y != null
              ? { x: node.x, y: node.y }
              : undefined;
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
      const desiredIds = new Set(
        graph.edges.map((e) => `${e.prereqId}-${e.dependentId}`),
      );
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
  }, [graph.edges, setEdges]);

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
      const withIsolation = refreshNodeData(
        changed ? updated : current,
        graph.edges,
      );
      return changed || withIsolation !== current ? withIsolation : current;
    });
  }, [graph.edges, nodeById, setNodes]);

  useBackgroundLayout({
    graph,
    nodesRef,
    nodePlacements,
    interactive,
    setNodes,
    onPersistLayout,
  });

  // Re-derive selection/filter emphasis for every node and edge whenever the
  // selection or lens changes. Selected card + its incident edges + direct
  // neighbors light up; out-of-scope elements dim.
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
    const inScope = (id: string) =>
      nodeById.has(id) && (!searchMatches || searchMatches.has(id));
    setEdges((current) => {
      let changed = false;
      const nextEdges = current.map((edge) => {
        let next: Edge;
        if (selectedId) {
          next = styleEdgeForEmphasis(
            edge,
            edge.source === selectedId || edge.target === selectedId
              ? "active"
              : "dimmed",
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

  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodes }) => {
      setSelectedId(selectedNodes.length === 1 ? selectedNodes[0].id : null);
    },
    [],
  );

  const persistLayout = useCallback(
    (flowNodes: CardFlowNode[]) => {
      onPersistLayout?.(
        flowNodes.map((node) => ({
          flashcardId: node.id,
          x: node.position.x,
          y: node.position.y,
        })),
      );
    },
    [onPersistLayout],
  );

  const syncEdges = useCallback(
    (nextEdges: UiDeckGraph["edges"]) => {
      onGraphEdgesChange(nextEdges);
      setNodes((current) => refreshNodeData(current, nextEdges));
    },
    [onGraphEdgesChange, setNodes],
  );

  const isValidConnection: IsValidConnection = useCallback(
    (connection) => {
      const { source, target } = connection;
      if (!source || !target) return false;
      return linkProblem(graphIndex, source, target) === null;
    },
    [graphIndex],
  );

  const addLink = useCallback(
    (prereqId: string, dependentId: string) => {
      const problem = linkProblem(graphIndex, prereqId, dependentId);
      if (problem) {
        onConnectError?.(problem);
        return false;
      }
      setEdges((current) =>
        addEdge(makeFlowEdge(prereqId, dependentId), current),
      );
      syncEdges([...graph.edges, { prereqId, dependentId }]);
      return true;
    },
    [graph.edges, graphIndex, onConnectError, setEdges, syncEdges],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const { source, target } = connection;
      if (!source || !target) return;
      addLink(source, target);
    },
    [addLink],
  );

  const onConnectStart: OnConnectStart = useCallback((_, params) => {
    setIsConnecting(true);
    connectFrom.current = params.nodeId ?? null;
  }, []);

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      setIsConnecting(false);
      const sourceId = connectFrom.current;
      connectFrom.current = null;

      if (!sourceId) return;

      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      if (!point) return;
      const screen = { x: point.clientX, y: point.clientY };

      // React Flow only reports `toNode` for a handle target. A release over a
      // card's body carries the same intent, so resolve the card under the
      // pointer and run it through the shared link validation instead of
      // treating it as an empty-pane release.
      const targetId =
        connectionState.toNode?.id ?? cardIdAtScreenPoint(screen);

      if (targetId) {
        // A valid handle drop already reached onConnect; only rejected drops
        // need the shared validation's toast.
        if (connectionState.toNode && connectionState.isValid) return;
        addLink(sourceId, targetId);
        return;
      }

      // Only an empty-pane release opens the add-card popup.
      setConnectMenu({
        x: screen.x,
        y: screen.y,
        flow: screenToFlowPosition(screen),
        sourceId,
      });
    },
    [addLink, screenToFlowPosition],
  );

  const onEdgesDelete: OnEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      const deletedIds = new Set(deleted.map((e) => e.id));
      const nextEdges = graph.edges.filter(
        (e) => !deletedIds.has(`${e.prereqId}-${e.dependentId}`),
      );
      setEdges((current) => current.filter((e) => !deletedIds.has(e.id)));
      syncEdges(nextEdges);
    },
    [graph.edges, setEdges, syncEdges],
  );

  const removeLink = useCallback(
    (prereqId: string, dependentId: string) => {
      const edge = edges.find(
        (candidate) =>
          candidate.source === prereqId && candidate.target === dependentId,
      );
      if (edge) onEdgesDelete([edge]);
    },
    [edges, onEdgesDelete],
  );

  // Delete and Backspace remove links the user explicitly selected. React Flow
  // also puts every edge attached to a selected card in this candidate set, so
  // only keep edges with their own selection; the card itself is never deleted
  // by a keypress (that goes through the confirmation dialog).
  const onBeforeDelete: OnBeforeDelete<CardFlowNode, Edge> = useCallback(
    async ({ edges: candidates }) => ({
      nodes: [],
      edges: candidates.filter((edge) => edge.selected),
    }),
    [],
  );

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setMenu({ kind: "edge", x: event.clientX, y: event.clientY, edge });
    },
    [],
  );

  const onPaneDoubleClick = useCallback(
    (_screen: { x: number; y: number }, flowPosition: XYPosition) => {
      onCreateCardRequest?.(flowPosition);
    },
    [onCreateCardRequest],
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: CardFlowNode) => {
      event.preventDefault();
      setMenu({
        kind: "node",
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
      });
    },
    [],
  );

  // Focusable cards support the same actions from the keyboard: Enter opens the
  // editor, and Shift+F10 or the Context Menu key opens the node menu.
  const onCanvasKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const nodeElement = (event.target as HTMLElement).closest<HTMLElement>(
        ".react-flow__node",
      );
      if (!nodeElement) return;
      const nodeId = nodeElement.dataset.id;
      if (!nodeId) return;

      if (event.key === "Enter") {
        event.preventDefault();
        onEditCardRequest?.(nodeId);
      } else if (
        (event.key === "F10" && event.shiftKey) ||
        event.key === "ContextMenu"
      ) {
        event.preventDefault();
        const rect = nodeElement.getBoundingClientRect();
        setMenu({
          kind: "node",
          x: rect.left + 12,
          y: rect.top + 12,
          nodeId,
        });
      }
    },
    [onEditCardRequest],
  );

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: CardFlowNode) => {
      onEditCardRequest?.(node.id);
    },
    [onEditCardRequest],
  );

  const onNodeDragStop = useCallback(() => {
    persistLayout(nodesRef.current);
  }, [persistLayout]);

  const onTidy = useCallback(() => {
    const { nodes: laidOut } = layoutGraph<CardNodeData>(
      nodesRef.current,
      edges,
    );
    const typed = laidOut as CardFlowNode[];
    setNodes(typed);
    persistLayout(typed);
    requestAnimationFrame(() =>
      fitView({ padding: 0.2, maxZoom: 1, duration: 300 }),
    );
  }, [edges, fitView, persistLayout, setNodes]);

  function menuItemsFor(current: MenuState): GraphMenuItem[] {
    if (current?.kind === "edge") {
      return [
        {
          label: "Remove link",
          icon: <Unlink className="h-4 w-4" />,
          variant: "destructive",
          onClick: () => onEdgesDelete([current.edge]),
        },
      ];
    }
    if (current?.kind !== "node") return [];

    const nodeId = current.nodeId;
    const items: GraphMenuItem[] = [
      {
        label: "Edit flashcard",
        icon: <Pencil className="h-4 w-4" />,
        onClick: () => onEditCardRequest?.(nodeId),
      },
      {
        label: "Add prerequisite…",
        icon: <Link2 className="h-4 w-4" />,
        onClick: () => setLinkPicker({ kind: "add-prereq", nodeId }),
      },
      {
        label: "Add dependent…",
        icon: <Link2 className="h-4 w-4" />,
        onClick: () => setLinkPicker({ kind: "add-dependent", nodeId }),
      },
    ];
    if (graph.edges.some((edge) => edge.dependentId === nodeId)) {
      items.push({
        label: "Remove prerequisite…",
        icon: <Unlink className="h-4 w-4" />,
        onClick: () => setLinkPicker({ kind: "remove-prereq", nodeId }),
      });
    }
    items.push({
      label: "Delete flashcard",
      icon: <Trash2 className="h-4 w-4" />,
      variant: "destructive",
      // Opens the confirmation dialog; the card is only deleted there.
      onClick: () => onDeleteCardRequest(nodeId),
    });
    return items;
  }

  const menuItems = menuItemsFor(menu);
  const connectMenuItems = connectMenu
    ? [
        {
          label: "Add connected flashcard",
          icon: <Plus className="h-4 w-4" />,
          onClick: () =>
            onCreateCardRequest?.(connectMenu.flow, connectMenu.sourceId),
        },
      ]
    : [];

  const linkPickerConfig = useMemo(
    () =>
      linkPicker ? linkPickerContent(linkPicker, graph, graphIndex) : null,
    [graph, graphIndex, linkPicker],
  );

  const pickLink = (id: string) => {
    if (!linkPickerConfig) return;
    const link = linkPickerConfig.linkFor(id);
    if (link.action === "add") addLink(link.prereqId, link.dependentId);
    else removeLink(link.prereqId, link.dependentId);
    setLinkPicker(null);
  };

  return (
    <>
      <GraphToolbar
        deckName={deckName}
        onBack={onBack}
        search={search}
        onTidy={onTidy}
      />
      <ReactFlow
        className={cn(
          isConnecting && "graph-connecting",
          // Keep the still-loading canvas from capturing pointer events so the
          // surrounding app stays clickable while the graph builds.
          !interactive && "pointer-events-none",
        )}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        onEdgesDelete={onEdgesDelete}
        onBeforeDelete={onBeforeDelete}
        onEdgeContextMenu={onEdgeContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeDragStop={onNodeDragStop}
        onKeyDown={onCanvasKeyDown}
        onSelectionChange={onSelectionChange}
        onMoveEnd={(_, viewport) => onViewportChange?.(viewport)}
        onInit={() => {
          markGraphPerf("reactFlow:onInit");
          // ReactFlow may init before the async build commits real nodes; the
          // readiness effect waits for both before signalling ready, so we never
          // mark interactive on the empty init.
          setReactFlowReady(true);
        }}
        defaultViewport={initialViewport ?? DEFAULT_VIEWPORT}
        fitViewOptions={fitViewOptions}
        onlyRenderVisibleElements
        connectionMode={ConnectionMode.Loose}
        connectionRadius={36}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        zoomOnDoubleClick={false}
        nodesDraggable
        nodesConnectable
        elementsSelectable
        // Links are removable from the card menu pickers, so keeping dozens of
        // invisible edge stops out of the tab order gets keyboard users to the
        // cards faster.
        edgesFocusable={false}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={connectionLineStyle}
        defaultEdgeOptions={defaultEdgeOptions}
      >
        <Background
          variant={BackgroundVariant.Cross}
          gap={24}
          size={1}
          color="var(--armin-grid-v)"
        />
        <Panel position="bottom-right">
          <ZoomControl />
        </Panel>
        <MiniMap
          pannable
          zoomable
          position="bottom-left"
          className="hidden md:block"
          style={{ width: 160, height: 110 }}
          bgColor="var(--color-surface)"
          maskColor="var(--color-bg)"
          maskStrokeColor="var(--color-muted)"
          maskStrokeWidth={1}
          nodeColor="var(--color-border-strong)"
          nodeStrokeColor="var(--color-surface)"
          nodeStrokeWidth={2}
          nodeBorderRadius={2}
        />
        <PaneDoubleClickListener onDoubleClick={onPaneDoubleClick} />
      </ReactFlow>

      <GraphContextMenu
        open={menu !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={menuItems}
        onClose={() => setMenu(null)}
      />

      <GraphContextMenu
        open={connectMenu !== null}
        x={connectMenu?.x ?? 0}
        y={connectMenu?.y ?? 0}
        items={connectMenuItems}
        onClose={() => setConnectMenu(null)}
      />

      <GraphLinkPicker
        open={linkPickerConfig !== null}
        title={linkPickerConfig?.title ?? ""}
        description={linkPickerConfig?.description ?? ""}
        options={linkPickerConfig?.options ?? []}
        emptyText={linkPickerConfig?.emptyText ?? ""}
        onPick={pickLink}
        onClose={() => setLinkPicker(null)}
      />
    </>
  );
}

export function PrerequisiteGraph(props: PrerequisiteGraphProps) {
  return (
    <div className="relative h-full w-full">
      <ReactFlowProvider>
        <PrerequisiteGraphCanvas {...props} />
      </ReactFlowProvider>
    </div>
  );
}
