"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query";
import { ReviewLoop } from "@/components/review-loop";
import type { ReviewQueue, ReviewRating } from "@/lib/shared/contracts";

export function ReviewPage({ deckId }: { deckId?: string }) {
  const { data: base, isLoading } = useQuery({
    queryKey: queryKeys.reviewQueue(deckId),
    queryFn: () => api.getReviewQueue(deckId),
  });

  const [queue, setQueue] = useState<ReviewQueue | null>(null);

  useEffect(() => {
    setQueue(base ?? null);
  }, [base]);

  if (isLoading || !queue) {
    return (
      <section className="flex min-h-[50vh] items-center justify-center">
        <p className="font-mono text-xs text-[var(--color-muted)]">
          loading review…
        </p>
      </section>
    );
  }

  const atEnd = queue.position >= queue.units.length;

  const handleRate = (rating: ReviewRating) => {
    if (atEnd) return;
    setQueue((q) => (q ? { ...q, position: q.position + 1 } : q));
  };

  const handleUndo = () => {
    setQueue((q) =>
      q ? { ...q, position: Math.max(0, q.position - 1) } : q,
    );
  };

  const handleBury = (unitId: string) => {
    if (atEnd) return;
    setQueue((q) => {
      if (!q) return q;
      const units = q.units.filter((u) => u.id !== unitId);
      return {
        units,
        position: Math.min(q.position, Math.max(0, units.length - 1)),
      };
    });
  };

  const handleSuspend = (unitId: string) => {
    handleBury(unitId);
  };

  return (
    <ReviewLoop
      queue={queue}
      scope="review"
      onRate={handleRate}
      onUndo={handleUndo}
      onBury={handleBury}
      onSuspend={handleSuspend}
      emptyHeading="Nothing due."
      emptyBody="Your queue is clear. Go browse a deck or come back tomorrow — the spaced repetition will have new work waiting."
      doneHref={deckId ? `/deck/${deckId}` : "/"}
      doneLabel={deckId ? "Back to deck" : "Back to decks"}
    />
  );
}
