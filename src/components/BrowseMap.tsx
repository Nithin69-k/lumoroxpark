import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { SpaceResult } from "@/lib/search";
import { markPerf, startPerfTimer } from "@/lib/perf";

const pinIcon = L.divIcon({
  className: "",
  html: `<div style="background:hsl(var(--primary));color:hsl(var(--primary-foreground));font:600 12px system-ui;padding:6px 8px;border-radius:999px;box-shadow:0 4px 12px rgba(0,0,0,.25);white-space:nowrap;">$%PRICE%</div>`,
  iconSize: [40, 24],
  iconAnchor: [20, 24],
});

function priceIcon(price: number) {
  return L.divIcon({
    className: "",
    html: `<div style="background:hsl(var(--primary));color:hsl(var(--primary-foreground));font:600 12px system-ui;padding:4px 8px;border-radius:999px;box-shadow:0 4px 12px rgba(0,0,0,.25);white-space:nowrap;">$${price}</div>`,
    iconSize: [40, 24],
    iconAnchor: [20, 24],
  });
}

const mePin = L.divIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:999px;background:#3b82f6;border:3px solid white;box-shadow:0 0 0 2px rgba(59,130,246,.35);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// Silence unused warning; kept in case we need the fallback later.
void pinIcon;

type Props = {
  center: { lat: number; lng: number };
  spaces: SpaceResult[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onCenterChange?: (c: { lat: number; lng: number }) => void;
  height?: number;
};

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}

function MoveListener({ onCenterChange }: { onCenterChange?: Props["onCenterChange"] }) {
  useMapEvents({
    moveend(e) {
      const c = e.target.getCenter();
      onCenterChange?.({ lat: c.lat, lng: c.lng });
    },
  });
  return null;
}

export function BrowseMap({
  center,
  spaces,
  selectedId,
  onSelect,
  onCenterChange,
  height = 420,
}: Props) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo<[number, number]>(() => [center.lat, center.lng], []);
  const [tilesFailing, setTilesFailing] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const done = startPerfTimer("map_ready", { map: "browse" });
    return () => done();
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border" style={{ height }}>
      {!ready && (
        <div className="absolute inset-0 z-[400] grid place-items-center bg-muted/40 text-xs text-muted-foreground">
          Loading map…
        </div>
      )}
      {tilesFailing && (
        <div className="absolute left-1/2 top-3 z-[401] -translate-x-1/2 rounded-full border border-border bg-background/90 px-3 py-1 text-[11px] text-muted-foreground shadow">
          Map imagery is unavailable right now — the list below still works.
        </div>
      )}
      <MapContainer
        center={initial}
        zoom={13}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
        whenReady={() => setReady(true)}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{
            tileerror: () => {
              setTilesFailing(true);
              markPerf("map_tile_error", { map: "browse" });
            },
            load: () => setTilesFailing(false),
          }}
        />
        <Recenter center={[center.lat, center.lng]} />
        <MoveListener onCenterChange={onCenterChange} />
        <Marker position={[center.lat, center.lng]} icon={mePin} />
        {spaces.map((s) => (
          <Marker
            key={s.id}
            position={[s.lat, s.lng]}
            icon={priceIcon(Math.round(s.price_per_hour))}
            eventHandlers={{ click: () => onSelect?.(s.id) }}
          >
            <Popup>
              <div className="min-w-[160px]">
                <div className="text-sm font-semibold">{s.title}</div>
                <div className="text-xs opacity-70">{s.address}</div>
                <div className="mt-1 text-sm">${s.price_per_hour}/hr</div>
                <button
                  className="mt-2 text-xs font-medium text-primary underline"
                  onClick={() => onSelect?.(s.id)}
                >
                  View details
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
        {selectedId ? null : null}
      </MapContainer>
    </div>
  );
}
