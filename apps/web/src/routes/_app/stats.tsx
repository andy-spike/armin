import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Layers } from "lucide-react";
import { barY, defineChart } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
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
  const activeDays = stats.heatmap.days.filter((day) => day.count > 0).length;
  return (
    <div className="space-y-5">
      <Panel
        title="Review activity"
        hint={`${deckLabel} · ${plural(stats.heatmap.total, "review")} in the last ${weeks} weeks`}
      >
        <ReviewHeatmap days={stats.heatmap.days} />
        {stats.heatmap.total === 0 && (
          <p className="mt-4 border-t border-border pt-4 text-sm text-muted">
            No reviews yet. Finish a review session and your activity will appear here.
          </p>
        )}
        {stats.truncated && (
          <p className="mt-3 text-xs text-muted">
            Activity only includes your most recent reviews in this range.
          </p>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
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
          />
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="True retention" hint="Last 30 days" className="lg:col-span-2">
          <Retention retention={stats.retention} />
        </Panel>
        <Panel title="Streaks" hint={`Last ${weeks} weeks`}>
          <Streaks streak={stats.streak} activeDays={activeDays} />
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
    <section className={cn("flex flex-col border border-border bg-surface", className)}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </header>
      <div className="flex-1 p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** A large figure with its unit, used for each panel's headline number. */
function Figure({
  value,
  unit,
  size = "lg",
}: {
  value: React.ReactNode;
  unit?: string;
  size?: "lg" | "md";
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        className={cn(
          "font-serif leading-none font-semibold tabular-nums text-ink",
          size === "lg" ? "text-4xl" : "text-2xl",
        )}
      >
        {value}
      </span>
      {unit && <span className="text-sm text-muted">{unit}</span>}
    </span>
  );
}

const SHORT_DAY_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function shortStudyDay(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return SHORT_DAY_FORMAT.format(new Date(Date.UTC(year, month - 1, day)));
}

const BAR_TONES = {
  review: { opacity: 1, unit: "review" },
  due: { opacity: 0.55, unit: "review unit" },
} as const;

/**
 * TanStack Charts bars over study-day buckets, under a headline total. Pointer
 * and keyboard focus name each bar's date and count in a tooltip; the chart's
 * accessible label carries the series total. The forecast's first bar is
 * today and includes overdue units.
 */
function DayBarChart({
  series,
  tone,
  empty,
  ariaLabel,
}: {
  series: StatsOverview["daily"];
  tone: keyof typeof BAR_TONES;
  empty: string;
  ariaLabel: string;
}) {
  const { opacity, unit } = BAR_TONES[tone];
  const forecast = tone === "due";
  const definition = useMemo(() => {
    const keys = series.days.map((day) => day.key);
    const tickLabel = (key: string) => (forecast && key === keys[0] ? "Today" : shortStudyDay(key));
    const tooltipLabel = (key: string) =>
      forecast && key === keys[0] ? "Today (with overdue)" : formatStudyDay(key);
    return defineChart({
      marks: [
        barY(series.days, {
          x: "key",
          y: "count",
          fill: "var(--color-accent)",
          fillOpacity: opacity,
          radius: { end: 1 },
        }),
      ],
      scales: {
        x: {
          scale: () => scaleBand<string>().domain(keys).padding(0.18),
          axis: {
            line: { stroke: "var(--color-border-strong)" },
            ticks: {
              values: [keys[0], keys[Math.floor(keys.length / 2)], keys[keys.length - 1]],
              format: tickLabel,
              line: false,
              padding: 10,
            },
            // The end labels hang inward so they stay inside the plot.
            tickLabels: {
              anchor: ({ index }) => (index === 0 ? "start" : index === 2 ? "end" : "middle"),
            },
          },
        },
        y: {
          scale: scaleLinear,
          nice: true,
          // An empty series still draws a readable 0–1 frame.
          domain: series.max === 0 ? [0, 1] : undefined,
          grid: { stroke: "var(--color-border)", strokeDasharray: "2 3" },
          axis: {
            line: false,
            ticks: {
              count: 3,
              line: false,
              padding: 10,
              // The baseline already marks zero; labeling it crowds the dates.
              format: (value) => (value !== 0 && Number.isInteger(value) ? String(value) : ""),
            },
          },
        },
      },
      theme: {
        foreground: "var(--color-ink)",
        muted: "var(--color-muted)",
      },
      tooltip: {
        use: tooltip,
        format: (point) => `${tooltipLabel(point.datum.key)}: ${plural(point.datum.count, unit)}`,
      },
    });
  }, [series, opacity, unit, forecast]);

  const first = series.days[0]?.count ?? 0;
  const average = series.days.length === 0 ? 0 : series.total / series.days.length;
  const detail =
    series.total === 0
      ? empty
      : forecast
        ? `${first === 0 ? "Nothing" : first} due today · busiest day ${series.max}`
        : `${average < 10 ? average.toFixed(1) : Math.round(average)} a day on average · best day ${series.max}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Figure value={series.total} unit={series.total === 1 ? unit : `${unit}s`} size="md" />
        <span className="text-xs text-muted">{detail}</span>
      </div>
      <Chart definition={definition} ariaLabel={ariaLabel} height={176} initialWidth={520} />
    </div>
  );
}

function Retention({ retention }: { retention: StatsOverview["retention"] }) {
  const percent = retention.ratio === null ? null : Math.round(retention.ratio * 100);
  const missed = retention.reviews - retention.retained;
  const retainedPct = retention.reviews === 0 ? 0 : (retention.retained / retention.reviews) * 100;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Figure value={percent === null ? "—" : `${percent}%`} />
        <span className="text-sm text-muted">
          {retention.reviews === 0
            ? "No Review-state answers in the last 30 days."
            : `${retention.retained} of ${plural(retention.reviews, "answer")} recalled`}
        </span>
      </div>

      <div
        className="mt-5 flex h-2.5 gap-px overflow-hidden bg-border"
        role="img"
        aria-label={
          retention.reviews === 0
            ? "No answers to show."
            : `${retention.retained} recalled, ${missed} forgotten.`
        }
      >
        {retention.retained > 0 && (
          <div className="h-full bg-good" style={{ width: `${retainedPct}%` }} />
        )}
        {missed > 0 && <div className="h-full flex-1 bg-again" />}
      </div>

      <dl className="mt-3 flex flex-wrap justify-between gap-x-6 gap-y-1 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="size-2 bg-good" aria-hidden />
          <dt className="text-muted">Recalled (Hard, Good, Easy)</dt>
          <dd className="font-medium tabular-nums text-ink">{retention.retained}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 bg-again" aria-hidden />
          <dt className="text-muted">Forgot (Again)</dt>
          <dd className="font-medium tabular-nums text-ink">{missed}</dd>
        </div>
      </dl>
      <p className="mt-auto pt-5 text-xs text-muted">
        Only answers to cards already in Review state count; learning steps are excluded.
      </p>
    </div>
  );
}

function Streaks({ streak, activeDays }: { streak: StatsOverview["streak"]; activeDays: number }) {
  const rows = [
    { label: "Longest streak", value: plural(streak.longest, "day") },
    { label: "Days studied", value: plural(activeDays, "day") },
  ];
  return (
    <div className="flex h-full flex-col gap-5">
      <div>
        <Figure value={streak.current} unit={streak.current === 1 ? "day" : "days"} />
        <p className="mt-2 text-xs text-muted">
          {streak.current === 0 ? "Review today to start a streak." : "Current streak"}
        </p>
      </div>
      <dl className="mt-auto divide-y divide-border border-t border-border pt-1 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 py-2 last:pb-0">
            <dt className="text-muted">{row.label}</dt>
            <dd className="font-medium tabular-nums text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
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

/** States that split the studyable units without overlap. */
const ACTIVE_STATE_ITEMS = STATE_ITEMS.slice(0, 4);

function StateCounts({ states }: { states: StatsOverview["states"] }) {
  const active = ACTIVE_STATE_ITEMS.reduce((sum, item) => sum + states[item.key], 0);
  // Locked and archived can overlap, so the bar shows them as one remainder.
  const setAside = states.total - active;
  return (
    <div className="space-y-5">
      <div
        className="flex h-2.5 gap-px overflow-hidden bg-border"
        role="img"
        aria-label={`${plural(active, "studyable unit")} and ${setAside} locked or archived.`}
      >
        {ACTIVE_STATE_ITEMS.map(
          (item) =>
            states[item.key] > 0 && (
              <div
                key={item.key}
                className={cn("h-full", item.color)}
                style={{ flexGrow: states[item.key] }}
              />
            ),
        )}
        {setAside > 0 && <div className="h-full bg-ui-3" style={{ flexGrow: setAside }} />}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
        {STATE_ITEMS.map((item) => {
          const count = states[item.key];
          const share = states.total === 0 ? 0 : Math.round((count / states.total) * 100);
          return (
            <div key={item.key} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs text-muted">
                <span className={cn("size-2 shrink-0", item.color)} aria-hidden />
                {item.label}
              </dt>
              <dd className="mt-1.5 flex items-baseline gap-1.5">
                <span className="font-serif text-2xl leading-none font-semibold tabular-nums text-ink">
                  {count}
                </span>
                {count > 0 && <span className="text-xs tabular-nums text-muted">{share}%</span>}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
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
