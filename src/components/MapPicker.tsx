import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

import { markPerf, startPerfTimer } from "@/lib/perf";

// Fix default marker icons (Leaflet references image URLs that fail with bundlers)
const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

type Props = {
  value: { lat: number; lng: number } | null;
  onChange: (v: { lat: number; lng: number }) => void;
  height?: number;
  /** Initial view when no marker exists yet (e.g. the user's location). */
  initialCenter?: { lat: number; lng: number } | null;
};

function ClickHandler({ onChange }: { onChange: Props["onChange"] }) {
  useMapEvents({
    click(e) {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}

export function MapPicker({ value, onChange, height = 320, initialCenter = null }: Props) {
  const [initialCenterState] = useState<[number, number]>(() =>
    value
      ? [value.lat, value.lng]
      : initialCenter
        ? [initialCenter.lat, initialCenter.lng]
        : [40.7128, -74.006],
  );
  const marker = useMemo(
    () => (value ? ([value.lat, value.lng] as [number, number]) : null),
    [value],
  );
  const [tilesFailing, setTilesFailing] = useState(false);

  useEffect(() => {
    const done = startPerfTimer("map_ready", { map: "picker" });
    return () => done();
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border" style={{ height }}>
      {tilesFailing && (
        <div className="absolute left-1/2 top-3 z-[401] -translate-x-1/2 rounded-full border border-border bg-background/90 px-3 py-1 text-[11px] text-muted-foreground shadow">
          Map imagery is unavailable — you can still type the address.
        </div>
      )}
      <MapContainer
        center={initialCenterState}
        zoom={13}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{
            tileerror: () => {
              setTilesFailing(true);
              markPerf("map_tile_error", { map: "picker" });
            },
            load: () => setTilesFailing(false),
          }}
        />
        <ClickHandler onChange={onChange} />
        {marker && (
          <>
            <Marker
              position={marker}
              icon={icon}
              draggable
              eventHandlers={{
                dragend(e) {
                  const p = (e.target as L.Marker).getLatLng();
                  onChange({ lat: p.lat, lng: p.lng });
                },
              }}
            />
            <Recenter center={marker} />
          </>
        )}
      </MapContainer>
    </div>
  );
}
