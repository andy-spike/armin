import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { plural } from "@/lib/utils";
import type { FlashcardDeleteConsequences } from "@/types/view-models";

function reviewHistoryLine(consequences: FlashcardDeleteConsequences) {
  const units = plural(consequences.reviewUnitCount, "review unit");
  if (consequences.reviewLogCount === 0) {
    return `No review history will be destroyed across ${units}.`;
  }
  const first = consequences.firstReviewAt?.toLocaleDateString();
  const last = consequences.lastReviewAt?.toLocaleDateString();
  const span = first && last ? ` from ${first} to ${last}` : "";
  return `${plural(consequences.reviewLogCount, "review log")} across ${units} will be destroyed${span}.`;
}

/** What deleting a flashcard destroys, shown in every delete confirmation. */
export function DeleteConsequencesList({
  consequences,
  unavailable,
}: {
  consequences: FlashcardDeleteConsequences | null;
  /** The counts failed to load, or this screen can't load them. */
  unavailable: boolean;
}) {
  return (
    <ul className="space-y-1 rounded-md border border-border bg-surface-sunken p-3">
      <li>
        {unavailable
          ? "Dependent count could not be loaded."
          : consequences
            ? `${plural(consequences.dependentCount, "dependent")} will be unlocked or recomputed.`
            : "Loading dependent count…"}
      </li>
      <li>
        {unavailable
          ? "Review history could not be loaded."
          : consequences
            ? reviewHistoryLine(consequences)
            : "Loading review history…"}
      </li>
    </ul>
  );
}

/**
 * The confirmation every surface shows before hard-deleting a flashcard.
 * `waitForConsequences` keeps Delete disabled until the counts arrive.
 */
export function DeleteFlashcardDialog({
  open,
  preview = "",
  consequences,
  consequencesUnavailable,
  waitForConsequences,
  pending = false,
  onClose,
  onConfirm,
  onArchiveInstead,
}: {
  open: boolean;
  preview?: string;
  consequences: FlashcardDeleteConsequences | null;
  consequencesUnavailable: boolean;
  waitForConsequences: boolean;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Offers "Archive instead"; omit where archiving isn't available. */
  onArchiveInstead?: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Delete flashcard?"
      description={
        preview
          ? `“${preview.length > 100 ? `${preview.slice(0, 100)}…` : preview}” will be permanently hard-deleted.`
          : "This flashcard will be permanently hard-deleted."
      }
    >
      <div className="space-y-3 text-sm text-muted">
        <p>
          {onArchiveInstead
            ? "Archive is the reversible way to set this aside."
            : "Archive from the deck or browse view if you want a reversible way to set this aside."}{" "}
          Delete removes the flashcard, its review units, and its review history permanently.
        </p>
        <DeleteConsequencesList consequences={consequences} unavailable={consequencesUnavailable} />
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2 pt-1">
        {/* Focus the safe action when the dialog opens from a key press. */}
        <Button variant="ghost" autoFocus onClick={onClose}>
          Cancel
        </Button>
        {onArchiveInstead && (
          <Button disabled={pending} onClick={onArchiveInstead}>
            Archive instead
          </Button>
        )}
        <Button
          variant="destructive"
          disabled={waitForConsequences && !consequences}
          busy={pending}
          onClick={onConfirm}
        >
          Delete flashcard
        </Button>
      </div>
    </Dialog>
  );
}
