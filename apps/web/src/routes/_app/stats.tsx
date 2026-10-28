import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Layers } from "lucide-react";
import type { StatsOverview } from "@armin/backend/types";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/combobox";
import { Skeleton } from "@/components/ui/skeleton";
import { formatStudyDay, ReviewHeatmap } from "@/components/review-heatmap";
import { buildDeckFilterOptions } from "@/lib/browse";
import { deckNamesQuery, prefetchStatsPage, statsOverviewQuery } from "@/lib/queries";
import { useStudyClock } from "@/lib/study-clock";
import { cn, plural } from "@/lib/utils";

const ALL_DECKS = "";

function StatsPage() {
  const [deckFilter, setDeckFilter] = useState(ALL_DECKS);
  const now = useStudyClock();
  const decksQuery = useQuery(deckNamesQuery());
  const overviewQuery = useQuery(statsOverviewQuery(deckFilter || undefined, now));

  const deckOptions = useMemo(
    () => buildDeckFilterOptions(decksQuery.data ?? []),
    [decksQuery.data],
  );
  const deckLabel = deckOptions.find((option) => option.value === deckFilter)?.label ?? "All decks";
  const overview = overviewQuery.data;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-balance">Stats</h1>
          <p className="mt-1.5 text-sm text-muted">
            Your review history, workload, and card states in one place.
          </p>
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-64">
          <span className="text-xs font-medium text-muted">Deck</span>
          <SearchableSelect
            value={deckFilter}
            onValueChange={setDeckFilter}
            options={deckOptions}
            placeholder="All decks"
            searchPlaceholder="Search decks…"
            emptyText="No decks found."
            aria-label="Filter stats by deck"
            icon={<Layers className="size-3.5 shrink-0 text-muted" aria-hidden />}
          />
        </div>
      </header>

      {overviewQuery.isLoading && <StatsSkeleton />}

      {overviewQuery.isError && (
        <div className="flex flex-col items-center border border-border bg-bg-2 px-6 py-14 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center bg-relearning-bg text-relearning">
            <AlertTriangle className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-semibold text-ink">Couldn&apos;t load your stats</h3>
          <p className="mt-1 max-w-[40ch] text-sm text-muted">
            Check your connection and try again. Your saved data is safe.
          </p>
          <Button variant="outline" className="mt-5" onClick={() => void overviewQuery.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {!overviewQuery.isLoading && !overviewQuery.isError && !overview && (
        <div className="border border-border bg-bg-2 px-6 py-14 text-center">
          <h3 className="text-base font-semibold text-ink">This deck is no longer available</h3>
          <p className="mt-1 text-sm text-muted">
            It may have been deleted. Choose another deck or view the whole library.
          </p>
          <Button variant="outline" className="mt-5" onClick={() => setDeckFilter(ALL_DECKS)}>
            View all decks
          </Button>
        </div>
      )}

      {overview && <StatsContent stats={overview} deckLabel={deckLabel} />}
    </div>
  );
}

function StatsContent({ stats, deckLabel }: { stats: StatsOverview; deckLabel: string }) {
  const weeks = Math.round(stats.heatmap.days.length / 7);
  return (
    <div className="space-y-4">
      <Panel
        title="Review activity"
        hint={`${deckLabel} · ${plural(stats.heatmap.total, "review")} in ${weeks} weeks`}
      >
        <ReviewHeatmap days={stats.heatmap.days} />
        {stats.heatmap.total === 0 && (
          <p className="mt-3 border-t border-border pt-3 text-sm text-muted">
            No reviews yet. Finish a review session and your activity will appear here.
          </p>
        )}
        {stats.truncated && (
          <p className="mt-2 text-xs text-muted">
            Activity only includes your most recent reviews in this range.
          </p>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Reviews per day" hint="Last 30 days">
          <DayBarChart
            series={stats.daily}
            tone="review"
            empty="No reviews in the last 30 days."
            ariaLabel={`Reviews per day over the last 30 days: ${plural(
              stats.daily.total,
              "review",
            )}.`}
          />
        </Panel>
        <Panel title="Due forecast" hint="Next 30 days · overdue counted today">
          <DayBarChart
            series={stats.forecast}
            tone="due"
            empty="Nothing due in the next 30 days."
            ariaLabel={`Due review units over the next 30 days: ${plural(
              stats.forecast.total,
              "review unit",
            )}.`}
            forecast
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="True retention" hint="Last 30 days" className="lg:col-span-2">
          <Retention retention={stats.retention} />
        </Panel>
        <Panel title="Streaks" hint="Consecutive review days · last 52 weeks">
          <Streaks streak={stats.streak} />
        </Panel>
      </div>

      <Panel
        title="Cards by state"
        hint={`${deckLabel} · ${plural(stats.states.total, "review unit")}`}
      >
        <StateCounts states={stats.states} />
      </Panel>
    </div>
  );
}

function Panel({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border border-border bg-surface p-4 sm:p-5", className)}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

const BAR_TONES = {
  review: "bg-accent",
  due: "bg-ink/55",
} as const;

/**
 * Plain CSS bars over study-day buckets. Each bar names its date and count in a
 * tooltip; the chart's accessible label carries the series total.
 */
function DayBarChart({
  series,
  tone,
  empty,
  ariaLabel,
  forecast = false,
}: {
  series: StatsOverview["daily"];
  tone: keyof typeof BAR_TONES;
  empty: string;
  ariaLabel: string;
  forecast?: boolean;
}) {
  const peak = Math.max(1, series.max);
  const first = series.days[0];
  const middle = series.days[Math.floor(series.days.length / 2)];
  const last = series.days[series.days.length - 1];
  const unit = tone === "review" ? "review" : "review unit";

  return (
    <div>
      <div
        className="flex h-32 items-end gap-px border-b border-border"
        role="img"
        aria-label={ariaLabel}
      >
        {series.days.map((day) => {
          const height = day.count === 0 ? 2 : Math.max(4, (day.count / peak) * 100);
          const dateLabel = forecast && day.key === first?.key ? "Today" : formatStudyDay(day.key);
          return (
            <div
              key={day.key}
              title={`${dateLabel}: ${plural(day.count, unit)}`}
              className="flex h-full flex-1 items-end"
            >
              <div
                className={cn(
                  "w-full transition-colors",
                  day.count === 0 ? "bg-border" : BAR_TONES[tone],
                )}
                style={{ height: `${height}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between gap-2 text-[11px] text-muted">
        <span>{forecast ? "Today" : first ? formatStudyDay(first.key) : ""}</span>
        <span>{middle ? formatStudyDay(middle.key) : ""}</span>
        <span>{last ? formatStudyDay(last.key) : ""}</span>
      </div>
      {series.total === 0 && <p className="mt-2 text-sm text-muted">{empty}</p>}
    </div>
  );
}

function Retention({ retention }: { retention: StatsOverview["retention"] }) {
  const percent = retention.ratio === null ? null : Math.round(retention.ratio * 100);
  const missed = retention.reviews - retention.retained;
  const retainedPct = retention.reviews === 0 ? 0 : (retention.retained / retention.reviews) * 100;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <span className="font-serif text-4xl leading-none font-semibold tabular-nums text-ink">
          {percent === null ? "—" : `${percent}%`}
        </span>
        <span className="pb-0.5 text-sm text-muted">
          {retention.reviews === 0
            ? "No Review-state answers in the last 30 days."
            : `${retention.retained} of ${retention.reviews} kept`}
        </span>
      </div>

      <div className="mt-4 flex h-2 bg-border">
        {retention.reviews > 0 && (
          <>
            <div className="h-full bg-good" style={{ width: `${retainedPct}%` }} />
            <div className="h-full flex-1 bg-again" />
          </>
        )}
      </div>

      <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 bg-good" aria-hidden />
          Hard · Good · Easy — {retention.retained}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 bg-again" aria-hidden />
          Again — {missed}
        </span>
      </div>
      <p className="mt-3 text-xs text-muted">
        Only answers to cards already in Review state count; learning steps are excluded.
      </p>
    </div>
  );
}

function Streaks({ streak }: { streak: StatsOverview["streak"] }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div className="font-serif text-3xl leading-none font-semibold tabular-nums text-ink">
          {streak.current}
        </div>
        <div className="mt-2 text-xs font-medium text-muted">Current streak</div>
        <div className="text-[11px] text-muted">{plural(streak.current, "day")}</div>
      </div>
      <div>
        <div className="font-serif text-3xl leading-none font-semibold tabular-nums text-ink">
          {streak.longest}
        </div>
        <div className="mt-2 text-xs font-medium text-muted">Longest streak</div>
        <div className="text-[11px] text-muted">{plural(streak.longest, "day")}</div>
      </div>
    </div>
  );
}

const STATE_ITEMS = [
  { key: "newCount", label: "New", color: "bg-new" },
  { key: "learningCount", label: "Learning", color: "bg-learning" },
  { key: "reviewCount", label: "Review", color: "bg-review" },
  { key: "relearningCount", label: "Relearning", color: "bg-relearning" },
  { key: "lockedCount", label: "Locked", color: "bg-muted" },
  { key: "archivedCount", label: "Archived", color: "bg-border-strong" },
] as const;

function StateCounts({ states }: { states: StatsOverview["states"] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
      {STATE_ITEMS.map((item) => (
        <div key={item.key}>
          <dt className="flex items-center gap-1.5 text-xs text-muted">
            <span className={cn("size-2", item.color)} aria-hidden />
            {item.label}
          </dt>
          <dd className="mt-1 font-mono text-lg tabular-nums text-ink">{states[item.key]}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatsSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy>
      <span className="sr-only">Loading stats</span>
      <div className="border border-border bg-surface p-4 sm:p-5">
        <Skeleton className="h-5 w-32 rounded-none" />
        <Skeleton className="mt-4 h-[74px] w-full rounded-none" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="border border-border bg-surface p-4 sm:p-5">
            <Skeleton className="h-5 w-28 rounded-none" />
            <Skeleton className="mt-4 h-32 w-full rounded-none" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="border border-border bg-surface p-4 sm:p-5 lg:col-span-2">
          <Skeleton className="h-5 w-28 rounded-none" />
          <Skeleton className="mt-4 h-20 w-full rounded-none" />
        </div>
        <div className="border border-border bg-surface p-4 sm:p-5">
          <Skeleton className="h-5 w-20 rounded-none" />
          <Skeleton className="mt-4 h-20 w-full rounded-none" />
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_app/stats")({
  loader: ({ context }) => prefetchStatsPage(context.queryClient),
  head: () => ({ meta: [{ title: "Stats · Armin" }] }),
  component: StatsPage,
});
