import { useSyncExternalStore } from "react";

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

export function studyClockNow() {
  return now;
}

export function scheduleStudyClock(refreshAt: number) {
  if (typeof window === "undefined") return;
  if (pendingAt !== null && pendingAt <= refreshAt) return;
  if (timer) clearTimeout(timer);
  pendingAt = refreshAt;
  const delay = Math.max(1_000, refreshAt - Date.now() + 1_000);
  timer = setTimeout(advance, Math.min(delay, 2 ** 31 - 1));
}

if (typeof document !== "undefined") {
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

export function useStudyClock() {
  return useSyncExternalStore(subscribe, studyClockNow, studyClockNow);
}
