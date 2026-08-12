import { policyLabel } from "@/lib/spaces";
import { absoluteUrl } from "@/lib/site";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { lazy, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, MapPin, ShieldCheck, Zap, Camera, Home, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SpacePhoto } from "@/components/SpacePhoto";
import { supabase } from "@/integrations/supabase/client";
import { getSpaceDetail, createPendingBooking, type SpaceDetail } from "@/lib/search";
import { trustBand } from "@/lib/profile";
import { MapFrame } from "@/components/MapFrame";
import { Price, CurrencyToggle } from "@/components/Price";
import { formatUsd } from "@/lib/currency";

const MapPicker = lazy(() =>
  import("@/components/MapPicker").then((m) => ({ default: m.MapPicker })),
);

export const Route = createFileRoute("/space/$id")({
  component: SpacePage,
  loader: async ({ params }) => {
    try {
      const detail = await getSpaceDetail(params.id);
      return { detail };
    } catch {
      return { detail: null };
    }
  },
  head: ({ params, loaderData }) => {
    const url = absoluteUrl(`/space/${params.id}`);
    const d = loaderData?.detail;
    const title = d
      ? `${d.title} — Private parking on LumoroX Park`
      : "Parking listing — LumoroX Park";
    const trimmedTitle = title.length > 60 ? `${title.slice(0, 57)}…` : title;
    const description = d
      ? `${d.title} at ${d.address}. Book from $${d.price_per_hour}/hr on LumoroX Park.`.slice(
          0,
          160,
        )
      : "Book this private parking spot by the hour on LumoroX Park.";
    const scripts = d
      ? [
          {
            type: "application/ld+json",
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Product",
              name: d.title,
              description: d.description ?? description,
              url,
              offers: {
                "@type": "Offer",
                price: d.price_per_hour,
                priceCurrency: "USD",
                availability: "https://schema.org/InStock",
              },
              additionalType: "https://schema.org/ParkingFacility",
              address: { "@type": "PostalAddress", streetAddress: d.address },
              geo: { "@type": "GeoCoordinates", latitude: d.lat, longitude: d.lng },
            }),
          },
        ]
      : undefined;
    return {
      meta: [
        { title: trimmedTitle },
        { name: "description", content: description },
        { property: "og:title", content: trimmedTitle },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "product" },
      ],
      links: [{ rel: "canonical", href: url }],
      ...(scripts ? { scripts } : {}),
    };
  },
});

function SpacePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<SpaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  const now = new Date();
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const in3h = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const [start, setStart] = useState(toLocalInput(in1h));
  const [end, setEnd] = useState(toLocalInput(in3h));
  const [booking, setBooking] = useState(false);
  const [mapKey, setMapKey] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await getSpaceDetail(id);
        if (!alive) return;
        setDetail(d);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load listing");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  // Live occupancy updates via realtime
  useEffect(() => {
    const ch = supabase
      .channel(`space:${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "parking_spaces", filter: `id=eq.${id}` },
        (payload) => {
          const next = (payload.new as { live_occupancy_status?: string }).live_occupancy_status;
          if (next) {
            setDetail((d) => (d ? { ...d, live_occupancy_status: next } : d));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id]);

  const hours = (() => {
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
    return (e - s) / 3600000;
  })();
  const estimated = detail ? Math.round(hours * detail.price_per_hour * 100) / 100 : 0;

  async function handleBook() {
    if (!detail) return;
    if (!signedIn) {
      navigate({ to: "/auth", search: { mode: "signin" } });
      return;
    }
    if (hours <= 0) {
      toast.error("End time must be after start time");
      return;
    }
    setBooking(true);
    try {
      const bookingId = await createPendingBooking(
        detail.id,
        new Date(start).toISOString(),
        new Date(end).toISOString(),
      );
      toast.success("Booking created");
      navigate({ to: "/bookings", search: { new: bookingId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Booking failed");
    } finally {
      setBooking(false);
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-gradient-surface">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="grid min-h-screen place-items-center bg-gradient-surface p-6 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold">Listing not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">It may have been removed or paused.</p>
          <Button asChild className="mt-4">
            <Link to="/browse">Back to browse</Link>
          </Button>
        </div>
      </div>
    );
  }

  const band = trustBand(detail.host_trust_score);

  return (
    <div className="min-h-full bg-gradient-surface pb-16">
      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4">
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link to="/browse">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Link>
          </Button>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              detail.live_occupancy_status === "occupied"
                ? "bg-warning/10 text-warning"
                : "bg-success/10 text-success"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${detail.live_occupancy_status === "occupied" ? "bg-warning" : "bg-success"}`}
            />
            {detail.live_occupancy_status === "occupied" ? "Occupied right now" : "Available now"}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-6">
        {/* Photos */}
        <div className="grid gap-2 md:grid-cols-3">
          {(detail.photos.length ? detail.photos : [null]).slice(0, 3).map((p, i) => (
            <div
              key={i}
              className={`overflow-hidden rounded-2xl bg-muted ${i === 0 ? "md:col-span-2 md:row-span-2 aspect-video" : "aspect-square"}`}
            >
              {p ? (
                <SpacePhoto path={p} alt={detail.title} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center text-muted-foreground">
                  <MapPin className="h-8 w-8" />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-8 md:grid-cols-[1.4fr_1fr]">
          <div>
            <h1 className="font-display text-3xl font-bold">{detail.title}</h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" /> {detail.address}
            </div>

            {detail.description && (
              <>
                <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  About this space
                </h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
                  {detail.description.split("[VERIFICATION_INFO]")[0].trim()}
                </p>
              </>
            )}

            {/* Legal Registration & Liability Verification Box */}
            <div className="mt-8 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.01] p-5 text-left space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground">Verified & Legally Accountable Spot</h4>
                  <p className="text-[10.5px] text-emerald-600 mt-0.5 font-semibold">Identity & Property Ownership Registered</p>
                </div>
              </div>
              
              <div className="grid gap-3.5 sm:grid-cols-2 text-xs border-t border-emerald-500/10 pt-4">
                <div>
                  <span className="text-muted-foreground block font-medium">Listing Authority</span>
                  <span className="text-foreground font-semibold mt-1 block">Certified Property Owner/Lessor</span>
                </div>
                <div>
                  <span className="text-muted-foreground block font-medium">Liability Terms</span>
                  <span className="text-foreground font-semibold mt-1 block">Full Civil & Property Custody Liability</span>
                </div>
              </div>

              <div className="rounded-xl bg-muted/50 border border-border/40 p-3 text-[11px] text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground block mb-1">Lawful Accountability Statement:</span>
                This host has registered official government identification and proof of address. 
                By accepting this booking, the host is legally responsible for security and vehicle protection under local property liability laws. 
                In case of fraud, theft, or property damage, verified records are legally holding for lawsuit filings.
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 text-xs">
              {detail.is_covered && <Chip icon={Home}>Covered</Chip>}
              {detail.is_gated && <Chip icon={ShieldCheck}>Gated</Chip>}
              {detail.has_ev_charging && <Chip icon={Zap}>EV charger</Chip>}
              {detail.has_camera && <Chip icon={Camera}>Camera</Chip>}
              {detail.vehicle_types.map((v) => (
                <span
                  key={v}
                  className="rounded-full border border-border px-3 py-1 capitalize text-muted-foreground"
                >
                  {v}
                </span>
              ))}
            </div>

            <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Your host
            </h2>
            <div className="mt-2 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-brand text-sm font-semibold text-primary-foreground">
                  {(detail.host_name ?? "H").slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    Hosted by {detail.host_name ?? "a LumoroX host"}
                    {detail.is_featured && (
                      <span className="rounded-full bg-gradient-brand px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-foreground">
                        Pro host
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Trust score {detail.host_trust_score} · {band.label} · ★{" "}
                    {detail.host_rating.toFixed(1)}
                  </div>
                </div>
              </div>
            </div>

            <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Cancellation policy
            </h2>
            <div className="mt-2 rounded-2xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {policyLabel(detail.cancellation_policy).label}
                </span>{" "}
                — {policyLabel(detail.cancellation_policy).blurb} After that cutoff the booking is
                non-refundable.
              </p>
            </div>

            {typeof detail.lat === "number" && typeof detail.lng === "number" ? (
              <div className="mt-6">
                <MapFrame height={260} retryKey={mapKey} onRetry={() => setMapKey((k) => k + 1)}>
                  <MapPicker
                    value={{ lat: detail.lat, lng: detail.lng }}
                    onChange={() => {}}
                    height={260}
                  />
                </MapFrame>
              </div>
            ) : null}
          </div>

          {/* Booking card */}
          <aside className="md:sticky md:top-4 md:self-start">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-3xl font-bold">
                    <Price usd={detail.price_per_hour} />
                    <span className="text-base font-normal text-muted-foreground">/hour</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {detail.price_per_day
                      ? `or ${formatUsd(detail.price_per_day)}/day`
                      : "per hour booking"}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      detail.live_occupancy_status === "occupied"
                        ? "bg-warning/10 text-warning"
                        : "bg-success/10 text-success"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${detail.live_occupancy_status === "occupied" ? "bg-warning" : "bg-success"}`}
                    />
                    {detail.live_occupancy_status === "occupied" ? "Occupied now" : "Available now"}
                  </span>
                  <CurrencyToggle />
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <Label htmlFor="s" className="text-xs font-semibold">Start Time</Label>
                  <Input
                    id="s"
                    type="datetime-local"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="e" className="text-xs font-semibold">End Time</Label>
                  <Input
                    id="e"
                    type="datetime-local"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </div>

                {/* Quick Duration Selection */}
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Quick Durations</Label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {[1, 2, 3, 4, 6, 8, 12, 24].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          const sDate = new Date(start);
                          const newEnd = new Date(sDate.getTime() + d * 60 * 60 * 1000);
                          setEnd(toLocalInput(newEnd));
                        }}
                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          hours === d
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background hover:bg-accent"
                        }`}
                      >
                        {d}h
                      </button>
                    ))}
                  </div>
                </div>

                {/* Visual Timeline Bar */}
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Timeline Preview</Label>
                  <div className="relative flex items-center justify-between rounded-xl border border-border bg-muted/40 p-2.5 text-[10px] font-semibold text-muted-foreground mt-1">
                    <div className="absolute left-3 right-3 h-0.5 bg-border z-0" />
                    {(() => {
                      const sHour = new Date(start).getHours();
                      const arr = [];
                      for (let i = 0; i < 5; i++) {
                        const h = (sHour + i) % 24;
                        arr.push(`${String(h).padStart(2, "0")}:00`);
                      }
                      return arr;
                    })().map((h, i) => (
                      <div key={i} className="relative z-10 flex flex-col items-center">
                        <div className={`h-1.5 w-1.5 rounded-full border border-background transition-colors ${i === 0 ? "bg-primary" : "bg-muted-foreground"}`} />
                        <span className="mt-1 text-[9px] scale-90">{h}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-1.5 border-t border-border pt-4 text-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>
                    {formatUsd(detail.price_per_hour)}/hr × {hours > 0 ? hours.toFixed(1) : "—"} hrs
                  </span>
                  <span>
                    <Price usd={estimated} showInr={false} />
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Platform fee + reservation</span>
                  <span>Added at checkout</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-dashed border-border pt-2">
                  <span className="font-medium text-foreground">Estimated total</span>
                  <span className="font-semibold text-foreground">
                    <Price usd={estimated} />*
                  </span>
                </div>
              </div>

              <Button className="mt-4 w-full" size="lg" onClick={handleBook} disabled={booking}>
                {booking ? "Reserving…" : signedIn ? "Reserve this spot" : "Sign in to reserve"}
              </Button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Free to reserve — you pay by UPI to confirm, after we check availability.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function Chip({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1">
      <Icon className="h-3 w-3" />
      {children}
    </span>
  );
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
