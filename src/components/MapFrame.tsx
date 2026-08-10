import { Component, Suspense, type ReactNode } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { MapPin, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { markPerf } from "@/lib/perf";

/** Lightweight, dependency-free placeholder shown while Leaflet loads. */
export function MapSkeleton({
  height,
  label = "Loading map…",
}: {
  height: number;
  label?: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-border bg-muted/40"
      style={{ height }}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {/* faux street grid — pure CSS, no tiles fetched */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 animate-pulse bg-gradient-to-br from-transparent via-background/40 to-transparent"
      />
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
          <MapPin className="h-3.5 w-3.5 animate-bounce text-primary" />
          {label}
        </div>
      </div>
    </div>
  );
}

export function MapErrorFallback({
  height,
  onRetry,
  message,
}: {
  height: number;
  onRetry: () => void;
  message?: string;
}) {
  return (
    <div
      className="grid place-items-center rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center"
      style={{ height }}
      role="alert"
    >
      <div className="max-w-xs space-y-3">
        <MapPin className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">The map couldn't load</p>
        <p className="text-xs text-muted-foreground">
          {message ?? "This is usually a network hiccup. Everything else on this page still works."}
        </p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry map
        </Button>
      </div>
    </div>
  );
}

type BoundaryProps = { height: number; onRetry: () => void; children: ReactNode };
type BoundaryState = { error: Error | null };

class MapErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Never let a map failure take down the page — just report it.
    markPerf("map_error", { message: error.message });
  }

  render() {
    if (this.state.error) {
      return (
        <MapErrorFallback
          height={this.props.height}
          message={this.state.error.message}
          onRetry={() => {
            this.setState({ error: null });
            this.props.onRetry();
          }}
        />
      );
    }
    return this.props.children;
  }
}

/**
 * Single wrapper for every map on the site: browser-only, lazily loaded,
 * lightweight placeholder while loading, and an isolated error boundary
 * with a retry so a broken map never breaks the surrounding page.
 */
export function MapFrame({
  height,
  children,
  retryKey,
  onRetry,
  label,
}: {
  height: number;
  children: ReactNode;
  retryKey: number;
  onRetry: () => void;
  label?: string;
}) {
  return (
    <MapErrorBoundary key={retryKey} height={height} onRetry={onRetry}>
      <ClientOnly fallback={<MapSkeleton height={height} label={label} />}>
        <Suspense fallback={<MapSkeleton height={height} label={label} />}>{children}</Suspense>
      </ClientOnly>
    </MapErrorBoundary>
  );
}
