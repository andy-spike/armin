import { useQuery } from "@tanstack/react-query";
import { formatInterval } from "@armin/core/study";
import { Badge, StateBadge, type ReviewState } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { armin } from "@/lib/armin-client";
import { stripMarkdownForPreview } from "@/lib/markdown-preview";
import { cn } from "@/lib/utils";

const RATING_LABELS: Record<number, string> = {
  1: "Again",
  2: "Hard",
  3: "Good",
  4: "Easy",
};

function formatWhen(ms: number) {
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatPercent(value: number | null) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-sm tabular-nums text-ink">{value}</dd>
    </div>
  );
}

/**
 * Everything the scheduler knows about one flashcard: each review unit's FSRS
 * state and recall probability, plus its recent review history. Data loads
 * only while the dialog is open, so Browse tiles stay cheap.
 */
export function CardInfoDialog({
  flashcardId,
  open,
  onClose,
}: {
  flashcardId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ["card-info", flashcardId],
    queryFn: () => (flashcardId ? armin.review.cardInfo(flashcardId) : Promise.resolve(null)),
    enabled: open && Boolean(flashcardId),
    staleTime: 10_000,
  });

  const data = query.data;
  const front = data ? stripMarkdownForPreview(data.flashcard.front) : "";
  const back = data ? stripMarkdownForPreview(data.flashcard.back) : "";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Card info"
      description={data ? data.flashcard.deckName : undefined}
      className="max-w-2xl"
    >
      {query.isError ? (
        <p role="alert" className="text-sm text-muted">
          Couldn&apos;t load this card&apos;s details. Check your connection and try again.
        </p>
      ) : !data ? (
        <div role="status" aria-busy className="space-y-3">
          <span className="sr-only">Loading card info…</span>
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="space-y-6 text-sm">
          <div className="border border-border bg-surface-sunken p-4">
            <p className="line-clamp-2 text-pretty font-medium text-ink">{front || "\u00a0"}</p>
            <p className="mt-1 line-clamp-3 text-pretty text-muted">{back || "\u00a0"}</p>
          </div>

          <section>
            <h3 className="text-sm font-semibold text-ink">Review units</h3>
            <ul className="mt-2 space-y-3">
              {data.units.map((unit) => (
                <li key={unit.reviewUnitId} className="border border-border bg-surface p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StateBadge state={unit.state as ReviewState} />
                    {unit.locked && <Badge className="bg-surface-sunken text-muted">Locked</Badge>}
                    {unit.archived && (
                      <Badge className="bg-surface-sunken text-muted">Archived</Badge>
                    )}
                    {unit.buried && (
                      <Badge className="bg-hard/15 text-hard">
                        Buried until {unit.buriedUntil ? formatWhen(unit.buriedUntil) : "tomorrow"}
                      </Badge>
                    )}
                    <span className="ml-auto font-mono text-xs text-muted">v{unit.version}</span>
                  </div>
                  <p className="mt-2 line-clamp-1 text-pretty text-ink/90">{unit.front}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                    <Stat label="Due" value={formatWhen(unit.due)} />
                    <Stat label="Stability" value={unit.stability.toFixed(2)} />
                    <Stat label="Difficulty" value={unit.difficulty.toFixed(2)} />
                    <Stat label="Retrievability" value={formatPercent(unit.retrievability)} />
                    <Stat label="Reps" value={String(unit.reps)} />
                    <Stat label="Lapses" value={String(unit.lapses)} />
                  </dl>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-ink">Review history</h3>
            {data.reviews.length === 0 ? (
              <p className="mt-2 text-muted">No reviews yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border border border-border">
                {data.reviews.map((review) => (
                  <li
                    key={review.reviewLogId}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2"
                  >
                    <span className="font-mono text-xs text-muted">
                      {formatWhen(review.review)}
                    </span>
                    <span
                      className={cn("font-medium", review.rating === 1 ? "text-again" : "text-ink")}
                    >
                      {RATING_LABELS[review.rating] ?? "Rating"}
                    </span>
                    <span className="text-muted">{review.stateName}</span>
                    <span className="font-mono text-xs tabular-nums text-ink">
                      {formatInterval(0, review.intervalMs)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {data.historyTruncated && (
              <p className="mt-2 text-xs text-muted">
                Showing the most recent {data.historyLimit} reviews.
              </p>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}
