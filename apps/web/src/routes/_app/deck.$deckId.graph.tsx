import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  deckQuery as deckQueryOptions,
  prefetchGraphPage,
} from "@/lib/queries";
import { armin } from "@/lib/armin-client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, GitBranch, Layers } from "lucide-react";
import type { Viewport, XYPosition } from "@xyflow/react";
import { FlashcardFormDialog } from "@/components/flashcard-form-dialog-lazy";
import { PrerequisiteGraph } from "@/components/prerequisite-graph/prerequisite-graph";
import { Button } from "@/components/ui/button";
import { GraphSkeleton } from "@/components/page-skeletons";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { graphKeys } from "@/lib/armin-query";
import { useGraphCanvasEdits } from "@/lib/use-graph-canvas-edits";
import { toUiDeckGraph, type UiDeckGraph } from "@/types/view-models";
import type {
  FlashcardContent,
  FlashcardDeleteConsequences,
  FlashcardType,
} from "@/types/window";
import { cn } from "@/lib/utils";
import { markGraphPerf, measureGraphPerf } from "@/lib/graph-perf";


function afterRoutePaint(work: () => void) {
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
  const timeout = window.setTimeout(run, 100);
  return () => {
    done = true;
    cancelAnimationFrame(outer);
    cancelAnimationFrame(inner);
    window.clearTimeout(timeout);
  };
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function formatReviewHistory(consequences: FlashcardDeleteConsequences | null) {
  if (!consequences) return "Loading review history…";
  if (consequences.reviewLogCount === 0) {
    return `No review history will be destroyed across ${plural(consequences.reviewUnitCount, "review unit")}.`;
  }

  const first = consequences.firstReviewAt?.toLocaleDateString();
  const last = consequences.lastReviewAt?.toLocaleDateString();
  const span = first && last ? ` from ${first} to ${last}` : "";
  return `${plural(consequences.reviewLogCount, "review log")} across ${plural(consequences.reviewUnitCount, "review unit")} will be destroyed${span}.`;
}

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
  } catch {
    // Ignore malformed or unavailable storage.
  }
  return undefined;
}

function DeckGraphPage() {
  const { deckId } = Route.useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const markedRouteRender = useRef(false);
  if (!markedRouteRender.current) {
    markedRouteRender.current = true;
    markGraphPerf("routeRender:start");
  }

  const viewportStorageKey = `armin:graph-viewport:${deckId}`;
  const [initialViewport] = useState<Viewport | undefined>(() =>
    readSavedViewport(viewportStorageKey),
  );

  const persistViewport = (viewport: Viewport) => {
    try {
      localStorage.setItem(viewportStorageKey, JSON.stringify(viewport));
    } catch {
      // Ignore storage write failures (e.g. private mode quota).
    }
  };

  const deckQuery = useQuery(deckQueryOptions(deckId));

  // A deleted or malformed deck id resolves to no deck, so don't ask for a
  // graph in that case: the graph query would come back empty and look like a
  // real deck with no cards.
  const graphQuery = useQuery({
    queryKey: graphKeys.deck(deckId),
    queryFn: async () => {
      markGraphPerf("getDeck:start");
      const graph = await armin.graph.getDeck(deckId);
      markGraphPerf("getDeck:end");
      measureGraphPerf("getDeck", "getDeck:start", "getDeck:end");
      return graph;
    },
    enabled: Boolean(deckQuery.data),
  });

  const persistedGraph = useMemo(() => {
    if (!graphQuery.data) return null;
    markGraphPerf("toUiDeckGraph:start");
    const graph = toUiDeckGraph(graphQuery.data, deckId);
    markGraphPerf("toUiDeckGraph:end");
    measureGraphPerf("toUiDeckGraph", "toUiDeckGraph:start", "toUiDeckGraph:end");
    return graph;
  }, [graphQuery.data, deckId]);

  const [graph, setGraph] = useState<UiDeckGraph>({ nodes: [], edges: [] });
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<number | null>(null);
  const [editingType, setEditingType] = useState<FlashcardType>("basic");
  const [editingContent, setEditingContent] = useState<FlashcardContent | null>(
    null,
  );
  const [pendingPlacement, setPendingPlacement] = useState<XYPosition | null>(
    null,
  );
  const [pendingConnectFrom, setPendingConnectFrom] = useState<string | null>(
    null,
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteConsequences, setDeleteConsequences] =
    useState<FlashcardDeleteConsequences | null>(null);
  const [deleteConsequencesError, setDeleteConsequencesError] = useState(false);

  const [graphReady, setGraphReady] = useState(false);
  const [canvasMounted, setCanvasMounted] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    if (persistedGraph) {
      setGraph(persistedGraph);
      setGraphReady(true);
    }
  }, [persistedGraph]);

  // Once the data is in, let the loading screen paint a frame before mounting
  // the canvas. Building the graph (dagre layout + ReactFlow + every node) is a
  // heavy synchronous burst that blocks the main thread, so deferring it keeps
  // the loading state on screen the whole time instead of freezing the prior
  // page.
  useEffect(() => {
    if (!graphReady || canvasMounted) return;
    return afterRoutePaint(() => {
      markGraphPerf("reactFlow:mount");
      setCanvasMounted(true);
    });
  }, [graphReady, canvasMounted]);

  const closeDialog = () => setOpen(false);

  const handleDialogExitComplete = () => {
    setEditingId(null);
    setPendingPlacement(null);
    setPendingConnectFrom(null);
  };

  const openCreate = (placement?: XYPosition, connectFromNodeId?: string) => {
    setEditingId(null);
    setPendingPlacement(placement ?? null);
    setPendingConnectFrom(connectFromNodeId ?? null);
    setOpen(true);
  };

  const openEdit = async (nodeId: string) => {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setEditingId(nodeId);
    setPendingPlacement(null);
    setPendingConnectFrom(null);
    // Fetch the full flashcard content before opening: the form hydrates on the
    // open transition, and graph nodes only carry display strings.
    const card = await armin.flashcards.get(nodeId);
    setEditingVersion(card?.version ?? null);
    setEditingType(card?.type ?? node.type);
    setEditingContent(card?.content ?? null);
    setOpen(true);
  };

  const openDelete = (nodeId: string) => {
    setDeleteId(nodeId);
    setDeleteConsequences(null);
    setDeleteConsequencesError(false);
    void armin.flashcards
      .deleteConsequences(nodeId)
      .then((summary) => setDeleteConsequences(summary))
      .catch(() => setDeleteConsequencesError(true));
  };

  const graphEdits = useGraphCanvasEdits({
    graph,
    setGraph,
    deckId,
    createDeckId: deckId,
    inheritedDeckId: deckId,
    pendingPlacement,
    pendingConnectFrom,
    editingId,
    editingVersion,
    closeDialog,
    refetchGraph: () => void graphQuery.refetch(),
    toast,
  });

  const confirmGraphDelete = async () => {
    try {
      if (await graphEdits.confirmGraphDelete(deleteId)) {
        setDeleteId(null);
      }
    } catch {
      // The mutation already reported the failure and refetched the graph.
    }
  };

  const graphError = deckQuery.isError || graphQuery.isError;

  if (deckQuery.isSuccess && !deckQuery.data) {
    return (
      <div>
        <h1 className="sr-only">Deck not found</h1>
        <Link
          to="/"
          className="inline-flex items-center gap-1 rounded-sm text-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ArrowLeft className="h-4 w-4" /> All decks
        </Link>
        <EmptyState
          className="mt-8"
          icon={Layers}
          title="Deck not found"
          description="This deck doesn't exist in your library. It may have been removed or the link is stale."
          action={
            <Link to="/">
              <Button variant="outline">Back to decks</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div data-fullbleed className="relative h-full w-full">
      <h1 className="sr-only">
        {deckQuery.data
          ? `${deckQuery.data.name} prerequisite graph`
          : "Prerequisite graph"}
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
          <GraphSkeleton />
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
              <Button
                className="pointer-events-auto"
                onClick={() => openCreate()}
              >
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
          onBack={() =>
            void navigate({ to: "/deck/$deckId", params: { deckId } })
          }
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
        open={open}
        onClose={closeDialog}
        onExitComplete={handleDialogExitComplete}
        mode={editingId ? "edit" : "create"}
        reviewUnitId={editingId}
        initialType={editingId ? editingType : "basic"}
        initialContent={editingId ? editingContent : null}
        onSubmit={graphEdits.saveCard}
        deckId={deckId}
      />
      <Dialog
        open={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        title="Delete flashcard?"
        description="This flashcard will be permanently hard-deleted."
      >
        <div className="space-y-3 text-sm text-muted">
          <p>
            Archive from the deck or browse view if you want a reversible way to
            set this aside. Delete removes the flashcard, its review units, and
            its review history permanently.
          </p>
          <ul className="space-y-1 rounded-md border border-border bg-surface-sunken p-3">
            <li>
              {deleteConsequencesError
                ? "Dependent count could not be loaded."
                : deleteConsequences
                  ? `${plural(deleteConsequences.dependentCount, "dependent")} will be unlocked or recomputed.`
                  : "Loading dependent count…"}
            </li>
            <li>
              {deleteConsequencesError
                ? "Review history could not be loaded."
                : formatReviewHistory(deleteConsequences)}
            </li>
          </ul>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2 pt-1">
          {/* Focus the safe action when the dialog opens from a key press. */}
          <Button variant="ghost" autoFocus onClick={() => setDeleteId(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!deleteConsequences}
            busy={graphEdits.deletePending}
            onClick={() => void confirmGraphDelete()}
          >
            Delete flashcard
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/_app/deck/$deckId/graph")({
  loader: ({ context, params }) => {
    // Resolve the deck before asking for its graph, so an unknown id never
    // looks like an empty deck or reaches graph writes.
    const deckOptions = deckQueryOptions(params.deckId);
    void context.queryClient.prefetchQuery(deckOptions).then(() => {
      if (context.queryClient.getQueryData(deckOptions.queryKey)) {
        prefetchGraphPage(context.queryClient, params.deckId);
      }
    });
  },
  head: () => ({ meta: [{ title: "Graph · Armin" }] }),
  component: DeckGraphPage,
});
