import { useQuery } from "@tanstack/react-query";
import { formatInterval } from "@armin/core/study";
import { Badge, StateBadge, type ReviewState } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { TruncatedLabel } from "@/components/ui/truncated-label";
import { cardInfoQuery } from "@/lib/queries";
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

/** Relative due time that fits a narrow stat column; the exact time is the tooltip. */
function formatDue(due: number, now: number) {
  return due <= now ? "Now" : `in ${formatInterval(now, due)}`;
}

function formatPercent(value: number | null) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const content = (
    <div className="min-w-0 border-border px-4 py-3 [&:not(:nth-child(3n+1))]:border-l [&:nth-child(n+4)]:border-t">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 truncate font-serif text-lg font-semibold text-ink tabular-nums">
        {value}
      </dd>
    </div>
  );
  return hint ? <Tooltip content={hint}>{content}</Tooltip> : content;
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
  const query = useQuery(cardInfoQuery(open ? flashcardId : null));

  const data = query.data;
  const front = data ? stripMarkdownForPreview(data.flashcard.front) : "";
  const back = data ? stripMarkdownForPreview(data.flashcard.back) : "";

  return (
    <Dialog open={open} onClose={onClose} title="Card info" className="max-w-2xl">
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
          <div className="border border-border">
            <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 border-b border-border bg-bg-2 px-4 py-2 text-xs">
              <span className="text-muted">Deck</span>
              <TruncatedLabel label={data.flashcard.deckName} className="text-ink" />
            </div>
            <dl className="divide-y divide-border">
              <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 px-4 py-3">
                <dt className="text-xs text-muted">Front</dt>
                <dd className="line-clamp-3 text-pretty font-medium text-ink">
                  {front || "\u00a0"}
                </dd>
              </div>
              <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 px-4 py-3">
                <dt className="text-xs text-muted">Back</dt>
                <dd className="line-clamp-3 text-pretty text-muted">{back || "\u00a0"}</dd>
              </div>
            </dl>
          </div>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Schedule</h3>
            {data.units.map((unit) => {
              const studied = unit.state !== 0;
              return (
                <div key={unit.reviewUnitId} className="border border-border">
                  <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5">
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
                    {data.units.length > 1 && (
                      <span className="ml-1 min-w-0 flex-1 truncate text-muted">
                        {stripMarkdownForPreview(unit.front)}
                      </span>
                    )}
                  </div>
                  {studied ? (
                    <dl className="grid grid-cols-3 border-t border-border">
                      <Stat
                        label="Due"
                        value={formatDue(unit.due, data.serverNow)}
                        hint={formatWhen(unit.due)}
                      />
                      <Stat
                        label="Recall chance"
                        value={formatPercent(unit.retrievability)}
                        hint="How likely you are to remember it right now"
                      />
                      <Stat
                        label="Stability"
                        value={`${unit.stability.toFixed(1)} days`}
                        hint="How long the memory lasts before recall drops to 90%"
                      />
                      <Stat label="Difficulty" value={`${unit.difficulty.toFixed(1)} / 10`} />
                      <Stat label="Reviews" value={String(unit.reps)} />
                      <Stat label="Lapses" value={String(unit.lapses)} hint="Times you forgot it" />
                    </dl>
                  ) : (
                    // A never-studied unit has no memory model yet.
                    <p className="border-t border-border px-4 py-3 text-muted">
                      Not studied yet. Its schedule starts after the first review.
                    </p>
                  )}
                </div>
              );
            })}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-ink">Review history</h3>
            {data.reviews.length === 0 ? (
              <p className="mt-2 border border-dashed border-border px-4 py-3 text-muted">
                No reviews yet.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border border border-border">
                {data.reviews.map((review) => (
                  <li
                    key={review.reviewLogId}
                    className="grid grid-cols-[minmax(0,1fr)_4rem_5.5rem_3.5rem] items-baseline gap-x-3 px-3 py-2"
                  >
                    <span className="text-xs text-muted tabular-nums">
                      {formatWhen(review.review)}
                    </span>
                    <span
                      className={cn("font-medium", review.rating === 1 ? "text-again" : "text-ink")}
                    >
                      {RATING_LABELS[review.rating] ?? "Rating"}
                    </span>
                    <span className="text-muted">{review.stateName}</span>
                    <Tooltip content="Interval this review scheduled">
                      <span className="text-right text-xs tabular-nums text-ink">
                        {formatInterval(0, review.intervalMs)}
                      </span>
                    </Tooltip>
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
