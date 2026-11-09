import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CardInfoDialog } from "@/components/card-info-dialog";
import { FlashcardDeleteDialog, type FlashcardDeleteRequest } from "@/components/flashcard-tile";
import { MoveFlashcardDialog } from "@/components/move-flashcard-dialog";
import { useToast } from "@/components/ui/toast";
import { armin } from "@/lib/armin-client";
import { useDeleteConsequences } from "@/lib/use-delete-consequences";
import type { UiFlashcard } from "@/types/view-models";

export function useFlashcardTileActions() {
  const toast = useToast();
  const [moveTarget, setMoveTarget] = useState<UiFlashcard | null>(null);
  const [infoCardId, setInfoCardId] = useState<string | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<FlashcardDeleteRequest | null>(null);
  const deleteConsequences = useDeleteConsequences();

  const archiveCard = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      armin.flashcards.archive(id, archived),
    onSuccess: (_result, { archived }) =>
      toast({ tone: "success", title: archived ? "Flashcard archived" : "Flashcard unarchived" }),
    onError: () => toast({ tone: "error", title: "Could not update flashcard" }),
  });

  const deleteCard = useMutation({
    mutationFn: (id: string) => armin.flashcards.delete(id),
    onSuccess: () => toast({ tone: "error", title: "Flashcard deleted" }),
    onError: () => toast({ tone: "error", title: "Couldn’t delete flashcard" }),
  });

  const requestDelete = (request: FlashcardDeleteRequest) => {
    setDeleteRequest(request);
    deleteConsequences.open(request.card.id, request.loadDeleteConsequences);
  };

  const closeDeleteDialog = () => {
    setDeleteRequest(null);
    deleteConsequences.close();
  };

  const tileProps = (card: UiFlashcard) => ({
    onMove: () => setMoveTarget(card),
    onInfo: () => setInfoCardId(card.id),
    onArchiveToggle: () => void archiveCard.mutateAsync({ id: card.id, archived: !card.archived }),
    loadDeleteConsequences: (id: string) => armin.flashcards.deleteConsequences(id),
    onDeleteRequest: requestDelete,
    onDelete: async () => {
      await deleteCard.mutateAsync(card.id);
    },
  });

  const dialogs = (
    <>
      <MoveFlashcardDialog
        flashcard={moveTarget}
        open={Boolean(moveTarget)}
        onClose={() => setMoveTarget(null)}
      />
      <CardInfoDialog
        flashcardId={infoCardId}
        open={infoCardId !== null}
        onClose={() => setInfoCardId(null)}
      />
      <FlashcardDeleteDialog
        request={deleteRequest}
        consequences={deleteConsequences.consequences}
        consequencesError={deleteConsequences.unavailable}
        onClose={closeDeleteDialog}
        onArchiveInstead={() => {
          const request = deleteRequest;
          closeDeleteDialog();
          void request?.archiveInstead();
        }}
        onConfirm={() => {
          const request = deleteRequest;
          closeDeleteDialog();
          request?.confirmDelete();
        }}
      />
    </>
  );

  return { tileProps, dialogs };
}
