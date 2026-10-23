import {
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { XYPosition } from "@xyflow/react";
import type {
  GraphLayoutWorkerRequest,
  GraphLayoutWorkerResponse,
} from "@/lib/graph-layout-worker";
import {
  markGraphPerf,
  measureGraphPerf,
  scheduleGraphWork,
} from "@/lib/graph-perf";
import type { UiDeckGraph } from "@/types/view-models";
import type { CardFlowNode } from "./flashcard-node";

type NodePlacement = { flashcardId: string; x: number; y: number };

/**
 * Give cards without a saved or pending position a place on the canvas. Once
 * the graph is interactive, a Web Worker lays out the unplaced cards around
 * the placed ones while the browser is idle; the result is applied and saved.
 * Each card is laid out at most once per canvas.
 */
export function useBackgroundLayout({
  graph,
  nodesRef,
  nodePlacements,
  interactive,
  setNodes,
  onPersistLayout,
}: {
  graph: UiDeckGraph;
  /** Always-current canvas nodes, read when the layout starts. */
  nodesRef: RefObject<CardFlowNode[]>;
  nodePlacements?: Record<string, XYPosition>;
  interactive: boolean;
  setNodes: Dispatch<SetStateAction<CardFlowNode[]>>;
  onPersistLayout?: (placements: NodePlacement[]) => void;
}) {
  const backgroundLaidOutIds = useRef(new Set<string>());
  const layoutWorker = useRef<Worker | null>(null);
  const layoutRequestId = useRef(0);

  useEffect(
    () => () => {
      layoutWorker.current?.terminate();
      layoutWorker.current = null;
    },
    [],
  );

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
}
