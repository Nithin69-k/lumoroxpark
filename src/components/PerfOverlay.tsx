import { useEffect, useState } from "react";
import { Activity, X } from "lucide-react";

import { getPerfEvents, onPerfEvent, type PerfEvent } from "@/lib/perf";

/**
 * Opt-in performance overlay. Enable with `?perf=1` in the URL (it then sticks
 * for the session) and disable with `?perf=0`. Never rendered by default, so it
 * costs nothing for normal visitors.
 */
export function PerfOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [events, setEvents] = useState<PerfEvent[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("perf");
    if (flag === "1") sessionStorage.setItem("lumoro_perf", "1");
    if (flag === "0") sessionStorage.removeItem("lumoro_perf");
    setEnabled(sessionStorage.getItem("lumoro_perf") === "1");
  }, []);

  useEffect(() => {
    if (!enabled) return;
    setEvents(getPerfEvents());
    const off = onPerfEvent(() => setEvents(getPerfEvents()));
    return () => {
      off();
    };
  }, [enabled]);

  if (!enabled) return null;

  const latest = new Map<string, PerfEvent>();
  events.forEach((e) => latest.set(e.name, e));

  return (
    <div className="fixed bottom-3 right-3 z-[9999] max-w-[280px] text-xs">
      {open ? (
        <div className="rounded-xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Activity className="h-3.5 w-3.5 text-primary" /> Performance
            </span>
            <button aria-label="Hide performance overlay" onClick={() => setOpen(false)}>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
          {latest.size === 0 ? (
            <p className="text-muted-foreground">Collecting metrics…</p>
          ) : (
            <ul className="space-y-1">
              {[...latest.values()].map((e) => (
                <li key={e.name} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{e.name}</span>
                  <span className="font-mono">
                    {e.unit === "ms" ? `${Math.round(e.value)}ms` : e.value}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <button
          className="rounded-full border border-border bg-background/95 p-2 shadow-lg"
          aria-label="Show performance overlay"
          onClick={() => setOpen(true)}
        >
          <Activity className="h-4 w-4 text-primary" />
        </button>
      )}
    </div>
  );
}
