import type { ReviewState } from "@/components/ui/badge";

/** Selectable card states, in learning order. */
export const STATE_OPTIONS: { value: ReviewState; label: string }[] = [
  { value: 0, label: "New" },
  { value: 1, label: "Learning" },
  { value: 2, label: "Review" },
  { value: 3, label: "Relearning" },
];
