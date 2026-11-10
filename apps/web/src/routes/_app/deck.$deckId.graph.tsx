import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  deckQuery as deckQueryOptions,
  graphQuery as graphQueryOptions,
  prefetchGraphPage,
} from "@/lib/queries";
import { useStudyClock } from "@/lib/study-clock";
import { armin } from "@/lib/armin-client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";
import type { Viewport, XYPosition } from "@xyflow/react";
import { FlashcardFormDialog } from "@/components/flashcard-form-dialog-lazy";
import { PrerequisiteGraph } from "@/components/prerequisite-graph/prerequisite-graph";
import { Button } from "@/components/ui/button";
import { GraphSkeleton } from "@/components/page-skeletons";
import { DeleteFlashcardDialog } from "@/components/delete-consequences-list";
import { AllDecksLink, DeckNotFound } from "@/components/deck-not-found";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { useGraphCanvasEdits } from "@/lib/use-graph-canvas-edits";
import { useDeleteConsequences } from "@/lib/use-delete-consequences";
import {
  type FlashcardContent,
  type FlashcardType,
  toUiDeckGraph,
  type UiDeckGraph,
} from "@/types/view-models";
import { cn } from "@/lib/utils";
import { afterCanvasPaint, markGraphPerf, measureGraphPerf } from "@/lib/graph-perf";

function readSavedViewport(storageKey: string): Viewport | undefined {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<Viewport>;
    if (
      typeof parsed.x === "number" &&
      typeof parsed.y === "number" &&
      typeof parsed.zoom === "number"
    ) {
      return { x: parsed.x, y: parsed.y, zoom: parsed.zoom };
    }
  } catch {}
  return undefined;
}

type CardDialogState =
  | { mode: "closed" }
  | {
      mode: "create";
      open: boolean;
      placement: XYPosition | null;
      connectFrom: string | null;
    }
  | {
      mode: "edit";
      open: boolean;
      id: string;
      version: number | null;
      type: FlashcardType;
      content: FlashcardContent | null;
    };

function DeckGraphPage() {
  const { resolvedDeckId: deckId, deckSlug } = Route.useRouteContext();
  const navigate = useNavigate();
  const toast = useToast();
  useState(() => markGraphPerf("routeRender:start"));

  const viewportStorageKey = `armin:graph-viewport:${deckId}`;
  const [initialViewport] = useState<Viewport | undefined>(() =>
    readSavedViewport(viewportStorageKey),
  );

  const persistViewport = (viewport: Viewport) => {
    try {
      localStorage.setItem(viewportStorageKey, JSON.stringify(viewport));
    } catch {}
  };

  const deckQuery = useQuery(deckQueryOptions(deckId, useStudyClock()));

  const graphQuery = useQuery({ ...graphQueryOptions(deckId), enabled: Boolean(deckQuery.data) });

  const persistedGraph = useMemo(() => {
    if (!graphQuery.data) return null;
    markGraphPerf("toUiDeckGraph:start");
    const graph = toUiDeckGraph(graphQuery.data, deckId);
    markGraphPerf("toUiDeckGraph:end");
    measureGraphPerf("toUiDeckGraph", "toUiDeckGraph:start", "toUiDeckGraph:end");
    return graph;
  }, [graphQuery.data, deckId]);

  const skeletonNodes = useMemo(
    () =>
      persistedGraph?.nodes.flatMap((node) =>
        node.x !== null && node.y !== null ? [{ x: node.x, y: node.y }] : [],
      ),
    [persistedGraph],
  );

  const [graph, setGraph] = useState<UiDeckGraph>({ nodes: [], edges: [] });
  const [cardDialog, setCardDialog] = useState<CardDialogState>({ mode: "closed" });
  const cardDialogRequest = useRef(0);
  const deleteConsequences = useDeleteConsequences();

  const [graphReady, setGraphReady] = useState(false);
  const [canvasMounted, setCanvasMounted] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  const [syncedGraph, setSyncedGraph] = useState<UiDeckGraph | null>(null);
  if (persistedGraph && persistedGraph !== syncedGraph) {
    setSyncedGraph(persistedGraph);
    setGraph(persistedGraph);
    setGraphReady(true);
  }

  useEffect(() => {
    if (!graphReady || canvasMounted) return;
    return afterCanvasPaint(() => {
      markGraphPerf("reactFlow:mount");
      setCanvasMounted(true);
    }, 100);
  }, [graphReady, canvasMounted]);

  const closeDialog = () =>
    setCardDialog((current) => (current.mode === "closed" ? current : { ...current, open: false }));

  const handleDialogExitComplete = () =>
    setCardDialog((current) =>
      current.mode !== "closed" && current.open ? current : { mode: "closed" },
    );

  const openCreate = (placement?: XYPosition, connectFromNodeId?: string) => {
    cardDialogRequest.current += 1;
    setCardDialog({
      mode: "create",
      open: true,
      placement: placement ?? null,
      connectFrom: connectFromNodeId ?? null,
    });
  };

  const openEdit = async (nodeId: string) => {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const request = ++cardDialogRequest.current;
    const card = await armin.flashcards.get(nodeId);
    if (cardDialogRequest.current !== request) return;
    setCardDialog({
      mode: "edit",
      open: true,
      id: nodeId,
      version: card?.version ?? null,
      type: card?.type ?? node.type,
      content: card?.content ?? null,
    });
  };

  const openDelete = (nodeId: string) => {
    deleteConsequences.open(nodeId, (id) => armin.flashcards.deleteConsequences(id));
  };

  const editDialog = cardDialog.mode === "edit" ? cardDialog : null;
  const createDialog = cardDialog.mode === "create" ? cardDialog : null;

  const graphEdits = useGraphCanvasEdits({
    graph,
    setGraph,
    deckId,
    pendingPlacement: createDialog?.placement ?? null,
    pendingConnectFrom: createDialog?.connectFrom ?? null,
    editingId: editDialog?.id ?? null,
    editingVersion: editDialog?.version ?? null,
    closeDialog,
    resetGraph: () => {
      if (persistedGraph) setGraph(persistedGraph);
    },
    toast,
  });

  const confirmGraphDelete = async () => {
    try {
      if (await graphEdits.confirmGraphDelete(deleteConsequences.targetId)) {
        deleteConsequences.close();
      }
    } catch {}
  };

  const graphError = deckQuery.isError || graphQuery.isError;

  if (deckQuery.isSuccess && !deckQuery.data) {
    return (
      <div>
        <h1 className="sr-only">Deck not found</h1>
        <AllDecksLink />
        <DeckNotFound />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <h1 className="sr-only">
        {deckQuery.data ? `${deckQuery.data.name} prerequisite graph` : "Prerequisite graph"}
      </h1>
      {!graphError && (
        <div
          aria-hidden={canvasReady}
          className={cn(
            "pointer-events-none absolute inset-0 z-30 bg-bg transition-opacity duration-200",
            canvasReady ? "opacity-0" : "opacity-100",
          )}
        >
          {!canvasReady && <span className="sr-only">Loading graph…</span>}
          <GraphSkeleton viewport={initialViewport} nodes={skeletonNodes} />
        </div>
      )}
      {graphError && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-bg">
          <div className="pointer-events-auto flex flex-col items-center border border-border bg-bg-2 px-6 py-5 text-center shadow-overlay">
            <p className="text-sm font-medium text-ink">Couldn’t load graph</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                void deckQuery.refetch();
                void graphQuery.refetch();
              }}
            >
              Try again
            </Button>
          </div>
        </div>
      )}
      {canvasMounted && !graphError && graph.nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-bg">
          <EmptyState
            icon={GitBranch}
            title="No flashcards yet"
            description="Double-click the canvas to add your first card."
            action={
              <Button className="pointer-events-auto" onClick={() => openCreate()}>
                Add your first card
              </Button>
            }
          />
        </div>
      ) : null}
      {canvasMounted && (
        <PrerequisiteGraph
          graph={graph}
          deckName={deckQuery.data?.name}
          onBack={() => void navigate({ to: "/deck/$deckId", params: { deckId: deckSlug } })}
          onEdgesChange={graphEdits.applyEdgeChange}
          nodePlacements={graphEdits.nodePlacements}
          onCreateCardRequest={openCreate}
          onEditCardRequest={openEdit}
          onDeleteCardRequest={openDelete}
          onPersistLayout={graphEdits.saveLayout}
          initialViewport={initialViewport}
          onViewportChange={persistViewport}
          onReady={() => setCanvasReady(true)}
          onConnectError={(message) => toast({ tone: "error", title: message })}
        />
      )}

      <FlashcardFormDialog
        open={cardDialog.mode !== "closed" && cardDialog.open}
        onClose={closeDialog}
        onExitComplete={handleDialogExitComplete}
        mode={editDialog ? "edit" : "create"}
        reviewUnitId={editDialog?.id}
        initialType={editDialog?.type ?? "basic"}
        initialContent={editDialog?.content ?? null}
        onSubmit={graphEdits.saveCard}
        deckId={deckId}
      />
      <DeleteFlashcardDialog
        open={deleteConsequences.isOpen}
        consequences={deleteConsequences.consequences}
        consequencesUnavailable={deleteConsequences.unavailable}
        waitForConsequences
        pending={graphEdits.deletePending}
        onClose={deleteConsequences.close}
        onConfirm={() => void confirmGraphDelete()}
      />
    </div>
  );
}

export const Route = createFileRoute("/_app/deck/$deckId/graph")({
  staticData: { fullbleed: true },
  loader: ({ context }) => {
    const deckOptions = deckQueryOptions(context.resolvedDeckId);
    void context.queryClient.prefetchQuery(deckOptions).then(() => {
      if (context.queryClient.getQueryData(deckOptions.queryKey)) {
        prefetchGraphPage(context.queryClient, context.resolvedDeckId);
      }
    });
  },
  head: () => ({ meta: [{ title: "Graph · Armin" }] }),
  component: DeckGraphPage,
});
