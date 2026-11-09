import type { FlashcardType } from "@armin/core/flashcard-types";
import { cn } from "@/lib/utils";

const CARD_TYPE_LABELS: Record<FlashcardType, string> = {
  basic: "Basic",
  basic_reversed: "Reversed",
  cloze: "Cloze",
  type_answer: "Type",
  image_occlusion: "Image occlusion",
  concept: "Concept",
};

export function FlashcardTypeBadge({
  type,
  className,
}: {
  type: FlashcardType;
  className?: string;
}) {
  if (type === "basic") return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wide text-muted",
        className,
      )}
    >
      {CARD_TYPE_LABELS[type]}
    </span>
  );
}
