/**
 * Lightweight client performance monitoring.
 *
 * - Collects Core Web Vitals (LCP, CLS, INP/first-input, TTFB) with
 *   PerformanceObserver — no external dependency, no extra network calls.
 * - Records custom marks (map load, geolocation, route changes).
 * - Keeps the last events in memory on `window.__lumoroPerf` so anyone can
 *   inspect them from the console, and logs slow entries as warnings.
 *
 * It is intentionally fire-and-forget: any failure here must never affect
 * rendering.
 */

export type PerfEvent = {
  name: string;
  value: number;
  unit: "ms" | "score";
  at: number;
  detail?: Record<string, unknown>;
};

const MAX_EVENTS = 100;
const events: PerfEvent[] = [];
const listeners = new Set<(e: PerfEvent) => void>();

// Warn thresholds (ms) — roughly the "needs improvement" boundary.
const THRESHOLDS: Record<string, number> = {
  LCP: 2500,
  INP: 200,
  TTFB: 800,
  map_ready: 3000,
  geolocation: 6000,
  route_change: 1000,
};

function push(event: PerfEvent) {
  events.push(event);
  if (events.length > MAX_EVENTS) events.shift();
  listeners.forEach((l) => {
    try {
      l(event);
    } catch {
      /* listener errors are never fatal */
    }
  });
  const limit = THRESHOLDS[event.name];
  if (limit !== undefined && event.value > limit) {
    console.warn(
      `[perf] slow ${event.name}: ${Math.round(event.value)}${event.unit === "ms" ? "ms" : ""}`,
      event.detail ?? "",
    );
  }
}

export function getPerfEvents(): PerfEvent[] {
  return [...events];
}

export function onPerfEvent(listener: (e: PerfEvent) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Record a one-off measurement. */
export function markPerf(
  name: string,
  detail?: Record<string, unknown>,
  value = 0,
  unit: PerfEvent["unit"] = "ms",
) {
  push({ name, value, unit, at: Date.now(), detail });
}

/** Start a timer; call the returned function when the work finishes. */
export function startPerfTimer(name: string, detail?: Record<string, unknown>) {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  return (extra?: Record<string, unknown>) => {
    const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
    push({
      name,
      value: ended - started,
      unit: "ms",
      at: Date.now(),
      detail: { ...detail, ...extra },
    });
  };
}

let started = false;

/** Install the web-vitals observers. Safe to call more than once. */
export function initPerfMonitoring() {
  if (started || typeof window === "undefined") return;
  started = true;

  (window as unknown as { __lumoroPerf: () => PerfEvent[] }).__lumoroPerf = getPerfEvents;

  const observe = (
    type: string,
    cb: (entries: PerformanceEntryList) => void,
    extra?: PerformanceObserverInit,
  ) => {
    try {
      const obs = new PerformanceObserver((list) => cb(list.getEntries()));
      obs.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
      return obs;
    } catch {
      return null; // unsupported entry type in this browser
    }
  };

  // Time to first byte / navigation timing
  observe("navigation", (entries) => {
    const nav = entries[0] as PerformanceNavigationTiming | undefined;
    if (!nav) return;
    push({ name: "TTFB", value: nav.responseStart, unit: "ms", at: Date.now() });
    push({
      name: "dom_content_loaded",
      value: nav.domContentLoadedEventEnd,
      unit: "ms",
      at: Date.now(),
      detail: { type: nav.type },
    });
  });

  // Largest Contentful Paint — report the final value on hide.
  let lcp = 0;
  observe("largest-contentful-paint", (entries) => {
    const last = entries[entries.length - 1];
    if (last) lcp = last.startTime;
  });

  // Cumulative Layout Shift
  let cls = 0;
  observe("layout-shift", (entries) => {
    for (const entry of entries as unknown as Array<
      PerformanceEntry & { value: number; hadRecentInput: boolean }
    >) {
      if (!entry.hadRecentInput) cls += entry.value;
    }
  });

  // Interaction latency (INP proxy — worst event duration)
  let inp = 0;
  observe(
    "event",
    (entries) => {
      for (const entry of entries as unknown as Array<PerformanceEntry & { duration: number }>) {
        if (entry.duration > inp) inp = entry.duration;
      }
    },
    { durationThreshold: 40 } as PerformanceObserverInit,
  );

  observe("longtask", (entries) => {
    for (const entry of entries) {
      if (entry.duration > 200) {
        push({ name: "long_task", value: entry.duration, unit: "ms", at: Date.now() });
      }
    }
  });

  const flush = () => {
    if (lcp) push({ name: "LCP", value: lcp, unit: "ms", at: Date.now() });
    if (inp) push({ name: "INP", value: inp, unit: "ms", at: Date.now() });
    push({ name: "CLS", value: Number(cls.toFixed(4)), unit: "score", at: Date.now() });
    lcp = 0;
    inp = 0;
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush, { once: true });
  // Also snapshot shortly after load so the numbers are visible without leaving.
  window.setTimeout(flush, 5000);
}
