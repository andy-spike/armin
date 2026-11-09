export function markGraphPerf(name: string) {
  if (!import.meta.env.DEV && !window.__ARMIN_E2E__) return;
  performance.mark(`armin:graph:${name}`);
}

export function measureGraphPerf(name: string, start: string, end: string) {
  if (!import.meta.env.DEV && !window.__ARMIN_E2E__) return;
  try {
    performance.measure(`armin:graph:${name}`, `armin:graph:${start}`, `armin:graph:${end}`);
  } catch {}
}

export function scheduleGraphWork(work: () => void) {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(work, { timeout: 500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = globalThis.setTimeout(work, 0);
  return () => globalThis.clearTimeout(id);
}

export function afterCanvasPaint(work: () => void, fallbackMs = 250) {
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
  const timeout = window.setTimeout(run, fallbackMs);
  return () => {
    done = true;
    cancelAnimationFrame(outer);
    cancelAnimationFrame(inner);
    window.clearTimeout(timeout);
  };
}
