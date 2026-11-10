import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BackToDeckLink, SessionDeckNotFound } from "@/components/deck-not-found";
import { Button } from "@/components/ui/button";
import { ReviewSession } from "@/components/review-session/review-session";
import { armin } from "@/lib/armin-client";
import { cramFiltersFromSearch, cramSessionKey, validateCramSearch } from "@/lib/cram";
import { cramQueueQuery, deckQuery as deckQueryOptions, prefetchCramPage } from "@/lib/queries";
import { useConnection } from "@/lib/session";
import { plural } from "@/lib/utils";
import { toUiReviewUnit } from "@/types/view-models";

const AGAIN_REPEAT_OFFSET = 3;

function CramPage() {
  const { resolvedDeckId: deckId, deckSlug } = Route.useRouteContext();
  const search = Route.useSearch();
  const { online } = useConnection();
  const deckQuery = useQuery(deckQueryOptions(deckId));
  const filters = useMemo(() => cramFiltersFromSearch(search), [search]);
  const [seed] = useState(() => Math.floor(Math.random() * 4294967296));
  const queueQuery = useQuery(cramQueueQuery(deckId, filters, search.max, seed));

  const queue = useMemo(
    () => (queueQuery.data?.items ?? []).map(toUiReviewUnit),
    [queueQuery.data],
  );

  if (!deckQuery.isLoading && !deckQuery.isError && !deckQuery.data) {
    return <SessionDeckNotFound />;
  }

  return (
    <ReviewSession
      resetKey={cramSessionKey(deckId, search)}
      practiceSeed={seed}
      queue={queue}
      isLoading={deckQuery.isLoading || queueQuery.isLoading}
      isError={deckQuery.isError || queueQuery.isError}
      onRetry={() => {
        void deckQuery.refetch();
        void queueQuery.refetch();
      }}
      online={online}
      showIntervals={false}
      repeatAgainOffset={AGAIN_REPEAT_OFFSET}
      allowNewCards={false}
      doneTitle="Cram session complete"
      emptyTitle="Nothing to cram"
      loadPreview={(reviewUnitId) => armin.review.preview(reviewUnitId)}
      onRate={async (card, rating, requestId) => {
        const result = await armin.cram.rate({ reviewUnitId: card.id, rating, requestId });
        return result.status === "ok" ? { ...result, reviewLogId: result.cramLogId } : result;
      }}
      onUndo={async (entry, requestId) =>
        entry.kind === "review"
          ? armin.cram.undo({ cramLogId: entry.reviewLogId, requestId })
          : { status: "stale", message: "Only answers can be undone while cramming." }
      }
      header={
        <div className="min-w-0">
          <BackToDeckLink deckSlug={deckSlug} />
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">Cram</h1>
        </div>
      }
      subtitle={(remaining) =>
        remaining > 0
          ? `${plural(remaining, "card")} left in this practice session.`
          : "Practice only — your review schedule is unchanged."
      }
      doneAction={
        <Link to="/deck/$deckId" params={{ deckId: deckSlug }}>
          <Button variant="outline">Back to deck</Button>
        </Link>
      }
      doneDescription="You practiced every card in this session. Your due dates are unchanged."
      emptyDescription="No cards matched this cram setup. Go back to the deck and widen the filters."
    />
  );
}

export const Route = createFileRoute("/_app/deck/$deckId/cram")({
  validateSearch: validateCramSearch,
  loader: ({ context }) => prefetchCramPage(context.queryClient, context.resolvedDeckId),
  head: () => ({ meta: [{ title: "Cram · Armin" }] }),
  component: CramPage,
  staticData: { fullbleed: true },
});
