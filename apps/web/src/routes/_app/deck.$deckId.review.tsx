import { createFileRoute, Link } from "@tanstack/react-router";
import { deckQuery as deckQueryOptions, prefetchReviewPage, reviewQueueQuery } from "@/lib/queries";
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewSession } from "@/components/review-session";
import { useReviewActions } from "@/lib/use-review-actions";
import { reviewKeys } from "@/lib/armin-query";
import { toUiReviewUnit } from "@/types/view-models";

const QUEUE_POLL_MS = 15_000;

function ReviewPage() {
  const { deckId } = Route.useParams();
  const queryClient = useQueryClient();
  const actions = useReviewActions(deckId);

  const deckQuery = useQuery(deckQueryOptions(deckId));
  // Re-polled so newly due units (learning steps, local midnight) appear
  // without any data write.
  const queueQuery = useQuery({
    ...reviewQueueQuery(deckId),
    refetchInterval: QUEUE_POLL_MS,
    refetchOnWindowFocus: true,
  });

  const queue = useMemo(
    () => (queueQuery.data?.items ?? []).map(toUiReviewUnit),
    [queueQuery.data],
  );

  if (!deckQuery.isLoading && !deckQuery.isError && !deckQuery.data) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mt-16 flex flex-col items-center border border-border bg-bg-2 px-6 py-14 text-center">
          <h2 className="text-xl font-semibold">Deck not found</h2>
          <p className="mt-1 text-sm text-muted">
            This deck isn&apos;t in your library anymore.
          </p>
          <Link to="/" className="mt-6">
            <Button variant="outline">Back to decks</Button>
          </Link>
        </div>
      </div>
    );
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
        void queryClient.invalidateQueries({ queryKey: reviewKeys.all });
      }}
      {...actions}
      header={
        <div className="min-w-0">
          <Link
            to="/deck/$deckId"
            params={{ deckId }}
            className="inline-flex items-center gap-1 rounded-sm text-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ArrowLeft className="h-4 w-4" /> Back to deck
          </Link>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">
            Review
          </h1>
        </div>
      }
      doneAction={
        <Link to="/deck/$deckId" params={{ deckId }}>
          <Button variant="outline">Back to deck</Button>
        </Link>
      }
      doneDescription="You cleared every review unit due in this deck. New review units unlock as their prerequisites are learned."
      emptyDescription="Nothing is due here right now. Come back when review units are scheduled, or add more to get ahead."
    />
  );
}

export const Route = createFileRoute("/_app/deck/$deckId/review")({
  loader: ({ context, params }) => prefetchReviewPage(context.queryClient, params.deckId),
  component: ReviewPage,
});

