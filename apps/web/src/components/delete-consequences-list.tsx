import type { FlashcardDeleteConsequences } from "@/types/view-models";

function plural(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

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
