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

  const [step, setStep] = useState(1);
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

  const steps = [
    "Location",
    "Details",
    "Photos",
    "Amenities",
    "Pricing & Policy",
    "Review"
  ];

  const handleNext = () => {
    if (step === 1) {
      if (!pos) {
        toast.error("Please drop a pin on the map to set the location");
        return;
      }
      if (!address.trim()) {
        toast.error("Please enter a valid address");
        return;
      }
    } else if (step === 2) {
      if (!title.trim()) {
        toast.error("Please enter a listing title");
        return;
      }
    } else if (step === 4) {
      if (vehicles.length === 0) {
        toast.error("Please select at least one compatible vehicle type");
        return;
      }
    } else if (step === 5) {
      const priceH = parseFloat(pricePerHour);
      if (!Number.isFinite(priceH) || priceH <= 0) {
        toast.error("Please enter a valid hourly rate");
        return;
      }
    }
    setStep((s) => s + 1);
  };

  return (
    <div className="min-h-full bg-gradient-surface">
      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <Button asChild variant="ghost" size="sm">
            <Link to="/host">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Link>
          </Button>
          <h1 className="font-display text-lg font-bold">New listing wizard</h1>
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

        <div className="rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
          {/* Progress Indicator Bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">
              <span>Step {step} of {steps.length}: {steps[step - 1]}</span>
              <span>{Math.round((step / steps.length) * 100)}% Complete</span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-brand transition-all duration-300 rounded-full"
                style={{ width: `${(step / steps.length) * 100}%` }}
              />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Step 1: Location */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Where is your parking space?</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Start by setting the exact address and location coordinates on the map.
                  </p>
                </div>
                <div>
                  <Label htmlFor="addr">Street Address</Label>
                  <Input
                    id="addr"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="123 Main St, Brooklyn NY"
                  />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Label className="mb-0 block">Drop a Pin on Map</Label>
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
              </div>
            )}

            {/* Step 2: Basic Details */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Tell us about your space</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Give your listing an catchy name and a brief description explaining any entry guidelines.
                  </p>
                </div>
                <div>
                  <Label htmlFor="title">Listing Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Covered driveway near downtown"
                  />
                </div>
                <div>
                  <Label htmlFor="desc">Description / Instructions</Label>
                  <Textarea
                    id="desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={5}
                    placeholder="Describe how to access the space, code for gates, or other guidelines renters should know…"
                  />
                </div>
              </div>
            )}

            {/* Step 3: Photos */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Add photos of your spot</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Renters prefer listings with photos showing the parking layout and street view.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {photos.map((p) => (
                    <div
                      key={p}
                      className="relative aspect-square overflow-hidden rounded-xl border border-border"
                    >
                      <SpacePhoto path={p} alt="Space photo" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setPhotos((ps) => ps.filter((x) => x !== p))}
                        className="absolute right-1.5 top-1.5 rounded-full bg-background/80 p-1 text-foreground hover:bg-background shadow-sm"
                        aria-label="Remove photo"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border text-xs text-muted-foreground hover:bg-accent/50 transition-colors">
                    <Upload className="mb-1.5 h-5 w-5 text-muted-foreground" />
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
              </div>
            )}

            {/* Step 4: Amenities & Vehicles */}
            {step === 4 && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Compatibility & Features</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Select which vehicle types fit your spot and highlight key security/layout features.
                    </p>
                  </div>
                  <Label>Vehicles allowed</Label>
                  <div className="flex flex-wrap gap-2">
                    {VEHICLE_TYPES.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => toggleVehicle(v)}
                        className={`rounded-full border px-4 py-1.5 text-sm capitalize transition-colors font-medium ${
                          vehicles.includes(v)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-foreground hover:bg-accent"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Features & Amenities</Label>
                  <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
                    <FeatureCheck label="Covered" checked={isCovered} onChange={setCovered} />
                    <FeatureCheck label="Gated Entry" checked={isGated} onChange={setGated} />
                    <FeatureCheck label="EV charging" checked={hasEv} onChange={setEv} />
                    <FeatureCheck label="CCTV Camera" checked={hasCamera} onChange={setCamera} />
                    <FeatureCheck label="Smart Sensor" checked={hasSensor} onChange={setSensor} />
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Pricing & Policies */}
            {step === 5 && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Pricing & Cancellation policy</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Set daily/hourly rates or query the LumoroX AI for pricing recommendations.
                    </p>
                  </div>
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
                    {pricePerDay ? ` · ${formatInr(parseFloat(pricePerDay))}/day` : ""} — renters can toggle display in ₹ anytime.
                  </p>
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="font-medium text-foreground">Not sure what to charge?</div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={aiBusy}
                        onClick={suggestPrice}
                      >
                        <Sparkles className="mr-1 h-3.5 w-3.5 text-primary" />
                        {aiBusy ? "Analysing nearby listings…" : "Suggest with AI"}
                      </Button>
                    </div>
                    {aiPrice ? (
                      <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed">{aiPrice}</p>
                    ) : (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Compares nearby listings within 5 km and your space's features to suggest a competitive hourly rate.
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Cancellation policy</Label>
                  <p className="text-xs text-muted-foreground">
                    Drivers see this before booking. A full refund is issued automatically if they cancel before your cutoff.
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
                </div>
              </div>
            )}

            {/* Step 6: Review & Publish */}
            {step === 6 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Review your listing details</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Double-check details before publishing. You can edit these settings at any time from your host dashboard.
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-muted/30 p-5 space-y-4 text-sm">
                  <div className="flex items-center gap-3">
                    <div className="h-16 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-muted border border-border">
                      {photos[0] ? (
                        <SpacePhoto path={photos[0]} alt={title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center text-muted-foreground">
                          <MapPin className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h4 className="font-semibold text-base text-foreground">{title || "Untitled Spot"}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">{address}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-border/60 pt-4">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase">Hourly rate</div>
                      <div className="font-bold text-lg text-primary mt-0.5">${pricePerHour}/hr</div>
                    </div>
                    {pricePerDay && (
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground uppercase">Daily rate</div>
                        <div className="font-bold text-lg text-primary mt-0.5">${pricePerDay}/day</div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-border/60 pt-4 space-y-2">
                    <div>
                      <span className="font-semibold text-muted-foreground text-xs uppercase block">Vehicles allowed</span>
                      <span className="text-xs font-medium text-foreground capitalize mt-0.5 inline-block">
                        {vehicles.join(", ")}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-muted-foreground text-xs uppercase block">Features</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {isCovered && <span className="px-2 py-0.5 bg-muted rounded text-[10px] font-semibold text-muted-foreground">Covered</span>}
                        {isGated && <span className="px-2 py-0.5 bg-muted rounded text-[10px] font-semibold text-muted-foreground">Gated</span>}
                        {hasEv && <span className="px-2 py-0.5 bg-muted rounded text-[10px] font-semibold text-muted-foreground">EV Charge</span>}
                        {hasCamera && <span className="px-2 py-0.5 bg-muted rounded text-[10px] font-semibold text-muted-foreground">Camera</span>}
                        {hasSensor && <span className="px-2 py-0.5 bg-muted rounded text-[10px] font-semibold text-muted-foreground">Sensor</span>}
                      </div>
                    </div>
                    <div>
                      <span className="font-semibold text-muted-foreground text-xs uppercase block">Cancellation Policy</span>
                      <span className="text-xs font-medium text-foreground capitalize mt-0.5 inline-block">
                        {policy} Policy
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between border-t border-border pt-6 mt-8">
              {step > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep((s) => s - 1)}
                >
                  Back
                </Button>
              ) : (
                <Button asChild variant="ghost">
                  <Link to="/host">Cancel</Link>
                </Button>
              )}

              {step < 6 ? (
                <Button
                  type="button"
                  onClick={handleNext}
                >
                  Continue
                </Button>
              ) : (
                <Button type="submit" disabled={saving || atCap}>
                  {saving ? "Publishing…" : "Publish Listing"}
                </Button>
              )}
            </div>
          </form>
        </div>
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
