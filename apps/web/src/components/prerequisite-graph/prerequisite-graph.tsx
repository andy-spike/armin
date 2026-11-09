import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  Position,
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
import "@xyflow/react/dist/style.css";
import "./graph.css";
import { Link2, Pencil, Plus, Unlink, Trash2 } from "lucide-react";
import type { UiDeckGraph } from "@/types/view-models";
import { createGraphCycleIndex, linkProblem } from "@armin/core/prereq-graph";
import {
  EDGE_MARKER_END,
  EDGE_STROKE,
  buildGraphFlowElementsAsync,
  makeFlowEdge,
  refreshNodeData,
} from "@/lib/graph-flow";
import { cn } from "@/lib/utils";
import { FloatingEdge } from "./floating-edge";
import { FlashcardNode, type CardFlowNode } from "./flashcard-node";
import { afterCanvasPaint, markGraphPerf, measureGraphPerf } from "@/lib/graph-perf";
import { GraphContextMenu, type GraphMenuItem } from "./graph-context-menu";
import { GraphToolbar } from "./graph-toolbar";
import { layoutInWorker, useBackgroundLayout } from "./use-background-layout";
import { useGraphSearch } from "./use-graph-search";
import { useGraphElementSync, useGraphEmphasis } from "./use-graph-elements";
import { MAX_ZOOM, MIN_ZOOM, ZoomControl } from "./zoom-control";
import { GraphLinkPicker, linkPickerContent, type LinkPickerRequest } from "./graph-link-picker";

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
  onEdgesChange: (edges: UiDeckGraph["edges"]) => void;
  onConnectError?: (message: string) => void;
  nodePlacements?: Record<string, XYPosition>;
  onCreateCardRequest?: (flowPosition: XYPosition, connectFromNodeId?: string) => void;
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
  useLayoutEffect(() => {
    handlerRef.current = onDoubleClick;
  });

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
  const connectFrom = useRef<string | null>(null);
  const initialFlowLoaded = useRef(false);
  const cancelReadySignal = useRef<(() => void) | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [connectMenu, setConnectMenu] = useState<ConnectMenuState>(null);
  const [linkPicker, setLinkPicker] = useState<LinkPickerRequest | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [flowReady, setFlowReady] = useState(false);
  const [reactFlowReady, setReactFlowReady] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const search = useGraphSearch(graph.nodes, interactive);

  const [nodes, setNodes, onNodesChange] = useNodesState<CardFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const { seedKnownNodes } = useGraphElementSync({
    graph,
    nodeById,
    nodePlacements,
    initialFlowLoaded,
    screenToFlowPosition,
    setNodes,
    setEdges,
  });

  const nodesRef = useRef(nodes);

  const onReadyRef = useRef(onReady);
  useLayoutEffect(() => {
    nodesRef.current = nodes;
    onReadyRef.current = onReady;
  });

  useEffect(() => () => cancelReadySignal.current?.(), []);

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
      measureGraphPerf("buildFlowElements", "buildFlowElements:start", "buildFlowElements:end");
      setNodes(result.nodes);
      setEdges(result.edges);
      seedKnownNodes(graph.nodes.map((n) => n.id));
      initialFlowLoaded.current = true;
      setFlowReady(true);
    });
    return () => controller.abort();
  }, [graph, setNodes, setEdges, seedKnownNodes]);

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

  const graphIndex = useMemo(() => createGraphCycleIndex(graph.edges), [graph.edges]);

  useBackgroundLayout({
    graph,
    nodesRef,
    nodePlacements,
    interactive,
    setNodes,
    onPersistLayout,
  });

  useGraphEmphasis({ graph, nodeById, selectedId, search, setNodes, setEdges });

  const onSelectionChange: OnSelectionChangeFunc = useCallback(({ nodes: selectedNodes }) => {
    setSelectedId(selectedNodes.length === 1 ? selectedNodes[0].id : null);
  }, []);

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
      setEdges((current) => addEdge(makeFlowEdge(prereqId, dependentId), current));
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

      const targetId = connectionState.toNode?.id ?? cardIdAtScreenPoint(screen);

      if (targetId) {
        if (connectionState.toNode && connectionState.isValid) return;
        addLink(sourceId, targetId);
        return;
      }

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
        (candidate) => candidate.source === prereqId && candidate.target === dependentId,
      );
      if (edge) onEdgesDelete([edge]);
    },
    [edges, onEdgesDelete],
  );

  const onBeforeDelete: OnBeforeDelete<CardFlowNode, Edge> = useCallback(
    async ({ edges: candidates }) => ({
      nodes: [],
      edges: candidates.filter((edge) => edge.selected),
    }),
    [],
  );

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    setMenu({ kind: "edge", x: event.clientX, y: event.clientY, edge });
  }, []);

  const onPaneDoubleClick = useCallback(
    (_screen: { x: number; y: number }, flowPosition: XYPosition) => {
      onCreateCardRequest?.(flowPosition);
    },
    [onCreateCardRequest],
  );

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: CardFlowNode) => {
    event.preventDefault();
    setMenu({
      kind: "node",
      x: event.clientX,
      y: event.clientY,
      nodeId: node.id,
    });
  }, []);

  const onCanvasKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const nodeElement = (event.target as HTMLElement).closest<HTMLElement>(".react-flow__node");
      if (!nodeElement) return;
      const nodeId = nodeElement.dataset.id;
      if (!nodeId) return;

      if (event.key === "Enter") {
        event.preventDefault();
        onEditCardRequest?.(nodeId);
      } else if ((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") {
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
    void layoutInWorker({
      all: true,
      nodes: nodesRef.current.map((node) => ({
        id: node.id,
        position: node.position,
        placed: true,
      })),
      edges: edges.map((edge) => ({ source: edge.source, target: edge.target })),
    })
      .then((placements) => {
        const byId = new Map(placements.map((placement) => [placement.flashcardId, placement]));
        const laidOut = nodesRef.current.map((node) => {
          const placement = byId.get(node.id);
          return placement
            ? {
                ...node,
                position: { x: placement.x, y: placement.y },
                targetPosition: Position.Top,
                sourcePosition: Position.Bottom,
              }
            : node;
        });
        setNodes(laidOut);
        persistLayout(laidOut);
        requestAnimationFrame(() => fitView({ padding: 0.2, maxZoom: 1, duration: 300 }));
      })
      .catch(() => undefined);
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
          onClick: () => onCreateCardRequest?.(connectMenu.flow, connectMenu.sourceId),
        },
      ]
    : [];

  const linkPickerConfig = useMemo(
    () => (linkPicker ? linkPickerContent(linkPicker, graph, graphIndex) : null),
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
      <GraphToolbar deckName={deckName} onBack={onBack} search={search} onTidy={onTidy} />
      <ReactFlow
        className={cn(isConnecting && "graph-connecting", !interactive && "pointer-events-none")}
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
        edgesFocusable={false}
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={connectionLineStyle}
        defaultEdgeOptions={defaultEdgeOptions}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.8}
          color="var(--armin-paper-dot)"
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
          maskColor="color-mix(in oklab, var(--color-bg) 60%, transparent)"
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
