import { useSyncExternalStore } from "react";

/*
 * The `now` argument of time-dependent queries (due counts, the review queue).
 * Convex re-runs a subscription when the data it read changes, but not when
 * time passes, so the argument has to move when time alone would change a
 * result. The server reports that moment (`review.status`'s `refreshAt`: the
 * next unit falling due or the next study day), and the clock advances then.
 * Every query shares the one value, so they re-run together, once, and only
 * when something actually became due.
 */

let now = Date.now();
let timer: ReturnType<typeof setTimeout> | undefined;
let pendingAt: number | null = null;
const listeners = new Set<() => void>();

function advance() {
  timer = undefined;
  pendingAt = null;
  now = Date.now();
  for (const listener of listeners) listener();
}

/** The clock value to pass as a query's `now` argument. */
export function studyClockNow() {
  return now;
}

/** Advance the clock at `refreshAt` (epoch ms, server time). */
export function scheduleStudyClock(refreshAt: number) {
  if (typeof window === "undefined") return;
  if (pendingAt !== null && pendingAt <= refreshAt) return;
  if (timer) clearTimeout(timer);
  pendingAt = refreshAt;
  // A second's margin absorbs clock skew; the floor keeps a clock that runs
  // ahead of the server from re-running queries in a tight loop.
  const delay = Math.max(1_000, refreshAt - Date.now() + 1_000);
  // Timers beyond ~24.8 days overflow; a day-boundary refresh comes sooner.
  timer = setTimeout(advance, Math.min(delay, 2 ** 31 - 1));
}

if (typeof document !== "undefined") {
  // Background tabs throttle timers; catch up as soon as the tab is visible.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && pendingAt !== null && Date.now() >= pendingAt) {
      if (timer) clearTimeout(timer);
      advance();
    }
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The study clock, re-rendering when it advances. */
export function useStudyClock() {
  return useSyncExternalStore(subscribe, studyClockNow, studyClockNow);
}
