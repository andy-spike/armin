"use client";

import { useState } from "react";
import Link from "next/link";
import { Undo2, Eye, CircleAlert, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { CardContent } from "@/components/flashcard-content";
import { useKeybinding } from "@/lib/keybindings/dispatcher";
import { formatUntil } from "@/lib/format";
import type { ReviewRating, ReviewQueue } from "@/lib/shared/contracts";
import { cn } from "@/lib/cn";

export const RATING_OPTIONS: Array<{
  rating: ReviewRating;
  label: string;
  key: string;
  intervalMs: number;
}> = [
  { rating: "again", label: "Again", key: "1", intervalMs: 10 * 60_000 },
  { rating: "hard", label: "Hard", key: "2", intervalMs: 86_400_000 },
  { rating: "good", label: "Good", key: "3", intervalMs: 4 * 86_400_000 },
  { rating: "easy", label: "Easy", key: "4", intervalMs: 15 * 86_400_000 },
];

export function ReviewLoop({
  queue,
  scope,
  onRate,
  onUndo,
  onBury,
  onSuspend,
  emptyHeading,
  emptyBody,
  doneHref,
  doneLabel,
}: {
  queue: ReviewQueue;
  scope: "review" | "cram";
  onRate: (rating: ReviewRating) => void;
  onUndo: () => void;
  onBury?: (unitId: string) => void;
  onSuspend?: (unitId: string) => void;
  emptyHeading: string;
  emptyBody: string;
  doneHref: string;
  doneLabel: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [lastRated, setLastRated] = useState<
    { rating: ReviewRating; intervalMs: number } | null
  >(null);

  const unit = queue.units[queue.position] ?? null;

  const handleRate = (rating: ReviewRating) => {
    const opt = RATING_OPTIONS.find((o) => o.rating === rating);
    setLastRated(opt ? { rating, intervalMs: opt.intervalMs } : null);
    onRate(rating);
  };
  const handleUndo = () => {
    setLastRated(null);
    onUndo();
  };

  useKeybinding(scope, `${scope}.flip`, () => {
    if (unit) setRevealed((r) => !r);
  });
  for (const opt of RATING_OPTIONS) {
    useKeybinding(scope, `${scope}.rate.${opt.rating}`, () => {
      if (unit && revealed) handleRate(opt.rating);
    });
  }
  useKeybinding(scope, `${scope}.undo`, () => {
    if (queue.position > 0) handleUndo();
  });
  useKeybinding(scope, `${scope}.bury`, () => {
    if (unit && revealed && onBury) onBury(unit.id);
  });
  useKeybinding(scope, `${scope}.suspend`, () => {
    if (unit && revealed && onSuspend) onSuspend(unit.id);
  });

  if (!unit) {
    return (
      <section className="mx-auto flex max-w-xl flex-col items-center gap-4 py-24 text-center">
        <p className="font-serif text-3xl text-[var(--color-text)]">
          {emptyHeading}
        </p>
        <p className="text-pretty text-sm leading-relaxed text-[var(--color-muted)]">
          {emptyBody}
        </p>
        <Link href={doneHref}>
          <Button variant="primary" size="lg">
            {doneLabel}
          </Button>
        </Link>
      </section>
    );
  }

  const progress = queue.units.length - queue.position;
  const ratings = queue.position + 1 === queue.units.length;

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6">
      <header className="flex items-center justify-between">
        <p className="font-mono text-xs text-[var(--color-muted)]">
          {progress} left · {unit.deckName}
        </p>
        <p className="font-mono text-xs text-[var(--color-muted)]">
          {scope === "review" ? "review" : "cram"} · {queue.position + 1}/
          {queue.units.length}
        </p>
      </header>

      <article
        className="flex min-h-64 flex-col justify-center rounded-xl border border-[var(--color-surface)] bg-[var(--color-surface)]/60 px-6 py-10 text-lg leading-relaxed text-[var(--color-text)]"
        aria-live="polite"
      >
        <CardContent
          content={unit.content}
          side={revealed ? "answer" : "question"}
        />
      </article>

      {revealed ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {RATING_OPTIONS.map((opt) => (
              <Button
                key={opt.rating}
                variant={
                  opt.rating === "again" ? "destructive" : "outline"
                }
                busy={false}
                onClick={() => onRate(opt.rating)}
                className="flex-col gap-1 py-4"
              >
                <span className="flex items-center gap-2">
                  {opt.label}
                  <Kbd>{opt.key}</Kbd>
                </span>
                <span className="font-mono text-[11px] font-normal">
                  {formatUntil(opt.intervalMs)}
                </span>
              </Button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {onBury && (
                <button
                  onClick={() => onBury(unit.id)}
                  className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
                >
                  <Archive className="h-3.5 w-3.5" />
                  Bury
                  <Kbd>b</Kbd>
                </button>
              )}
              {onSuspend && (
                <button
                  onClick={() => onSuspend(unit.id)}
                  className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
                >
                  <CircleAlert className="h-3.5 w-3.5" />
                  Suspend
                  <Kbd>s</Kbd>
                </button>
              )}
            </div>
            <button
              onClick={handleUndo}
              disabled={queue.position === 0}
              className={cn(
                "flex items-center gap-1.5 text-xs transition-colors",
                queue.position === 0
                  ? "cursor-default text-[var(--color-muted)]/40"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)]",
              )}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo
              <Kbd>u</Kbd>
            </button>
          </div>
        </>
      ) : (
        <div className="flex justify-center">
          <Button variant="primary" size="lg" onClick={() => setRevealed(true)}>
            <Eye className="h-4 w-4" />
            Show answer
            <Kbd className="bg-transparent text-[var(--color-on-accent)]/70">
              space
            </Kbd>
          </Button>
        </div>
      )}
      {lastRated && (
        <div className="flex items-center justify-center gap-3 rounded-lg border border-[var(--color-surface)] bg-[var(--color-surface)]/50 px-4 py-2.5 text-xs text-[var(--color-muted)]">
          <span>
            {RATING_OPTIONS.find((o) => o.rating === lastRated.rating)?.label} —{" "}
            {formatUntil(lastRated.intervalMs)}
          </span>
          <button
            onClick={handleUndo}
            className="text-[var(--color-accent)] transition-colors hover:text-[var(--color-text)]"
          >
            Undo
          </button>
        </div>
      )}
    </section>
  );
}
