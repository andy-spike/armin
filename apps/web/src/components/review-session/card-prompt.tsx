import { useQuery } from "@tanstack/react-query";
import { Check, XCircle } from "lucide-react";
import { matchesTypeAnswer, renderClozeText } from "@armin/core/flashcard-rules";
import type {
  ClozeContent,
  ImageOcclusionContent,
  TypeAnswerContent,
} from "@armin/core/flashcard-types";
import { ImageOcclusionReview } from "@/components/image-occlusion-review";
import { Input } from "@/components/ui/input";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { settingsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { UiReviewUnit } from "@/types/view-models";

export function typeAnswerCheck(card: UiReviewUnit | undefined, typed: string) {
  if (card?.type !== "type_answer") return { isTypeAnswer: false, isCorrect: false };
  return {
    isTypeAnswer: true,
    isCorrect: matchesTypeAnswer(typed, card.content as TypeAnswerContent),
  };
}

export function ReviewCardPrompt({
  card,
  flipped,
  typed,
  onTypedChange,
  onReveal,
}: {
  card: UiReviewUnit;
  flipped: boolean;
  typed: string;
  onTypedChange: (value: string) => void;
  onReveal: () => void;
}) {
  const { isTypeAnswer, isCorrect } = typeAnswerCheck(card, typed);
  const imageOcclusionContent =
    card.type === "image_occlusion" ? (card.content as ImageOcclusionContent) : null;
  const clozeContent = card.type === "cloze" ? (card.content as ClozeContent) : null;
  const clozeExtra = clozeContent?.extra;
  const autoplay = useQuery(settingsQuery()).data?.autoplayAudio ?? true;
  const audio = autoplay ? "autoplay" : "manual";

  if (imageOcclusionContent) {
    return (
      <ImageOcclusionReview
        content={imageOcclusionContent}
        targetId={card.subKey}
        flipped={flipped}
      />
    );
  }

  return (
    <>
      <MarkdownContent
        imageLoading="eager"
        audio={audio}
        content={card.front}
        className="max-w-[52ch] text-pretty text-xl font-medium leading-snug text-balance"
      />

      {isTypeAnswer && (
        <div className="mt-6 w-full max-w-sm">
          <Input
            autoFocus
            value={typed}
            disabled={flipped}
            onChange={(e) => onTypedChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !flipped) {
                e.preventDefault();
                onReveal();
              }
            }}
            placeholder="Type your answer…"
            aria-label="Your answer"
            className="text-center"
          />
        </div>
      )}

      {flipped && (
        <div className="flex w-full flex-col items-center">
          <div className="my-7 h-px w-16 bg-border-strong" />
          {isTypeAnswer && (
            <div
              className={cn(
                "mb-3 inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm font-medium",
                isCorrect ? "bg-review-bg text-good" : "bg-relearning-bg text-relearning",
              )}
            >
              {isCorrect ? <Check className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {isCorrect ? "Correct" : "Not quite"}
            </div>
          )}
          <MarkdownContent
            imageLoading="eager"
            audio={audio}
            content={
              clozeContent && clozeExtra ? renderClozeText(clozeContent.text, null) : card.back
            }
            className="max-w-[52ch] text-pretty text-lg leading-relaxed text-ink/90"
          />
          {clozeExtra && (
            <MarkdownContent
              imageLoading="eager"
              audio="manual"
              content={clozeExtra}
              className="mt-4 max-w-[52ch] text-pretty text-sm leading-relaxed text-muted"
            />
          )}
        </div>
      )}
    </>
  );
}
