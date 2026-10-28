import { cn } from "@/lib/utils";

export type HeatmapDay = {
  /** Calendar date (YYYY-MM-DD) in the library's time zone. */
  key: string;
  count: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
};

const LEVEL_CLASSES = [
  "bg-border",
  "bg-accent/25",
  "bg-accent/45",
  "bg-accent/70",
  "bg-accent",
] as const;

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

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

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Format a study-day key without letting the browser's zone shift the date. */
export function formatStudyDay(key: string) {
  return DAY_FORMAT.format(dateFromKey(key));
}

function levelFor(count: number, peak: number) {
  if (count <= 0) return 0;
  return 1 + Math.min(3, Math.floor(((count - 1) / peak) * 4));
}

/**
 * Review activity as a GitHub-style calendar. Weeks run top-to-bottom in seven
 * columns, oldest to newest, with days aligned to their weekday in the
 * library's time zone. `compact` drops the weekday labels and legend for the
 * panel on the Decks page.
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
  const peak = Math.max(1, ...days.map((day) => day.count));
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const cells: (HeatmapDay | null)[] = Array.from({ length: days[0]?.weekday ?? 0 }, () => null);
  cells.push(...days);
  while (cells.length % 7 !== 0) cells.push(null);

  const cellSize = size === "compact" ? "size-2" : "size-3";
  const gap = size === "compact" ? "gap-[2px]" : "gap-[3px]";
  const label =
    total === 0
      ? `No reviews in the last ${days.length} days.`
      : `Review activity: ${total} ${total === 1 ? "review" : "reviews"} across ${days.length} days.`;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex min-w-0 gap-2">
        {size === "full" && (
          <div
            aria-hidden
            className={cn("grid shrink-0 grid-rows-7 text-[9px] leading-none text-muted", gap)}
          >
            {WEEKDAY_LABELS.map((text, index) => (
              <span key={index} className="flex h-3 items-center">
                {text}
              </span>
            ))}
          </div>
        )}
        <div className="armin-scrollbar min-w-0 overflow-x-auto pb-1">
          <div
            role="img"
            aria-label={label}
            className={cn("grid w-max grid-flow-col grid-rows-7", gap)}
          >
            {cells.map((day, index) =>
              day ? (
                <span
                  key={day.key}
                  title={`${DAY_WEEKDAY_FORMAT.format(dateFromKey(day.key))}: ${day.count} ${
                    day.count === 1 ? "review" : "reviews"
                  }`}
                  className={cn(
                    cellSize,
                    "transition-colors",
                    LEVEL_CLASSES[levelFor(day.count, peak)],
                  )}
                />
              ) : (
                <span key={`blank-${index}`} className={cn(cellSize, "bg-transparent")} />
              ),
            )}
          </div>
        </div>
      </div>

      {size === "full" && (
        <div className="flex items-center justify-end gap-1 text-[10px] text-muted">
          <span>Less</span>
          {LEVEL_CLASSES.map((level) => (
            <span key={level} className={cn("size-2.5", level)} aria-hidden />
          ))}
          <span>More</span>
        </div>
      )}
    </div>
  );
}
