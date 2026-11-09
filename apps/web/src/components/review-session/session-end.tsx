import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ReviewStatePanel, UndoButton } from "./parts";

export function SessionErrorPanel({ onRetry }: { onRetry?: () => void }) {
  return (
    <ReviewStatePanel>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-relearning-bg text-relearning">
        <AlertTriangle className="h-6 w-6" strokeWidth={1.5} />
      </div>
      <h2 className="text-xl font-semibold">Review couldn&apos;t start</h2>
      <p className="mt-1 max-w-[40ch] text-sm text-muted">
        The scheduler hit a snag building your queue.
      </p>
      <Button variant="outline" className="mt-5" onClick={onRetry}>
        Try again
      </Button>
    </ReviewStatePanel>
  );
}

export function SessionEndPanel({
  done,
  title,
  description,
  notice,
  action,
  undo,
}: {
  done: boolean;
  title: string;
  description: string;
  notice: string | null;
  action: ReactNode;
  undo?: { binding: string | undefined; busy: boolean; disabled: boolean; onClick: () => void };
}) {
  return (
    <ReviewStatePanel>
      <div
        className={cn(
          "mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-review-bg text-good",
          done && "animate-settle",
        )}
      >
        <CheckCircle2 className="h-7 w-7" strokeWidth={1.5} />
      </div>
      <h2
        className={cn(
          "text-xl font-semibold tracking-tight",
          done && "animate-rise-sm [--animate-delay:60ms]",
        )}
      >
        {title}
      </h2>
      <p
        className={cn(
          "mt-1.5 max-w-[44ch] text-pretty text-sm text-muted",
          done && "animate-rise-sm [--animate-delay:120ms]",
        )}
      >
        {description}
      </p>
      {notice && (
        <p role="alert" className="mt-4 text-sm text-muted">
          {notice}
        </p>
      )}
      {undo && <UndoButton {...undo} variant="outline" className="mt-5" />}
      <div className="mt-6">{action}</div>
    </ReviewStatePanel>
  );
}
