import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { lazy, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  MapPin,
  SlidersHorizontal,
  Loader2,
  ArrowLeft,
  Crosshair,
  AlertTriangle,
  SearchX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SpacePhoto } from "@/components/SpacePhoto";
import { searchSpaces, type SpaceResult } from "@/lib/search";
import { MapFrame } from "@/components/MapFrame";
import { Price, CurrencyToggle } from "@/components/Price";
import { markPerf, startPerfTimer } from "@/lib/perf";
import { absoluteUrl } from "@/lib/site";

const BrowseMap = lazy(() =>
  import("@/components/BrowseMap").then((m) => ({ default: m.BrowseMap })),
);

const searchSchema = z.object({
  lat: z.coerce.number().finite().optional(),
  lng: z.coerce.number().finite().optional(),
});

export const Route = createFileRoute("/browse")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Browse parking near you — LumoroX Park" },
      {
        name: "description",
        content: "Find private driveways and parking spots by the hour with live availability.",
      },
      { property: "og:title", content: "Browse parking near you — LumoroX Park" },
      {
        property: "og:description",
        content: "Find private driveways and parking spots by the hour with live availability.",
      },
      { property: "og:url", content: absoluteUrl("/browse") },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/browse") }],
  }),
  component: BrowsePage,
});

function BrowsePage() {
  const navigate = useNavigate();
  const initial = Route.useSearch();
  const hasInitial = typeof initial.lat === "number" && typeof initial.lng === "number";
  const [center, setCenter] = useState<{ lat: number; lng: number }>({
    lat: hasInitial ? initial.lat! : 40.7128,
    lng: hasInitial ? initial.lng! : -74.006,
  });
  const [locating, setLocating] = useState(!hasInitial);
  const [results, setResults] = useState<SpaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedSpace, setSelectedSpace] = useState<SpaceResult | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [mapKey, setMapKey] = useState(0);

  const [covered, setCovered] = useState(false);
  const [gated, setGated] = useState(false);
  const [ev, setEv] = useState(false);
  const [maxPrice, setMaxPrice] = useState("");
  const [radius, setRadius] = useState("10");

  // geolocate — failures are reported, never fatal: we keep the default centre.
  const locate = useCallback((manual = false) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocating(false);
      setGeoError(
        "This browser can't share your location. Showing a default area — pan the map to yours.",
      );
      return;
    }
    setLocating(true);
    setGeoError(null);
    const done = startPerfTimer("geolocation");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        done({ ok: true });
        setCenter({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
        if (manual) toast.success("Centred on your location");
      },
      (err) => {
        done({ ok: false, code: err.code });
        markPerf("geolocation_error", { code: err.code, message: err.message });
        setLocating(false);
        const message =
          err.code === err.PERMISSION_DENIED
            ? "Location access is blocked, so we're showing a default area. Allow location in your browser, or pan the map."
            : err.code === err.TIMEOUT
              ? "Getting your location timed out. Showing the last area — try again or pan the map."
              : "We couldn't work out where you are. Showing a default area — pan the map to yours.";
        setGeoError(message);
        if (manual) toast.error(message);
      },
      { enableHighAccuracy: true, timeout: 6000 },
    );
  }, []);

  useEffect(() => {
    if (!hasInitial) locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // search on center or filters change (debounced)
  useEffect(() => {
    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await searchSpaces({
          lat: center.lat,
          lng: center.lng,
          radiusKm: parseFloat(radius) || 10,
          covered: covered || undefined,
          gated: gated || undefined,
          ev: ev || undefined,
          maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        });
        setResults(rows);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Search failed");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [center.lat, center.lng, radius, covered, gated, ev, maxPrice]);

  const scoredResults = useMemo(() => {
    return results
      .map((r) => {
        let score = 100;
        score -= Math.max(0, r.price_per_hour - 5) * 6; // -6 pts per dollar above $5
        score -= r.distance_km * 8; // -8 pts per km
        if (r.live_occupancy_status === "occupied") {
          score -= 25; // -25 pts if occupied
        }
        if (r.is_covered) score += 5;
        if (r.is_gated) score += 5;
        if (r.has_ev_charging) score += 5;
        if (r.has_camera) score += 5;
        return {
          ...r,
          score: Math.max(0, Math.min(100, Math.round(score))),
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [results]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gradient-surface">
      <header className="shrink-0 border-b border-border/60 bg-background/60 backdrop-blur z-30">
        <div className="mx-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <Button asChild variant="ghost" size="sm" className="shrink-0 px-2 sm:px-3">
              <Link to="/">
                <ArrowLeft className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Home</span>
              </Link>
            </Button>
            <h1 className="truncate font-display text-base font-bold sm:text-lg">Find a spot</h1>
          </div>
          <div className="flex items-center gap-2">
            <CurrencyToggle />
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => setShowFilters((v) => !v)}
            >
              <SlidersHorizontal className="mr-1 h-4 w-4" /> Filters
            </Button>
          </div>
        </div>
        {showFilters && (
          <div className="mx-auto border-t border-border/60 px-4 py-4 sm:px-5 bg-background/95">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              <FilterCheck label="Covered" checked={covered} onChange={setCovered} />
              <FilterCheck label="Gated" checked={gated} onChange={setGated} />
              <FilterCheck label="EV charging" checked={ev} onChange={setEv} />
              <div>
                <Label htmlFor="mp" className="text-xs">
                  Max $/hr
                </Label>
                <Input
                  id="mp"
                  type="number"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="any"
                />
              </div>
              <div>
                <Label htmlFor="rd" className="text-xs">
                  Radius (km)
                </Label>
                <Input
                  id="rd"
                  type="number"
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="relative flex-1 w-full overflow-hidden md:grid md:grid-cols-[400px_1fr] lg:grid-cols-[450px_1fr]">
        {/* Results drawer panel (Desktop: Left sidebar, Mobile: Bottom sheet) */}
        <div
          className={`
            fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border shadow-[0_-8px_30px_rgb(0,0,0,0.12)] transition-all duration-300 flex flex-col rounded-t-[24px]
            ${sheetOpen ? "h-[70vh]" : "h-16"}
            md:relative md:h-full md:border-t-0 md:border-r md:shadow-none md:z-10 md:rounded-none md:bottom-auto md:left-auto md:right-auto
          `}
        >
          {/* Header indicator bar (Mobile only) */}
          <div
            className="flex h-16 shrink-0 cursor-pointer items-center justify-between px-6 border-b border-border/40 md:hidden"
            onClick={() => setSheetOpen((o) => !o)}
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">
                {locating ? "Locating you…" : loading ? "Searching…" : `${results.length} spots nearby`}
              </span>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            </div>
            <span className="text-xs font-semibold text-primary">
              {sheetOpen ? "Collapse List" : "Expand List"}
            </span>
          </div>

          {/* Desktop Search Status & My Location Controls */}
          <div className="hidden md:flex shrink-0 items-center justify-between gap-2 px-5 py-3 border-b border-border/40 bg-background/50 backdrop-blur">
            <span className="text-sm font-medium text-muted-foreground truncate">
              {locating ? "Locating you…" : loading ? "Searching…" : `${results.length} spots found`}
            </span>
            <div className="flex items-center gap-2">
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
              <Button size="sm" variant="outline" onClick={() => locate(true)} disabled={locating}>
                <Crosshair className="mr-1 h-3.5 w-3.5" /> My location
              </Button>
            </div>
          </div>

          {geoError && (
            <div className="m-3 flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="flex-1">{geoError}</span>
              <button
                className="font-medium text-primary hover:underline"
                onClick={() => locate(true)}
              >
                Retry
              </button>
            </div>
          )}

          {/* Scrollable list content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {scoredResults.length === 0 && !loading && (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-8 text-center">
                <div className="inline-flex rounded-full bg-muted p-3">
                  <SearchX className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">No spots in this area yet</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Try widening the radius, dropping the price cap, or panning the map to a nearby
                  area.
                </p>
              </div>
            )}
            <ul className="space-y-3 pb-8 md:pb-0">
              {scoredResults.map((s, index) => (
                <li
                  key={s.id}
                  className={`overflow-hidden rounded-2xl border bg-card shadow-card transition-all duration-200 hover:-translate-y-0.5 ${
                    selected === s.id ? "border-primary ring-1 ring-primary" : "border-border"
                  }`}
                >
                  <button
                    className="flex w-full gap-3 p-3 text-left"
                    onClick={() => navigate({ to: "/space/$id", params: { id: s.id } })}
                    onMouseEnter={() => setSelected(s.id)}
                  >
                    <div className="relative h-24 w-28 flex-shrink-0 overflow-hidden rounded-xl bg-muted">
                      {s.photos[0] ? (
                        <SpacePhoto
                          path={s.photos[0]}
                          alt={s.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-muted-foreground">
                          <MapPin className="h-5 w-5" />
                        </div>
                      )}
                      <span
                        className={`absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-background/90 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur ${
                          s.live_occupancy_status === "occupied" ? "text-warning" : "text-success"
                        }`}
                      >
                        <span
                          className={`h-1 w-1 rounded-full ${s.live_occupancy_status === "occupied" ? "bg-warning" : "bg-success"}`}
                        />
                        {s.live_occupancy_status === "occupied" ? "Occupied" : "Available"}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 flex flex-col justify-between py-0.5">
                      <div>
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <div className="truncate font-semibold text-sm sm:text-base">{s.title}</div>
                            {s.is_featured && (
                              <span className="shrink-0 rounded-full bg-gradient-brand px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-foreground">
                                Pro
                              </span>
                            )}
                          </div>
                          <div className="whitespace-nowrap text-sm sm:text-base font-semibold text-primary shrink-0">
                            <Price usd={s.price_per_hour} />
                            <span className="text-[10px] sm:text-xs font-normal text-muted-foreground">/hr</span>
                          </div>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{s.address}</div>
                      </div>

                      <div className="mt-1 flex items-center justify-between">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {s.distance_km.toFixed(1)} km
                          </span>
                          {s.is_covered && <FeatureDot>Covered</FeatureDot>}
                          {s.is_gated && <FeatureDot>Gated</FeatureDot>}
                          {s.has_ev_charging && <FeatureDot>EV</FeatureDot>}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                            Score: {s.score}/100
                          </span>
                          {index === 0 && s.score >= 60 && (
                            <span className="text-[9px] font-extrabold uppercase tracking-wide text-success shrink-0">
                              Best Match
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Map Section (Mobile: full background under sheet, Desktop: sticky right column) */}
        <div className="absolute inset-0 z-0 md:relative md:inset-auto md:z-auto md:h-full">
          <MapFrame height={550} retryKey={mapKey} onRetry={() => setMapKey((k) => k + 1)}>
            <BrowseMap
              center={center}
              spaces={results}
              selectedId={selected}
              onSelect={(id) => {
                setSelected(id);
                const sp = results.find((r) => r.id === id);
                if (sp) {
                  setSelectedSpace(sp);
                }
              }}
              onCenterChange={setCenter}
              height={550}
            />
          </MapFrame>
        </div>

        {/* Contextual Parking Space Preview Card (Mobile Overlay) */}
        {selectedSpace && (
          <div className="absolute bottom-20 left-4 right-4 z-50 md:hidden rounded-2xl border border-border bg-card p-4 shadow-lg flex gap-3 animate-in slide-in-from-bottom duration-250">
            <div className="h-16 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-muted">
              {selectedSpace.photos[0] ? (
                <SpacePhoto
                  path={selectedSpace.photos[0]}
                  alt={selectedSpace.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full place-items-center text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <h4 className="truncate text-sm font-semibold">{selectedSpace.title}</h4>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground text-xs p-1"
                    onClick={() => setSelectedSpace(null)}
                  >
                    ✕
                  </button>
                </div>
                <p className="truncate text-xs text-muted-foreground">{selectedSpace.address}</p>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs font-semibold text-primary">
                  <Price usd={selectedSpace.price_per_hour} />/hr
                </span>
                <Button asChild size="sm" className="h-7 text-xs px-3">
                  <Link to="/space/$id" params={{ id: selectedSpace.id }}>
                    Book Now
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function FilterCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2 text-sm transition-colors hover:bg-accent/50">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <span>{label}</span>
    </label>
  );
}

function FeatureDot({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground" />
      {children}
    </span>
  );
}
