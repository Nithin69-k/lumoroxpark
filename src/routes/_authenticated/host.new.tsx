import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { lazy, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Upload, X, MapPin, Crosshair, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useGeolocation } from "@/hooks/useGeolocation";
import { formatInr } from "@/lib/currency";
import { reverseGeocode } from "@/lib/geocode";
import {
  createSpace,
  uploadSpacePhoto,
  getMyListingQuota,
  CANCELLATION_POLICIES,
  type CancellationPolicy,
  type ListingQuota,
} from "@/lib/spaces";
import { SpacePhoto } from "@/components/SpacePhoto";
import { MapFrame } from "@/components/MapFrame";
import { useServerFn } from "@tanstack/react-start";
import { suggestListingPrice } from "@/utils/ai.functions";

// Leaflet touches window at import time — lazy-load to keep it out of SSR.
const MapPicker = lazy(() =>
  import("@/components/MapPicker").then((m) => ({ default: m.MapPicker })),
);

export const Route = createFileRoute("/_authenticated/host/new")({
  component: NewSpacePage,
});

const VEHICLE_TYPES = ["car", "suv", "motorcycle", "truck", "ev"] as const;

function NewSpacePage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [mapKey, setMapKey] = useState(0);
  const [pricePerHour, setPricePerHour] = useState("5");
  const [pricePerDay, setPricePerDay] = useState("");
  const [vehicles, setVehicles] = useState<string[]>(["car"]);
  const [isCovered, setCovered] = useState(false);
  const [isGated, setGated] = useState(false);
  const [hasEv, setEv] = useState(false);
  const [hasCamera, setCamera] = useState(false);
  const [hasSensor, setSensor] = useState(false);
  const [policy, setPolicy] = useState<CancellationPolicy>("moderate");
  const [quota, setQuota] = useState<ListingQuota | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiPrice, setAiPrice] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const runSuggestPrice = useServerFn(suggestListingPrice);
  const { coords: geoCoords, status: geoStatus, locate } = useGeolocation();
  const [fillingAddress, setFillingAddress] = useState(false);

  useEffect(() => {
    let alive = true;
    getMyListingQuota()
      .then((q) => alive && setQuota(q))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // Auto-locate: centre the map on the host's position and drop the pin there
  // when the browser lets us, so the listing is set where they actually are.
  useEffect(() => {
    let alive = true;
    locate().then(async (c) => {
      if (alive && c) setPos(c);
      if (alive && c && !address.trim()) {
        const a = await reverseGeocode(c.lat, c.lng);
        if (alive && a) setAddress(a);
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function useMyLocation() {
    const c = await locate();
    if (c) {
      setPos(c);
      setFillingAddress(true);
      try {
        const a = await reverseGeocode(c.lat, c.lng);
        if (a) {
          setAddress(a);
          toast.success("Address filled from your location");
        } else {
          toast.error("Couldn't look up the address — please type it");
        }
      } finally {
        setFillingAddress(false);
      }
    }
  }

  const atCap = !!quota && !quota.is_pro && quota.used >= quota.max_allowed;

  function toggleVehicle(v: string) {
    setVehicles((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const paths = await Promise.all(files.map((f) => uploadSpacePhoto(user.id, f)));
      setPhotos((p) => [...p, ...paths]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function suggestPrice() {
    if (!pos) {
      toast.error("Drop a pin on the map first so AI can compare nearby listings");
      return;
    }
    setAiBusy(true);
    setAiPrice(null);
    try {
      const suggestion = await runSuggestPrice({
        data: {
          title: title.trim(),
          description: description.trim(),
          address: address.trim(),
          lat: pos.lat,
          lng: pos.lng,
          vehicleTypes: vehicles,
          isCovered: isCovered,
          isGated: isGated,
          hasEv: hasEv,
          hasCamera: hasCamera,
          hasSensor: hasSensor,
        },
      });
      setPricePerHour(String(suggestion.pricePerHour));
      if (suggestion.pricePerDay !== null) setPricePerDay(String(suggestion.pricePerDay));
      setAiPrice(suggestion.reasoning);
      toast.success(`AI suggests $${suggestion.pricePerHour.toFixed(2)}/hour`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not get an AI price suggestion");
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pos) {
      toast.error("Drop a pin on the map to set the location");
      return;
    }
    if (!title.trim() || !address.trim()) {
      toast.error("Title and address are required");
      return;
    }
    const priceH = parseFloat(pricePerHour);
    if (!Number.isFinite(priceH) || priceH <= 0) {
      toast.error("Enter a valid hourly price");
      return;
    }
    const priceD = pricePerDay ? parseFloat(pricePerDay) : null;

    setSaving(true);
    try {
      await createSpace({
        title: title.trim(),
        description: description.trim(),
        address: address.trim(),
        lat: pos.lat,
        lng: pos.lng,
        price_per_hour: priceH,
        price_per_day: priceD,
        vehicle_types: vehicles,
        is_covered: isCovered,
        is_gated: isGated,
        has_ev_charging: hasEv,
        has_camera: hasCamera,
        has_sensor: hasSensor,
        photos,
        cancellation_policy: policy,
      });
      toast.success("Listing published");
      navigate({ to: "/host" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create listing");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-full bg-gradient-surface">
      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <Button asChild variant="ghost" size="sm">
            <Link to="/host">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Link>
          </Button>
          <h1 className="font-display text-lg font-bold">New listing</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        {atCap && (
          <div className="mb-6 rounded-2xl border border-warning/40 bg-warning/5 p-4 text-sm">
            <div className="font-medium">
              You've reached the free plan limit of {quota?.max_allowed} listings
            </div>
            <p className="mt-1 text-muted-foreground">
              Upgrade to Host Pro for unlimited listings, featured placement and a 5% commission.
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link to="/pricing">See Host Pro</Link>
            </Button>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-8 rounded-3xl border border-border bg-card p-6 shadow-card md:p-8"
        >
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Basics
            </h2>
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Covered driveway near downtown"
              />
            </div>
            <div>
              <Label htmlFor="desc">Description</Label>
              <Textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What renters should know…"
              />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Location
            </h2>
            <div>
              <Label htmlFor="addr">Address</Label>
              <Input
                id="addr"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St, Brooklyn NY"
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <Label className="mb-0 block">Pin on map</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={useMyLocation}
                  disabled={geoStatus === "locating" || fillingAddress}
                >
                  <Crosshair className="mr-1 h-3.5 w-3.5" />
                  {geoStatus === "locating"
                    ? "Locating…"
                    : fillingAddress
                      ? "Filling address…"
                      : "Use my location"}
                </Button>
              </div>
              <MapFrame height={320} retryKey={mapKey} onRetry={() => setMapKey((k) => k + 1)}>
                <MapPicker value={pos} onChange={setPos} height={320} initialCenter={geoCoords} />
              </MapFrame>
              <p className="mt-2 text-xs text-muted-foreground">
                <MapPin className="mr-1 inline h-3 w-3" />
                {pos
                  ? `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`
                  : geoStatus === "locating"
                    ? "Locating you to drop the pin automatically…"
                    : "Click the map or drag the marker to set the exact spot."}
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Pricing
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="ph">Per hour ($)</Label>
                <Input
                  id="ph"
                  type="number"
                  min="0"
                  step="0.5"
                  value={pricePerHour}
                  onChange={(e) => setPricePerHour(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="pd">
                  Per day ($) <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="pd"
                  type="number"
                  min="0"
                  step="1"
                  value={pricePerDay}
                  onChange={(e) => setPricePerDay(e.target.value)}
                />
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              {formatInr(parseFloat(pricePerHour) || 0)}/hour
              {pricePerDay ? ` · ${formatInr(parseFloat(pricePerDay))}/day` : ""} — renters can
              switch to ₹ anywhere.
            </p>
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-foreground">Not sure what to charge?</div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={aiBusy}
                  onClick={suggestPrice}
                >
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  {aiBusy ? "Analysing nearby listings…" : "Suggest with AI"}
                </Button>
              </div>
              {aiPrice ? (
                <p className="mt-2 text-xs text-muted-foreground">{aiPrice}</p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Compares nearby listings within 5 km and your space's features to suggest a
                  competitive hourly rate.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Cancellation policy
            </h2>
            <p className="text-xs text-muted-foreground">
              Drivers see this before booking. A full refund is issued automatically if they cancel
              before your cutoff.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {CANCELLATION_POLICIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPolicy(p.value)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    policy === p.value
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:bg-accent"
                  }`}
                >
                  <div className="text-sm font-semibold">{p.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{p.blurb}</div>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Vehicles allowed
            </h2>
            <div className="flex flex-wrap gap-2">
              {VEHICLE_TYPES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => toggleVehicle(v)}
                  className={`rounded-full border px-3 py-1 text-sm capitalize transition-colors ${
                    vehicles.includes(v)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-accent"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Features
            </h2>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              <FeatureCheck label="Covered" checked={isCovered} onChange={setCovered} />
              <FeatureCheck label="Gated" checked={isGated} onChange={setGated} />
              <FeatureCheck label="EV charging" checked={hasEv} onChange={setEv} />
              <FeatureCheck label="Camera" checked={hasCamera} onChange={setCamera} />
              <FeatureCheck label="Sensor" checked={hasSensor} onChange={setSensor} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Photos
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {photos.map((p) => (
                <div
                  key={p}
                  className="relative aspect-square overflow-hidden rounded-lg border border-border"
                >
                  <SpacePhoto path={p} alt="Space photo" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotos((ps) => ps.filter((x) => x !== p))}
                    className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-foreground hover:bg-background"
                    aria-label="Remove photo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border text-xs text-muted-foreground hover:bg-accent">
                <Upload className="mb-1 h-5 w-5" />
                {uploading ? "Uploading…" : "Add photos"}
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={handleUpload}
                  disabled={uploading}
                />
              </label>
            </div>
          </section>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button asChild variant="ghost">
              <Link to="/host">Cancel</Link>
            </Button>
            <Button type="submit" disabled={saving || atCap}>
              {saving ? "Publishing…" : "Publish listing"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

function FeatureCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <span>{label}</span>
    </label>
  );
}
