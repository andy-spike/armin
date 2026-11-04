import { Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { type ImportProgress } from "@/lib/anki/import-runner";
import { n, plural } from "./format";

export function ImportingStep({
  progress,
  fileName,
  deckCount,
  onCancel,
}: {
  progress: ImportProgress;
  fileName: string;
  deckCount: number;
  onCancel: () => void;
}) {
  const phases = [
    { stage: "images", label: "Uploading images and audio", counter: progress.images },
    { stage: "cards", label: "Adding cards", counter: progress.cards },
    { stage: "history", label: "Adding review history", counter: progress.history },
  ] as const;
  const order = ["images", "cards", "history", "finishing"];
  const current = order.indexOf(progress.stage);
  const visible = phases.filter(
    (phase) => phase.counter.total > 0 || phase.stage === progress.stage,
  );
  const active = phases.find((phase) => phase.stage === progress.stage);
  const done = visible.reduce((sum, phase) => sum + phase.counter.done, 0);
  const total = visible.reduce((sum, phase) => sum + phase.counter.total, 0);
  const percent =
    progress.stage === "finishing" ? 100 : total > 0 ? Math.floor((done / total) * 100) : 0;

  return (
    <section
      aria-labelledby="anki-importing"
      data-narrow
      className="border border-border bg-surface shadow-overlay"
    >
      <p role="status" aria-live="polite" className="sr-only">
        {progress.stage === "finishing" ? "Finishing up" : active?.label}
      </p>
      <div className="flex items-end justify-between gap-6 px-6 pt-6">
        <div className="min-w-0">
          <h2
            id="anki-importing"
            className="font-serif text-[1.375rem] font-semibold tracking-tight text-ink"
          >
            {progress.stage === "finishing"
              ? "Finishing up"
              : `Importing ${plural(deckCount, "deck")}`}
          </h2>
          <p className="mt-1 truncate text-[0.8125rem] text-muted">{fileName}</p>
        </div>
        <p className="shrink-0 font-serif text-[2.5rem] leading-none font-semibold text-ink tabular-nums">
          {percent}
          <span className="ml-0.5 text-xl text-muted">%</span>
        </p>
      </div>
      <Progress
        value={percent}
        max={100}
        label="Import progress"
        className="mx-6 mt-5 h-2 w-auto"
      />

      <ol className="mt-6 border-t border-border">
        {visible.map((phase) => {
          const index = order.indexOf(phase.stage);
          const state = index < current ? "done" : index === current ? "active" : "waiting";
          return (
            <li
              key={phase.stage}
              className={`flex items-center gap-3 border-b border-border px-6 py-3.5 text-sm ${
                state === "active" ? "bg-accent-tint/40" : ""
              }`}
            >
              <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center">
                {state === "done" ? (
                  <Check className="h-4 w-4 text-good" />
                ) : state === "active" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
                ) : (
                  <span className="h-1.5 w-1.5 bg-border-strong" />
                )}
              </span>
              <span className={state === "waiting" ? "text-muted" : "font-medium text-ink"}>
                {phase.label}
              </span>
              <span className="ml-auto text-[0.8125rem] text-muted tabular-nums">
                {state === "done"
                  ? n(phase.counter.total)
                  : `${n(phase.counter.done)} of ${n(phase.counter.total)}`}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <p className="text-[0.8125rem] text-muted">Keep this tab open until it finishes.</p>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel import
        </Button>
      </div>
    </section>
  );
}
