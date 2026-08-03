const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export function formatInterval(ms: number): string {
  if (ms < MINUTE) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (ms < HOUR) return `${Math.round(ms / MINUTE)}m`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
  if (ms < 30 * DAY) return `${Math.round(ms / DAY)}d`;
  if (ms < 365 * DAY) return `${Math.round(ms / (30 * DAY))}mo`;
  return `${Math.round(ms / (365 * DAY))}y`;
}

export function formatUntil(ms: number): string {
  const i = formatInterval(ms);
  return `${i} until it comes back`;
}

export function formatDueAt(timestamp: number): string {
  const diff = timestamp - Date.now();
  if (diff <= 0) return "due now";
  return `in ${formatInterval(diff)}`;
}

export function formatRelativeDay(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < DAY) return "today";
  if (diff < 2 * DAY) return "yesterday";
  return `${Math.floor(diff / DAY)} days ago`;
}
