import { useLayoutEffect, useMemo, useRef } from "react";
import { cell, defineChart } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { decorative } from "@tanstack/charts/mark/decorative";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleOrdinal } from "@tanstack/charts/scales/ordinal";
import { tooltip } from "@tanstack/charts/tooltip";
import { cn, plural } from "@/lib/utils";

export type HeatmapDay = {
  /** Calendar date (YYYY-MM-DD) in the library's time zone. */
  key: string;
  count: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
};

/**
 * Fills from no reviews to the busiest days. Mixing with the surface instead
 * of transparency keeps every level opaque, so the page grid never shows
 * through a cell.
 */
const LEVEL_FILLS = [
  "var(--color-border)",
  "color-mix(in srgb, var(--color-accent) 28%, var(--color-surface))",
  "color-mix(in srgb, var(--color-accent) 52%, var(--color-surface))",
  "color-mix(in srgb, var(--color-accent) 76%, var(--color-surface))",
  "var(--color-accent)",
];

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

/** Space kept clear right of the newest column, in pixels. */
const EDGE_ROOM = 4;

/** Height of the month label row above the cells, in pixels. */
const MONTH_ROW = 16;

const SIZES = {
  compact: { maxCell: 22, minCell: 12, gap: 3 },
  full: { maxCell: 18, minCell: 11, gap: 3 },
} as const;

const DAY_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const DAY_WEEKDAY_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" });

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Format a study-day key without letting the browser's zone shift the date. */
export function formatStudyDay(key: string) {
  return DAY_FORMAT.format(dateFromKey(key));
}

/** Quartiles of the busiest day, so the peak day always gets the full accent. */
function levelFor(count: number, peak: number) {
  if (count <= 0) return 0;
  return Math.max(1, Math.min(4, Math.ceil((count / peak) * 4)));
}

/**
 * Month labels sit over the first week column whose days start that month.
 * A label too close to the left edge to fit before the next one is dropped.
 */
function monthLabels(days: readonly HeatmapDay[], offset: number) {
  const labels: { week: number; text: string }[] = [];
  let lastMonth = "";
  days.forEach((day, index) => {
    const month = day.key.slice(0, 7);
    if (month === lastMonth) return;
    lastMonth = month;
    const week = Math.floor((offset + index) / 7);
    // A month that begins mid-week is labeled from its first full column.
    const column = day.weekday === 0 || index === 0 ? week : week + 1;
    labels.push({ week: column, text: MONTH_FORMAT.format(dateFromKey(day.key)) });
  });
  return labels.filter((label, index) => {
    const next = labels[index + 1];
    return !next || next.week - label.week >= 3;
  });
}

/**
 * Review activity as a GitHub-style calendar drawn with TanStack Charts: one
 * column per week, oldest to newest, with days aligned to their weekday in the
 * library's time zone. Cells stretch to fill the container up to a comfortable
 * size; on narrow screens the calendar scrolls, starting at the current week.
 * Today's cell is outlined so the newest column is easy to find.
 */
export function ReviewHeatmap({
  days,
  size = "full",
  className,
}: {
  days: readonly HeatmapDay[];
  size?: "compact" | "full";
  className?: string;
}) {
  const { maxCell, minCell, gap } = SIZES[size];
  const offset = days[0]?.weekday ?? 0;
  const weeks = Math.max(1, Math.ceil((offset + days.length) / 7));
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const scroller = useRef<HTMLDivElement>(null);
  const label =
    total === 0
      ? `No reviews in the last ${days.length} days.`
      : `Review activity: ${plural(total, "review")} across ${days.length} days.`;

  const months = useMemo(() => monthLabels(days, offset), [days, offset]);

  const definition = useMemo(() => {
    const peak = Math.max(1, ...days.map((day) => day.count));
    const cells = days.map((day, index) => ({
      ...day,
      week: Math.floor((offset + index) / 7),
      level: levelFor(day.count, peak),
    }));
    const today = cells.slice(-1);
    const band = (count: number) => () =>
      scaleBand<number>()
        .domain(Array.from({ length: count }, (_, index) => index))
        .paddingInner(gap / (maxCell + gap));
    return defineChart({
      marks: [
        cell(cells, {
          x: "week",
          y: "weekday",
          color: "level",
          key: "key",
          inset: 0,
          radius: 2,
        }),
        decorative(
          cell(today, {
            x: "week",
            y: "weekday",
            key: "key",
            fill: "transparent",
            stroke: "var(--color-ink)",
            strokeWidth: 1.5,
            inset: 0.75,
            radius: 2,
          }),
        ),
      ],
      scales: {
        x: { scale: band(weeks), axis: false },
        y: { scale: band(7), axis: false },
      },
      color: {
        scale: scaleOrdinal<number, string>().domain([0, 1, 2, 3, 4]).range(LEVEL_FILLS),
      },
      tooltip: {
        use: tooltip,
        format: (point) =>
          `${DAY_WEEKDAY_FORMAT.format(dateFromKey(point.datum.key))}: ${plural(
            point.datum.count,
            "review",
          )}`,
      },
    });
  }, [days, offset, weeks, gap, maxCell]);

  // Start scrolled to the current week when the calendar is wider than its
  // container, so a phone shows recent activity first.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (node) node.scrollLeft = node.scrollWidth;
  }, [weeks]);

  const chartWidth = weeks * (maxCell + gap) - gap;
  const chartHeight = 7 * (maxCell + gap) - gap;
  // Weekday labels (24px plus the 8px gap) and room past the last column, so
  // today's outline never meets the scroller's clipping edge at any width.
  const frameWidth = chartWidth + 32 + EDGE_ROOM;

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex min-w-0 gap-2" style={{ maxWidth: frameWidth }}>
        <div
          aria-hidden
          className="grid shrink-0 grid-rows-7 pb-1 text-[10px] leading-none text-muted"
          style={{ paddingTop: MONTH_ROW, rowGap: gap }}
        >
          {WEEKDAY_LABELS.map((text, index) => (
            <span key={index} className="flex w-6 items-center">
              {text}
            </span>
          ))}
        </div>
        <div ref={scroller} className="armin-scrollbar min-w-0 flex-1 overflow-x-auto pb-1">
          <div
            style={{
              minWidth: weeks * minCell + (weeks - 1) * gap + EDGE_ROOM,
              paddingRight: EDGE_ROOM,
            }}
          >
            <div
              aria-hidden
              className="relative text-[10px] leading-none text-muted"
              style={{ height: MONTH_ROW }}
            >
              {months.map((month) => (
                <span
                  key={`${month.week}-${month.text}`}
                  className="absolute top-0"
                  style={{ left: `${(month.week / weeks) * 100}%` }}
                >
                  {month.text}
                </span>
              ))}
            </div>
            <Chart
              definition={definition}
              ariaLabel={label}
              aspectRatio={chartWidth / chartHeight}
              initialWidth={chartWidth}
            />
          </div>
        </div>
      </div>

      <div
        className="flex items-center justify-end gap-1 text-[10px] leading-none text-muted"
        style={{ maxWidth: frameWidth }}
      >
        <span className="mr-0.5">Less</span>
        {LEVEL_FILLS.map((fill) => (
          <span
            key={fill}
            className="size-2.5 rounded-[2px]"
            style={{ background: fill }}
            aria-hidden
          />
        ))}
        <span className="ml-0.5">More</span>
      </div>
    </div>
  );
}
