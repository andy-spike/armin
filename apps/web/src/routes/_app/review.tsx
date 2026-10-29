import { createFileRoute, Link } from "@tanstack/react-router";
import { deckNamesQuery, prefetchReviewPage, reviewQueueQuery } from "@/lib/queries";
import { plural } from "@/lib/utils";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReviewSession } from "@/components/review-session";
import { toUiReviewUnit } from "@/types/view-models";
import { useReviewActions } from "@/lib/use-review-actions";
import { useStudyClock } from "@/lib/study-clock";

const ALL_DECKS = "all";

function ReviewsPage() {
  const [selectedDeckId, setSelectedDeckId] = useState(ALL_DECKS);
  const now = useStudyClock();

  const decksQuery = useQuery(deckNamesQuery());

  // A live Convex query, not a poll: the client keeps the session in sync when
  // a rating unlocks a dependent that the server queue admits, and the study
  // clock moves when a unit falls due.
  const queueQuery = useQuery(
    reviewQueueQuery(selectedDeckId === ALL_DECKS ? undefined : selectedDeckId, now),
  );

  const queue = useMemo(
    () => (queueQuery.data?.items ?? []).map(toUiReviewUnit),
    [queueQuery.data],
  );

  const deckOptions = useMemo(
    () => [
      { value: ALL_DECKS, label: "All decks" },
      ...(decksQuery.data ?? []).map((deck) => ({
        value: deck.id,
        label: deck.name,
      })),
    ],
    [decksQuery.data],
  );

  const actions = useReviewActions();

  return (
    <ReviewSession
      resetKey={selectedDeckId}
      queue={queue}
      isLoading={queueQuery.isLoading || decksQuery.isLoading}
      isError={queueQuery.isError}
      onRetry={() => void queueQuery.refetch()}
      {...actions}
      deckSelector={
        <Select
          value={selectedDeckId}
          items={deckOptions}
          onValueChange={(value) => setSelectedDeckId(value ?? ALL_DECKS)}
        >
          <SelectTrigger
            size="sm"
            className="w-full min-w-0 border-border-strong sm:w-auto sm:max-w-[20rem] [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate"
            aria-label="Deck to review"
          >
            <Layers className="h-3.5 w-3.5 shrink-0 text-muted" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            align="end"
            alignItemWithTrigger={false}
            className="w-72 max-w-[calc(100vw-2rem)]"
          >
            <SelectGroup>
              {deckOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      }
      header={<h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">Review</h1>}
      subtitle={(remaining) =>
        remaining > 0
          ? `${plural(remaining, "review unit")} due today across your decks.`
          : "Everything due across your decks, in one queue."
      }
      doneAction={
        <Link to="/">
          <Button variant="outline">Back to decks</Button>
        </Link>
      }
      doneDescription="You cleared every review unit due today. New review units unlock as their prerequisites are learned."
      emptyDescription="Nothing is due right now. Come back when review units are scheduled, or add more to get ahead."
    />
  );
}

export const Route = createFileRoute("/_app/review")({
  loader: ({ context }) => prefetchReviewPage(context.queryClient),
  head: () => ({ meta: [{ title: "Review · Armin" }] }),
  component: ReviewsPage,
  staticData: { fullbleed: true },
});
