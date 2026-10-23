import { armin, errorMessage } from "@/lib/armin-client";
import { notifySaveError } from "@/lib/notify";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { XYPosition } from "@xyflow/react";
import type { CardFormValues } from "@/components/flashcard-form-dialog";
import { invalidateCoreData } from "@/lib/armin-query";
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
  createDeckId: string | null;
  inheritedDeckId: string | null;
  pendingPlacement: XYPosition | null;
  pendingConnectFrom: string | null;
  editingId: string | null;
  editingVersion: number | null;
  closeDialog: () => void;
  refetchGraph: () => void;
  toast: Toast;
};

function edgeKey(edge: GraphEdge) {
  return `${edge.prereqId}->${edge.dependentId}`;
}

export function useGraphCanvasEdits({
  graph,
  setGraph,
  deckId,
  createDeckId,
  inheritedDeckId,
  pendingPlacement,
  pendingConnectFrom,
  editingId,
  editingVersion,
  closeDialog,
  refetchGraph,
  toast,
}: UseGraphCanvasEditsInput) {
  const queryClient = useQueryClient();
  const [nodePlacements, setNodePlacements] = useState<
    Record<string, XYPosition>
  >({});

  const revision = useRef(graph.version ?? 0);
  const pending = useRef(0);
  const queue = useRef(Promise.resolve());
  if (pending.current === 0 && graph.version !== undefined) revision.current = graph.version;

  // Serialize our own rapid edits, while rejecting changes from a stale view.
  const writeGraph = <T extends { version: number }>(write: (version: number) => Promise<T>) => {
    pending.current++;
    const result = queue.current.then(async () => {
      const saved = await write(revision.current);
      revision.current = saved.version;
      setGraph(current => ({ ...current, version: saved.version }));
      return saved;
    });
    queue.current = result.then(() => undefined);
    void queue.current.catch(() => undefined);
    return result.finally(() => {
      pending.current--;
      if (pending.current === 0) {
        queue.current = Promise.resolve();
        refetchGraph();
      }
    });
  };

  const addPrereq = useMutation({
    mutationFn: (edge: GraphEdge) =>
      writeGraph(version => armin.graph.addPrereq(edge.prereqId, edge.dependentId, version)),
    onSuccess: () => invalidateCoreData(queryClient),
    onError: (error) => {
      toast({
        tone: "error",
        title: "Couldn’t link flashcards",
        description: errorMessage(error),
      });
      refetchGraph();
    },
  });

  const removePrereq = useMutation({
    mutationFn: (edge: GraphEdge) =>
      writeGraph(version => armin.graph.removePrereq(edge.prereqId, edge.dependentId, version)),
    onSuccess: () => invalidateCoreData(queryClient),
    onError: () => {
      toast({ tone: "error", title: "Couldn’t remove link" });
      refetchGraph();
    },
  });

  const saveLayout = useMutation({
    mutationFn: (placements: GraphLayoutPlacement[]) =>
      writeGraph(version => armin.graph.saveLayout(deckId, placements, version)),
    onError: (error) => { toast({ tone: "error", title: "Couldn’t save layout", description: errorMessage(error) }); refetchGraph(); },
  });

  const createCard = useMutation({
    mutationFn: (values: CardFormValues) => {
      const deckId = inheritedDeckId ?? createDeckId;
      if (!deckId) {
        return Promise.reject(new Error("Pick a deck for this card."));
      }
      return armin.flashcards.create({ deckId, ...values });
    },
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
      invalidateCoreData(queryClient, inheritedDeckId ?? createDeckId ?? undefined);
      toast({ tone: "success", title: "Flashcard added to graph" });
      closeDialog();
    },
    onError: () => toast({ tone: "error", title: "Couldn’t add flashcard" }),
  });

  const updateCard = useMutation({
    mutationFn: (values: CardFormValues & { id: string; version: number }) =>
      armin.flashcards.update(values),
    onSuccess: () => {
      invalidateCoreData(queryClient, inheritedDeckId ?? undefined);
      toast({ tone: "success", title: "Flashcard updated" });
      closeDialog();
    },
    onError: (error) => notifySaveError(toast, "Couldn’t update flashcard", error),
  });

  const deleteCard = useMutation({
    mutationFn: ({ id }: { id: string; deckId?: string }) =>
      armin.flashcards.delete(id),
    onSuccess: (_result, { deckId }) => {
      invalidateCoreData(queryClient, deckId);
      toast({ tone: "success", title: "Flashcard deleted" });
    },
    onError: () => {
      toast({ tone: "error", title: "Couldn’t delete flashcard" });
      refetchGraph();
    },
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
    const deckId = graph.nodes.find((node) => node.id === deleteId)?.deckId;
    await deleteCard.mutateAsync({ id: deleteId, deckId });
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
