/**
 * Graph performance marks, recorded in development and E2E runs only. They
 * show up in the browser's Performance panel as `armin:graph:*`.
 */
export function markGraphPerf(name: string) {
  if (!import.meta.env.DEV && !window.__ARMIN_E2E__) return;
  performance.mark(`armin:graph:${name}`);
}

export function measureGraphPerf(name: string, start: string, end: string) {
  if (!import.meta.env.DEV && !window.__ARMIN_E2E__) return;
  try {
    performance.measure(`armin:graph:${name}`, `armin:graph:${start}`, `armin:graph:${end}`);
  } catch {
    // Marks are best-effort in development.
  }
}

/** Run work when the browser is idle (or soon, where idle callbacks are missing). */
export function scheduleGraphWork(work: () => void) {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(work, { timeout: 500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = globalThis.setTimeout(work, 0);
  return () => globalThis.clearTimeout(id);
}

/** Run work after the canvas has painted, with a 250 ms fallback. */
export function afterCanvasPaint(work: () => void) {
  let done = false;
  let inner = 0;
  const run = () => {
    if (done) return;
    done = true;
    work();
  };
  const outer = requestAnimationFrame(() => {
    inner = requestAnimationFrame(run);
  });
  const timeout = window.setTimeout(run, 250);
  return () => {
    done = true;
    cancelAnimationFrame(outer);
    cancelAnimationFrame(inner);
    window.clearTimeout(timeout);
  };
}
