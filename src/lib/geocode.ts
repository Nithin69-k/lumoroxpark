const CACHE = new Map<string, string>();

function dedupe(list: string[]): string[] {
  return list.filter((v, i) => v !== list[i - 1]);
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (CACHE.has(key)) return CACHE.get(key)!;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    const a = data.address ?? {};
    const parts = dedupe(
      [
        a.amenity,
        a.road,
        a.neighbourhood,
        a.suburb,
        a.city_district,
        a.city ?? a.town ?? a.village,
        a.state,
        a.postcode,
      ].filter((p): p is string => !!p?.trim()),
    );
    const addr = parts.map((p) => p.trim()).join(", ");
    if (!addr && data.display_name) return data.display_name;
    if (!addr) return null;
    CACHE.set(key, addr);
    return addr;
  } catch {
    return null;
  }
}
