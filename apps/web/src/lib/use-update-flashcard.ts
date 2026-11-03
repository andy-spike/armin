import { useMutation } from "@tanstack/react-query";
import type { CardFormValues } from "@/components/flashcard-form-dialog";
import { useToast } from "@/components/ui/toast";
import { armin } from "@/lib/armin-client";
import { notifySaveError } from "@/lib/notify";

/** Save an edited flashcard from its form dialog; `onSaved` closes the dialog. */
export function useUpdateFlashcard(onSaved: () => void) {
  const toast = useToast();
  return useMutation({
    mutationFn: (values: CardFormValues & { id: string; version: number }) =>
      armin.flashcards.update(values),
    onSuccess: () => {
      toast({ tone: "success", title: "Flashcard updated" });
      onSaved();
    },
    onError: (error) => notifySaveError(toast, "Couldn’t update flashcard", error),
  });
}
