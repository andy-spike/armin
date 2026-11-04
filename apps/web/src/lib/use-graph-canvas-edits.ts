import { armin, errorMessage } from "@/lib/armin-client";
import { notifySaveError } from "@/lib/notify";
import { useUpdateFlashcard } from "@/lib/use-update-flashcard";
import { useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useIsMutating, useMutation } from "@tanstack/react-query";
import type { XYPosition } from "@xyflow/react";
import type { CardFormValues } from "@/components/flashcard-form-dialog";
import type { UiDeckGraph } from "@/types/view-models";

type Toast = (input: {
  title: string;
  description?: string;
  tone?: "default" | "success" | "error";
}) => void;

type GraphEdge = UiDeckGraph["edges"][number];
type GraphLayoutPlacement = { flashcardId: string; x: number; y: number };

type UseGraphCanvasEditsInput = {
  graph: UiDeckGraph;
  setGraph: Dispatch<SetStateAction<UiDeckGraph>>;
  deckId: string;
  pendingPlacement: XYPosition | null;
  pendingConnectFrom: string | null;
  editingId: string | null;
  editingVersion: number | null;
  closeDialog: () => void;
  /** Replace the canvas's working copy with the server's graph. */
  resetGraph: () => void;
  toast: Toast;
};

function edgeKey(edge: GraphEdge) {
  return `${edge.prereqId}->${edge.dependentId}`;
}

export function useGraphCanvasEdits({
  graph,
  setGraph,
  deckId,
  pendingPlacement,
  pendingConnectFrom,
  editingId,
  editingVersion,
  closeDialog,
  resetGraph,
  toast,
}: UseGraphCanvasEditsInput) {
  const [nodePlacements, setNodePlacements] = useState<Record<string, XYPosition>>({});

  // Graph writes name the library revision they start from. Ours run one at a
  // time in one TanStack Query mutation scope, each starting from the
  // revision the previous one saved; between writes, the server's is adopted.
  const scope = { id: `graph:${deckId}` };
  const revision = useRef(graph.version ?? 0);
  const writing = useIsMutating({ mutationKey: ["graph", deckId] }) > 0;
  useLayoutEffect(() => {
    if (!writing && graph.version !== undefined) revision.current = graph.version;
  });

  const writeGraph = async <T extends { version: number }>(
    write: (version: number) => Promise<T>,
  ) => {
    const saved = await write(revision.current);
    revision.current = saved.version;
    return saved;
  };

  // A failed write puts the canvas back to the server's graph.
  const failed = (title: string, error?: unknown) => {
    toast({ tone: "error", title, description: error ? errorMessage(error) : undefined });
    resetGraph();
  };

  const addPrereq = useMutation({
    mutationKey: ["graph", deckId],
    scope,
    mutationFn: (edge: GraphEdge) =>
      writeGraph((version) => armin.graph.addPrereq(edge.prereqId, edge.dependentId, version)),
    onError: (error) => failed("Couldn’t link flashcards", error),
  });

  const removePrereq = useMutation({
    mutationKey: ["graph", deckId],
    scope,
    mutationFn: (edge: GraphEdge) =>
      writeGraph((version) => armin.graph.removePrereq(edge.prereqId, edge.dependentId, version)),
    onError: () => failed("Couldn’t remove link"),
  });

  const saveLayout = useMutation({
    mutationKey: ["graph", deckId],
    scope,
    mutationFn: (placements: GraphLayoutPlacement[]) =>
      writeGraph((version) => armin.graph.saveLayout(deckId, placements, version)),
    onError: (error) => failed("Couldn’t save layout", error),
  });

  const createCard = useMutation({
    mutationFn: (values: CardFormValues) => armin.flashcards.create({ deckId, ...values }),
    onSuccess: async (card) => {
      // Creation also changes the graph revision. Read it before placing/linking.
      const fresh = await armin.graph.getDeck(deckId);
      revision.current = fresh.version;
      if (pendingPlacement) {
        setNodePlacements((current) => ({
          ...current,
          [card.id]: pendingPlacement,
        }));
        saveLayout.mutate([
          {
            flashcardId: card.id,
            x: pendingPlacement.x,
            y: pendingPlacement.y,
          },
        ]);
      }
      if (pendingConnectFrom) {
        addPrereq.mutate({
          prereqId: pendingConnectFrom,
          dependentId: card.id,
        });
      }
      toast({ tone: "success", title: "Flashcard added to graph" });
      closeDialog();
    },
    onError: (error) => notifySaveError(toast, "Couldn’t add flashcard", error),
  });

  const updateCard = useUpdateFlashcard(closeDialog);

  const deleteCard = useMutation({
    mutationFn: (id: string) => armin.flashcards.delete(id),
    onSuccess: () => {
      toast({ tone: "success", title: "Flashcard deleted" });
    },
    onError: () => failed("Couldn’t delete flashcard"),
  });

  const saveCard = async (values: CardFormValues) => {
    if (editingId) {
      await updateCard.mutateAsync({ id: editingId, version: editingVersion ?? 0, ...values });
    } else {
      await createCard.mutateAsync(values);
    }
  };

  /** Persist the links the canvas added or removed. */
  const applyEdgeChange = (nextEdges: GraphEdge[]) => {
    const previousEdges = graph.edges;
    setGraph((current) => ({ ...current, edges: nextEdges }));

    const previousKeys = new Set(previousEdges.map(edgeKey));
    const nextKeys = new Set(nextEdges.map(edgeKey));
    for (const edge of nextEdges) {
      if (!previousKeys.has(edgeKey(edge))) addPrereq.mutate(edge);
    }
    for (const edge of previousEdges) {
      if (!nextKeys.has(edgeKey(edge))) removePrereq.mutate(edge);
    }
  };

  const confirmGraphDelete = async (deleteId: string | null) => {
    if (!deleteId) return false;
    await deleteCard.mutateAsync(deleteId);
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== deleteId),
      edges: current.edges.filter(
        (edge) => edge.prereqId !== deleteId && edge.dependentId !== deleteId,
      ),
    }));
    return true;
  };

  const persistLayout = (placements: GraphLayoutPlacement[]) => {
    saveLayout.mutate(placements);
  };

  return {
    nodePlacements,
    saveCard,
    applyEdgeChange,
    confirmGraphDelete,
    saveLayout: persistLayout,
    deletePending: deleteCard.isPending,
  };
}
