import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewSession } from "@/components/review-session";
import { armin } from "@/lib/armin-client";
import {
  cramFiltersFromSearch,
  cramSessionKey,
  shuffleCramItems,
  validateCramSearch,
} from "@/lib/cram";
import { cramQueueQuery, deckQuery as deckQueryOptions, prefetchCramPage } from "@/lib/queries";
import { useConnection } from "@/lib/session";
import { plural } from "@/lib/utils";
import { toUiReviewUnit } from "@/types/view-models";

const AGAIN_REPEAT_OFFSET = 3;

function CramPage() {
  const { deckId } = Route.useParams();
  const search = Route.useSearch();
  const { online } = useConnection();
  const deckQuery = useQuery(deckQueryOptions(deckId));
  const filters = useMemo(() => cramFiltersFromSearch(search), [search]);
  const queueQuery = useQuery(cramQueueQuery(deckId, filters));

  // The server returns every match; the session shuffles once per setup and
  // applies the requested cap, so practice order is not biased by due time.
  const queue = useMemo(() => {
    const items = (queueQuery.data?.items ?? []).map(toUiReviewUnit);
    const shuffled = shuffleCramItems(items);
    return search.max ? shuffled.slice(0, search.max) : shuffled;
  }, [queueQuery.data, search.max]);

  if (!deckQuery.isLoading && !deckQuery.isError && !deckQuery.data) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mt-16 flex flex-col items-center border border-border bg-bg-2 px-6 py-14 text-center">
          <h2 className="text-xl font-semibold">Deck not found</h2>
          <p className="mt-1 text-sm text-muted">This deck isn&apos;t in your library anymore.</p>
          <Link to="/" className="mt-6">
            <Button variant="outline">Back to decks</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ReviewSession
      resetKey={cramSessionKey(deckId, search)}
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
        // The session names the log id generically; cram's log is its own table.
        return result.status === "ok" ? { ...result, reviewLogId: result.cramLogId } : result;
      }}
      onUndo={async (entry, requestId) =>
        // Cram has no bury action, so its history only holds ratings.
        entry.kind === "review"
          ? armin.cram.undo({ cramLogId: entry.reviewLogId, requestId })
          : { status: "stale", message: "Only answers can be undone while cramming." }
      }
      header={
        <div className="min-w-0">
          <Link
            to="/deck/$deckId"
            params={{ deckId }}
            className="inline-flex items-center gap-1 rounded-sm text-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ArrowLeft className="h-4 w-4" /> Back to deck
          </Link>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">Cram</h1>
        </div>
      }
      subtitle={(remaining) =>
        remaining > 0
          ? `${plural(remaining, "card")} left in this practice session.`
          : "Practice only — your review schedule is unchanged."
      }
      doneAction={
        <Link to="/deck/$deckId" params={{ deckId }}>
          <Button variant="outline">Back to deck</Button>
        </Link>
      }
      doneDescription="You practiced every card in this cram session. Nothing was scheduled, and your review history is unchanged."
      emptyDescription="No cards matched this cram setup. Go back to the deck and widen the filters."
    />
  );
}

export const Route = createFileRoute("/_app/deck/$deckId/cram")({
  validateSearch: validateCramSearch,
  loader: ({ context, params }) => prefetchCramPage(context.queryClient, params.deckId),
  head: () => ({ meta: [{ title: "Cram · Armin" }] }),
  component: CramPage,
});
