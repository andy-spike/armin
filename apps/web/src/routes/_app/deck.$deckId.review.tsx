import { createFileRoute, Link } from "@tanstack/react-router";
import { deckQuery as deckQueryOptions, prefetchReviewPage, reviewQueueQuery } from "@/lib/queries";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BackToDeckLink, SessionDeckNotFound } from "@/components/deck-not-found";
import { Button } from "@/components/ui/button";
import { ReviewSession } from "@/components/review-session/review-session";
import { useReviewActions } from "@/lib/use-review-actions";
import { useStudyClock } from "@/lib/study-clock";
import { toUiReviewUnit } from "@/types/view-models";

function ReviewPage() {
  const { resolvedDeckId: deckId, deckSlug } = Route.useRouteContext();
  const now = useStudyClock();
  const actions = useReviewActions();

  const deckQuery = useQuery(deckQueryOptions(deckId, now));
  // Live so newly unlocked or newly due units appear without a reload, and
  // the study clock advances so units become due without any data write.
  const queueQuery = useQuery(reviewQueueQuery(deckId, now));

  const queue = useMemo(
    () => (queueQuery.data?.items ?? []).map(toUiReviewUnit),
    [queueQuery.data],
  );

  if (!deckQuery.isLoading && !deckQuery.isError && !deckQuery.data) {
    return <SessionDeckNotFound />;
  }

  return (
    <ReviewSession
      resetKey={deckId}
      queue={queue}
      isLoading={deckQuery.isLoading || queueQuery.isLoading}
      isError={deckQuery.isError || queueQuery.isError}
      onRetry={() => {
        void deckQuery.refetch();
        void queueQuery.refetch();
      }}
      {...actions}
      header={
        <div className="min-w-0">
          <BackToDeckLink deckSlug={deckSlug} />
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">Review</h1>
        </div>
      }
      doneAction={
        <Link to="/deck/$deckId" params={{ deckId: deckSlug }}>
          <Button variant="outline">Back to deck</Button>
        </Link>
      }
      doneDescription="You cleared every review unit due in this deck. New review units unlock as their prerequisites are learned."
      emptyDescription="Nothing is due here right now. Come back when review units are scheduled, or add more to get ahead."
    />
  );
}

export const Route = createFileRoute("/_app/deck/$deckId/review")({
  loader: ({ context }) => prefetchReviewPage(context.queryClient, context.resolvedDeckId),
  head: () => ({ meta: [{ title: "Deck review · Armin" }] }),
  component: ReviewPage,
  staticData: { fullbleed: true },
});
