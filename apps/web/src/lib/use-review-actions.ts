import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CardFormValues } from "@/components/flashcard-form-dialog";
import { useToast } from "@/components/ui/toast";
import { armin, errorMessage } from "@/lib/armin-client";
import { invalidateCoreData } from "@/lib/armin-query";
import { notifySaveError } from "@/lib/notify";
import { useConnection } from "@/lib/session";
import { toUiFlashcard, type UiFlashcard, type UiReviewUnit } from "@/types/view-models";
import type { Grade } from "@/types/window";

/** Server-backed actions shared by the deck and all-decks review screens. */
export function useReviewActions(deckId?: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { online } = useConnection();

  const refresh = () => invalidateCoreData(queryClient, deckId);

  const updateCard = useMutation({
    mutationFn: ({ flashcard, values }: { flashcard: UiFlashcard; values: CardFormValues }) =>
      armin.flashcards.update({ id: flashcard.id, version: flashcard.version, ...values }),
    onSuccess: () => {
      refresh();
      toast({ tone: "success", title: "Flashcard updated" });
    },
    onError: (error) => notifySaveError(toast, "Couldn't update flashcard", error),
  });

  const archiveCard = useMutation({
    mutationFn: (flashcardId: string) => armin.flashcards.archive(flashcardId, true),
    onSuccess: () => {
      refresh();
      toast({ tone: "success", title: "Flashcard archived" });
    },
    onError: (error) =>
      toast({
        tone: "error",
        title: "Couldn't archive flashcard",
        description: errorMessage(error),
      }),
  });

  const deleteCard = useMutation({
    mutationFn: (flashcardId: string) => armin.flashcards.delete(flashcardId),
    onSuccess: () => {
      refresh();
      toast({ tone: "error", title: "Flashcard deleted" });
    },
    onError: (error) =>
      toast({
        tone: "error",
        title: "Couldn't delete flashcard",
        description: errorMessage(error),
      }),
  });

  return {
    online,
    loadPreview: (reviewUnitId: string) => armin.review.preview(reviewUnitId),
    onRate: async (card: UiReviewUnit, rating: Grade, requestId: string) => {
      const result = await armin.review.rate({
        reviewUnitId: card.id,
        rating,
        version: card.version,
        requestId,
      });
      refresh();
      return result;
    },
    onUndo: async (entry: { reviewLogId: string; version: number }, requestId: string) => {
      const result = await armin.review.undo({
        reviewLogId: entry.reviewLogId,
        version: entry.version,
        requestId,
      });
      refresh();
      return result;
    },
    loadCard: async (flashcardId: string) => {
      const flashcard = await armin.flashcards.get(flashcardId);
      return flashcard ? toUiFlashcard(flashcard) : undefined;
    },
    onEditFlashcard: (flashcard: UiFlashcard, values: CardFormValues) =>
      updateCard.mutateAsync({ flashcard, values }).then(() => undefined),
    onArchiveFlashcard: (flashcardId: string) =>
      archiveCard.mutateAsync(flashcardId).then(() => undefined),
    onDeleteFlashcard: (flashcardId: string) =>
      deleteCard.mutateAsync(flashcardId).then(() => undefined),
    loadDeleteConsequences: (flashcardId: string) =>
      armin.flashcards.deleteConsequences(flashcardId),
  };
}
