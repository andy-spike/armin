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
  useViewport,
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
import {
  ArrowLeft,
  LayoutGrid,
  Link2,
  Maximize,
  Minus,
  Pencil,
  Plus,
  Unlink,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
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
import type {
  GraphLayoutWorkerRequest,
  GraphLayoutWorkerResponse,
} from "@/lib/graph-layout-worker";
import { cn } from "@/lib/utils";
import { TruncatedLabel } from "@/components/ui/truncated-label";
import { FloatingEdge } from "./floating-edge";
import {
  FlashcardNode,
  type CardFlowNode,
  type CardNodeData,
  type NodeEmphasis,
} from "./flashcard-node";
import { GraphContextMenu } from "./graph-context-menu";
import { GraphLinkPicker, type GraphLinkOption } from "./graph-link-picker";

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

// Low enough that Fit view can frame a large deck. The minimap keeps the graph
// navigable when the fitted cards are too small to read.
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;

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
type LinkPickerState =
  | { kind: "add-prereq"; nodeId: string }
  | { kind: "add-dependent"; nodeId: string }
  | { kind: "remove-prereq"; nodeId: string }
  | null;

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

function markGraphPerf(name: string) {
  if (!import.meta.env.DEV && !window.__ARMIN_E2E__) return;
  performance.mark(`armin:graph:${name}`);
}

function measureGraphPerf(name: string, start: string, end: string) {
  if (!import.meta.env.DEV && !window.__ARMIN_E2E__) return;
  try {
    performance.measure(
      `armin:graph:${name}`,
      `armin:graph:${start}`,
      `armin:graph:${end}`,
    );
  } catch {
    // Marks are best-effort in development.
  }
}

function scheduleGraphWork(work: () => void) {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(work, { timeout: 500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = globalThis.setTimeout(work, 0);
  return () => globalThis.clearTimeout(id);
}

function afterCanvasPaint(work: () => void) {
  let done = false;
  let inner = 0;
  const run = () => {
    if (done) return;
    done = true;
    work();
  };
  const outer = requestAnimationFrame(() => {
    inner = requestAnimationFrame(run);
  });
  const timeout = window.setTimeout(run, 250);
  return () => {
    done = true;
    cancelAnimationFrame(outer);
    cancelAnimationFrame(inner);
    window.clearTimeout(timeout);
  };
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

function ZoomControl() {
  const { zoom } = useViewport();
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();
  const [draft, setDraft] = useState<string | null>(null);
  const percent = Math.round(zoom * 100);

  const commit = (raw: string) => {
    setDraft(null);
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, parsed / 100));
    void zoomTo(clamped, { duration: 150 });
  };

  const buttonClass =
    "flex h-7 w-7 items-center justify-center text-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

  return (
    <div className="flex items-center border border-border bg-surface shadow-overlay">
      <button
        type="button"
        onClick={() => void zoomOut({ duration: 150 })}
        aria-label="Zoom out"
        className={buttonClass}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-center border-x border-border px-1">
        <input
          aria-label="Zoom level"
          inputMode="numeric"
          className="w-9 bg-transparent text-right text-xs tabular-nums text-ink outline-none"
          value={draft ?? String(percent)}
          onChange={(event) =>
            setDraft(event.target.value.replace(/[^0-9]/g, ""))
          }
          onFocus={(event) => event.currentTarget.select()}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commit(event.currentTarget.value);
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              setDraft(null);
              event.currentTarget.blur();
            }
          }}
        />
        <span className="pl-0.5 text-xs text-muted">%</span>
      </div>
      <button
        type="button"
        onClick={() => void zoomIn({ duration: 150 })}
        aria-label="Zoom in"
        className={buttonClass}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => void zoomTo(1, { duration: 150 })}
        aria-label="Reset zoom to 100%"
        title="Reset zoom"
        className={cn(buttonClass, "border-l border-border")}
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => void fitView({ padding: 0.2, duration: 300 })}
        aria-label="Fit view"
        className={cn(buttonClass, "border-l border-border")}
      >
        <Maximize className="h-3.5 w-3.5" />
      </button>
    </div>
  );
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
  const backgroundLaidOutIds = useRef(new Set<string>());
  const layoutWorker = useRef<Worker | null>(null);
  const layoutRequestId = useRef(0);
  const cancelReadySignal = useRef<(() => void) | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [connectMenu, setConnectMenu] = useState<ConnectMenuState>(null);
  const [linkPicker, setLinkPicker] = useState<LinkPickerState>(null);
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
  const [search, setSearch] = useState("");
  // Index of the match Enter/Shift+Enter last stepped to, or null while the
  // whole match set is framed.
  const [searchStep, setSearchStep] = useState<number | null>(null);

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

  useEffect(
    () => () => {
      cancelReadySignal.current?.();
      layoutWorker.current?.terminate();
      layoutWorker.current = null;
    },
    [],
  );

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
  const query = search.trim().toLowerCase();
  const searchMatches = useMemo(() => {
    if (query === "") return null;
    const matches = new Set<string>();
    for (const node of graph.nodes) {
      if (`${node.front} ${node.back}`.toLowerCase().includes(query)) {
        matches.add(node.id);
      }
    }
    return matches;
  }, [graph.nodes, query]);
  const searchMatchIds = useMemo(
    () =>
      searchMatches
        ? graph.nodes
            .filter((node) => searchMatches.has(node.id))
            .map((node) => node.id)
        : [],
    [graph.nodes, searchMatches],
  );
  const currentSearchMatchId =
    searchStep === null ? null : (searchMatchIds[searchStep] ?? null);

  // A new query starts back at the full-match overview.
  useEffect(() => {
    setSearchStep(null);
  }, [query]);
  // Keep the current position valid when matches disappear after an edit.
  useEffect(() => {
    setSearchStep((current) => {
      if (current === null) return current;
      if (searchMatchIds.length === 0) return null;
      return Math.min(current, searchMatchIds.length - 1);
    });
  }, [searchMatchIds.length]);

  useEffect(() => {
    if (!interactive || graph.nodes.length === 0) return;
    const placedIds = new Set(
      graph.nodes
        .filter(
          (node) =>
            (node.x != null && node.y != null) || nodePlacements?.[node.id],
        )
        .map((node) => node.id),
    );
    const unplacedIds = graph.nodes
      .filter(
        (node) =>
          !placedIds.has(node.id) && !backgroundLaidOutIds.current.has(node.id),
      )
      .map((node) => node.id);
    if (unplacedIds.length === 0) return;

    let cancelled = false;
    const cancelScheduled = scheduleGraphWork(() => {
      if (cancelled) return;
      markGraphPerf("backgroundLayout:start");
      const worker =
        layoutWorker.current ??
        new Worker(
          new URL("../../lib/graph-layout.worker.ts", import.meta.url),
          {
            type: "module",
          },
        );
      layoutWorker.current = worker;
      const requestId = ++layoutRequestId.current;
      const request: GraphLayoutWorkerRequest = {
        requestId,
        nodes: nodesRef.current.map((node) => ({
          id: node.id,
          position: node.position,
          placed: placedIds.has(node.id),
        })),
        edges: graph.edges.map((edge) => ({
          source: edge.prereqId,
          target: edge.dependentId,
        })),
      };

      worker.onmessage = (event: MessageEvent<GraphLayoutWorkerResponse>) => {
        if (cancelled || event.data.requestId !== layoutRequestId.current) {
          return;
        }
        const placements = event.data.placements;
        if (placements.length > 0) {
          for (const placement of placements) {
            backgroundLaidOutIds.current.add(placement.flashcardId);
          }
          const placementById = new Map(
            placements.map((placement) => [placement.flashcardId, placement]),
          );
          setNodes((current) =>
            current.map((node) => {
              const placement = placementById.get(node.id);
              return placement
                ? { ...node, position: { x: placement.x, y: placement.y } }
                : node;
            }),
          );
          onPersistLayout?.(placements);
        }
        markGraphPerf("backgroundLayout:end");
        measureGraphPerf(
          "backgroundLayout",
          "backgroundLayout:start",
          "backgroundLayout:end",
        );
      };

      worker.onerror = () => {
        worker.terminate();
        if (layoutWorker.current === worker) layoutWorker.current = null;
      };

      worker.postMessage(request);
    });

    return () => {
      cancelled = true;
      cancelScheduled();
    };
  }, [
    graph.edges,
    graph.nodes,
    interactive,
    nodePlacements,
    onPersistLayout,
    setNodes,
  ]);

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
        } else if (currentSearchMatchId && source.id === currentSearchMatchId) {
          emphasis = "active";
        } else if (query === "" || searchMatches?.has(source.id)) {
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

    const lensActive = query !== "";
    const inScope = (id: string) => {
      if (!nodeById.has(id)) return false;
      return query === "" || searchMatches?.has(id) === true;
    };
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
        } else if (lensActive) {
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
    query,
    searchMatches,
    currentSearchMatchId,
    nodeById,
    graph.nodes,
    graph.edges,
    setNodes,
    setEdges,
  ]);

  const revealSearchMatches = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      void fitView({
        nodes: ids.map((id) => ({ id })),
        padding: 0.3,
        maxZoom: 1,
        duration: 300,
      });
    },
    [fitView],
  );

  // Move the viewport to the search matches instead of only dimming the cards
  // already on screen. The search text has to settle briefly so the canvas does
  // not pan on every keystroke; Enter reveals immediately.
  const lastRevealedQuery = useRef("");
  useEffect(() => {
    if (query === "") {
      lastRevealedQuery.current = "";
      return;
    }
    if (!interactive || query === lastRevealedQuery.current) return;
    if (!searchMatches || searchMatches.size === 0) return;
    const timer = window.setTimeout(() => {
      lastRevealedQuery.current = query;
      revealSearchMatches([...searchMatches]);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [interactive, query, revealSearchMatches, searchMatches]);

  // Enter/Shift+Enter step through individual matches, centering each one. The
  // first Enter jumps to the first match of the current query.
  const revealSearchMatch = useCallback(
    (id: string) => {
      void fitView({
        nodes: [{ id }],
        padding: 0.4,
        maxZoom: 1,
        duration: 300,
      });
    },
    [fitView],
  );

  const stepSearch = (direction: 1 | -1) => {
    if (query === "" || searchMatchIds.length === 0) return;
    const next =
      searchStep === null
        ? direction === 1
          ? 0
          : searchMatchIds.length - 1
        : (searchStep + direction + searchMatchIds.length) %
          searchMatchIds.length;
    lastRevealedQuery.current = query;
    setSearchStep(next);
    revealSearchMatch(searchMatchIds[next]);
  };

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

  const nodeMenuId = menu?.kind === "node" ? menu.nodeId : null;
  const nodeHasPrerequisites = nodeMenuId
    ? graph.edges.some((edge) => edge.dependentId === nodeMenuId)
    : false;

  const menuItems = nodeMenuId
    ? [
        {
          label: "Edit flashcard",
          icon: <Pencil className="h-4 w-4" />,
          onClick: () => onEditCardRequest?.(nodeMenuId),
        },
        {
          label: "Add prerequisite…",
          icon: <Link2 className="h-4 w-4" />,
          onClick: () =>
            setLinkPicker({ kind: "add-prereq", nodeId: nodeMenuId }),
        },
        {
          label: "Add dependent…",
          icon: <Link2 className="h-4 w-4" />,
          onClick: () =>
            setLinkPicker({ kind: "add-dependent", nodeId: nodeMenuId }),
        },
        ...(nodeHasPrerequisites
          ? [
              {
                label: "Remove prerequisite…",
                icon: <Unlink className="h-4 w-4" />,
                onClick: () =>
                  setLinkPicker({ kind: "remove-prereq", nodeId: nodeMenuId }),
              },
            ]
          : []),
        {
          label: "Delete flashcard",
          icon: <Trash2 className="h-4 w-4" />,
          variant: "destructive" as const,
          // Opens the confirmation dialog; the card is only deleted there.
          onClick: () => onDeleteCardRequest(nodeMenuId),
        },
      ]
    : menu?.kind === "edge"
      ? [
          {
            label: "Remove link",
            icon: <Unlink className="h-4 w-4" />,
            variant: "destructive" as const,
            onClick: () => onEdgesDelete([menu.edge]),
          },
        ]
      : [];

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

  const linkPickerConfig = useMemo(() => {
    if (!linkPicker) return null;
    const picker = linkPicker;
    const node = nodeById.get(picker.nodeId);
    if (!node) return null;
    const front = graphNodePreview(node.front);

    const optionsFor = (ids: string[]): GraphLinkOption[] =>
      ids
        .map((id) => nodeById.get(id))
        .filter((candidate) => candidate !== undefined)
        .map((candidate) => ({
          id: candidate.id,
          label: graphNodePreview(candidate.front),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

    if (picker.kind === "remove-prereq") {
      return {
        title: "Remove prerequisite",
        description: `Choose the prerequisite link to “${front}” that should be removed.`,
        options: optionsFor(
          graph.edges
            .filter((edge) => edge.dependentId === picker.nodeId)
            .map((edge) => edge.prereqId),
        ),
        emptyText: "This card has no prerequisites.",
        onPick: (id: string) => {
          removeLink(id, picker.nodeId);
          setLinkPicker(null);
        },
      };
    }

    const candidateIds = graph.nodes
      .filter((candidate) => {
        const prereqId =
          picker.kind === "add-prereq" ? candidate.id : picker.nodeId;
        const dependentId =
          picker.kind === "add-prereq" ? picker.nodeId : candidate.id;
        return linkProblem(graphIndex, prereqId, dependentId) === null;
      })
      .map((candidate) => candidate.id);

    return {
      title:
        picker.kind === "add-prereq" ? "Add prerequisite" : "Add dependent",
      description:
        picker.kind === "add-prereq"
          ? `Choose a card that “${front}” should depend on.`
          : `Choose a card that should depend on “${front}”.`,
      options: optionsFor(candidateIds),
      emptyText:
        picker.kind === "add-prereq"
          ? "No card can be added as a prerequisite."
          : "No card can be added as a dependent.",
      onPick: (id: string) => {
        addLink(
          picker.kind === "add-prereq" ? id : picker.nodeId,
          picker.kind === "add-prereq" ? picker.nodeId : id,
        );
        setLinkPicker(null);
      },
    };
  }, [
    addLink,
    graph.edges,
    graph.nodes,
    graphIndex,
    linkPicker,
    nodeById,
    removeLink,
  ]);

  return (
    <>
      {/* The toolbar lives before the canvas in the DOM so keyboard users reach
          Search and Tidy before tabbing through every card. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 @container">
        <div className="flex items-center gap-2 *:pointer-events-auto">
          {(onBack || deckName) && (
            <button
              type="button"
              onClick={onBack}
              disabled={!onBack}
              aria-label={deckName ? `Back to ${deckName}` : "Back to deck"}
              className="flex h-8 min-w-0 items-center gap-1.5 border border-border bg-surface px-2 text-xs font-medium text-ink shadow-overlay transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:hover:bg-surface"
            >
              {onBack && (
                <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-muted" />
              )}
              {deckName && (
                <TruncatedLabel
                  label={deckName}
                  side="bottom"
                  className="max-w-44"
                />
              )}
            </button>
          )}
          <div className="relative flex h-8 min-w-28 flex-1 items-center gap-1.5 border border-border bg-surface px-2 shadow-overlay focus-within:ring-2 focus-within:ring-accent @xl:flex-none">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
            <input
              aria-label="Search flashcards"
              placeholder="Search cards…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  searchMatches &&
                  searchMatches.size > 0
                ) {
                  event.preventDefault();
                  stepSearch(event.shiftKey ? -1 : 1);
                }
              }}
              className="w-full min-w-0 bg-transparent text-xs text-ink outline-none placeholder:text-muted @xl:w-40"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="text-muted transition-colors hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {query !== "" && (
              <p
                role="status"
                title={
                  searchStep !== null
                    ? "Shift+Enter for the previous match"
                    : undefined
                }
                className="pointer-events-none absolute top-full left-0 mt-1 w-max max-w-64 border border-border bg-surface px-2 py-1 text-[0.6875rem] leading-snug text-muted shadow-overlay"
              >
                {searchMatches && searchMatches.size > 0
                  ? searchStep !== null
                    ? `${Math.min(searchStep + 1, searchMatchIds.length)} of ${searchMatchIds.length} · Enter for next`
                    : `${searchMatches.size} ${searchMatches.size === 1 ? "match" : "matches"} · Enter to step through`
                  : `No cards match “${search.trim()}”.`}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onTidy}
            aria-label="Tidy layout"
            className="ml-auto inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 border border-border bg-surface px-2.5 text-xs font-medium text-ink shadow-overlay transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>
              Tidy<span className="hidden @xl:inline"> layout</span>
            </span>
          </button>
        </div>
      </div>
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
        onPick={(id) => linkPickerConfig?.onPick(id)}
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
