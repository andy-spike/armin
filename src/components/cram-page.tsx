"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query";
import { ReviewLoop } from "@/components/review-loop";
import { Button } from "@/components/ui/button";
import type { CramPool, ReviewQueue, ReviewRating } from "@/lib/shared/contracts";

export function CramPage() {
  const { data: decks } = useQuery({
    queryKey: queryKeys.decks,
    queryFn: () => api.getDecks(),
  });

  const [pool, setPool] = useState<CramPool>({
    deckIds: [],
    combine: false,
    tags: [],
  });
  const [running, setRunning] = useState(false);
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [loading, setLoading] = useState(false);

  const start = async () => {
    if (!pool.deckIds.length) return;
    setLoading(true);
    const q = await api.getCramQueue(pool);
    setQueue(q);
    setRunning(true);
    setLoading(false);
  };

  const stop = () => {
    setRunning(false);
    setQueue(null);
  };

  const rate = (rating: ReviewRating) => {
    setQueue((q) => (q ? { ...q, position: q.position + 1 } : q));
  };

  const undo = () => {
    setQueue((q) => (q ? { ...q, position: Math.max(0, q.position - 1) } : q));
  };

  if (running && queue) {
    const atEnd = queue.position >= queue.units.length;
    return (
      <section className="flex flex-col gap-6">
        <div className="flex justify-end">
          <button
            onClick={stop}
            className="text-xs text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
          >
            End cram session
          </button>
        </div>
        <ReviewLoop
          queue={queue}
          scope="cram"
          onRate={rate}
          onUndo={undo}
          emptyHeading="Cram complete."
          emptyBody="That pool is exhausted. End the session or start a new one."
          doneHref="/cram"
          doneLabel="New cram session"
        />
      </section>
    );
  }

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-8">
      <header>
        <h1 className="font-serif text-3xl text-[var(--color-text)]">Cram</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Build a one-off pool from your decks, then run through it fast.
          Cram sessions don't change your schedule.
        </p>
      </header>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="pb-1 text-xs font-medium text-[var(--color-text)]">
          Pool decks
        </legend>
        {decks?.map((deck) => {
          const checked = pool.deckIds.includes(deck.id);
          return (
            <label
              key={deck.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--color-surface)] px-4 py-3 transition-colors hover:border-[var(--color-surface-strong)]"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  setPool((p) => ({
                    ...p,
                    deckIds: checked
                      ? p.deckIds.filter((id) => id !== deck.id)
                      : [...p.deckIds, deck.id],
                  }))
                }
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              <span className="flex-1 font-serif text-base text-[var(--color-text)]">
                {deck.name}
              </span>
              <span className="font-mono text-xs text-[var(--color-muted)]">
                {deck.cardCount} cards
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="flex flex-col gap-4">
        <label className="flex cursor-pointer items-center gap-3 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            checked={pool.combine}
            onChange={() => setPool((p) => ({ ...p, combine: !p.combine }))}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          Shuffle decks together
        </label>
        <div>
          <Button
            variant="primary"
            size="lg"
            onClick={start}
            busy={loading}
            disabled={!pool.deckIds.length}
          >
            Start cramming
          </Button>
        </div>
      </div>
    </section>
  );
}
