import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";
import { formatBinding } from "@/lib/keybindings/keys";
import { cn } from "@/lib/utils";
import type { Grade } from "@/types/view-models";
import { RATINGS, RATING_COMMANDS, ShortcutLabel } from "./parts";

const onAccentKbd = "border-on-accent/25 bg-ink/10 text-on-accent shadow-none max-sm:hidden";

export function AnswerBar({
  keymap,
  flipped,
  reviewed,
  isTypeAnswer,
  isCorrect,
  canGoBack,
  canGoForward,
  rateDisabled,
  showIntervals,
  intervalLabels,
  onPrev,
  onNext,
  onReveal,
  onRate,
}: {
  keymap: Record<string, string | undefined>;
  flipped: boolean;
  reviewed: boolean;
  isTypeAnswer: boolean;
  isCorrect: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  rateDisabled: boolean;
  showIntervals: boolean;
  intervalLabels: Map<Grade, string>;
  onPrev: () => void;
  onNext: () => void;
  onReveal: () => void;
  onRate: (grade: Grade) => void;
}) {
  const keyLabel = (commandId: string) => formatBinding(keymap[commandId] ?? "");

  return (
    <div className="shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-5">
      {reviewed && (
        <p className="mb-3 text-center text-sm text-muted">
          Already reviewed. Use Undo to change your last answer.
        </p>
      )}
      <div className="flex h-12 items-stretch gap-2">
        <Tooltip content={<ShortcutLabel label="Previous card" binding={keymap["review.prev"]} />}>
          <Button
            variant="outline"
            size="lg"
            className="h-full w-12 shrink-0 px-0"
            disabled={!canGoBack}
            onClick={onPrev}
            aria-label="Previous review unit"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Tooltip>

        <div className="min-w-0 flex-1">
          {!flipped ? (
            <Button size="lg" className="h-full w-full" onClick={onReveal}>
              {isTypeAnswer ? "Check answer" : "Show answer"}
              <Kbd className={cn("ml-1", onAccentKbd)}>
                {isTypeAnswer ? "Enter" : keyLabel("review.flip")}
              </Kbd>
            </Button>
          ) : (
            <div className="grid h-full grid-cols-4 gap-2">
              {RATINGS.map((r) => (
                <button
                  key={r.grade}
                  onClick={() => onRate(r.grade)}
                  disabled={rateDisabled}
                  className={cn(
                    "flex h-full min-w-0 flex-col items-center justify-center gap-0 rounded-md px-1 text-sm leading-tight font-medium text-on-accent transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-default disabled:opacity-60 sm:px-3",
                    r.bg,
                    isTypeAnswer && ((isCorrect && r.grade === 3) || (!isCorrect && r.grade === 1))
                      ? "ring-2 ring-ink ring-offset-2 ring-offset-bg"
                      : undefined,
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {r.label}
                    <Kbd className={onAccentKbd}>{keyLabel(RATING_COMMANDS[r.grade])}</Kbd>
                  </span>
                  {showIntervals && (
                    <span className="font-mono text-[0.6875rem] text-on-accent/90">
                      {intervalLabels.get(r.grade) ?? "…"}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <Tooltip content={<ShortcutLabel label="Next card" binding={keymap["review.next"]} />}>
          <Button
            variant="outline"
            size="lg"
            className="h-full w-12 shrink-0 px-0"
            disabled={!canGoForward}
            onClick={onNext}
            aria-label="Next review unit"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
