import { supabase } from "@/integrations/supabase/client";

export type SpaceResult = {
  id: string;
  title: string;
  address: string;
  lat: number;
  lng: number;
  price_per_hour: number;
  price_per_day: number | null;
  photos: string[];
  is_covered: boolean;
  is_gated: boolean;
  has_ev_charging: boolean;
  has_camera: boolean;
  vehicle_types: string[];
  live_occupancy_status: string;
  distance_km: number;
  host_id: string;
  cancellation_policy: string;
  is_featured: boolean;
};

export type SearchFilters = {
  lat: number;
  lng: number;
  radiusKm: number;
  starts?: string | null;
  ends?: string | null;
  covered?: boolean;
  gated?: boolean;
  ev?: boolean;
  maxPrice?: number;
};

export async function searchSpaces(f: SearchFilters): Promise<SpaceResult[]> {
  const { data, error } = await supabase.rpc("search_spaces", {
    p_lat: f.lat,
    p_lng: f.lng,
    p_radius_km: f.radiusKm,
    p_starts: f.starts ?? undefined,
    p_ends: f.ends ?? undefined,
    p_covered: f.covered ?? undefined,
    p_gated: f.gated ?? undefined,
    p_ev: f.ev ?? undefined,
    p_max_price: f.maxPrice ?? undefined,
  } as never);
  if (error) throw error;
  return (data ?? []) as SpaceResult[];
}

export type SpaceDetail = {
  id: string;
  title: string;
  description: string | null;
  address: string;
  lat: number;
  lng: number;
  price_per_hour: number;
  price_per_day: number | null;
  photos: string[];
  is_covered: boolean;
  is_gated: boolean;
  has_ev_charging: boolean;
  has_camera: boolean;
  has_sensor: boolean;
  vehicle_types: string[];
  live_occupancy_status: string;
  host_id: string;
  host_name: string | null;
  host_rating: number;
  host_trust_score: number;
  cancellation_policy: string;
  is_featured: boolean;
};

export async function getSpaceDetail(id: string): Promise<SpaceDetail | null> {
  const { data, error } = await supabase.rpc("get_space_detail", { p_id: id } as never);
  if (error) throw error;
  const row = (data ?? [])[0];
  return (row as SpaceDetail) ?? null;
}

export async function createPendingBooking(
  spaceId: string,
  startIso: string,
  endIso: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("create_pending_booking", {
    p_space_id: spaceId,
    p_start: startIso,
    p_end: endIso,
  } as never);
  if (error) throw error;
  return data as string;
}

export type MyBooking = {
  id: string;
  space_id: string;
  start_time: string;
  end_time: string;
  total_price: number;
  status: string;
  payment_status: string;
  qr_checkin_code: string | null;
  refund_amount: number;
  cancellation_policy: string;
  space_title: string;
  space_address: string;
};

export async function listMyBookings(): Promise<MyBooking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, space_id, start_time, end_time, total_price, status, payment_status, qr_checkin_code, refund_amount, parking_spaces!inner(title, address, cancellation_policy)",
    )
    .order("start_time", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(
    (b: {
      id: string;
      space_id: string;
      start_time: string;
      end_time: string;
      total_price: number;
      status: string;
      payment_status: string;
      qr_checkin_code: string | null;
      refund_amount: number | null;
      parking_spaces:
        | { title: string; address: string; cancellation_policy: string }
        | { title: string; address: string; cancellation_policy: string }[];
    }) => {
      const ps = Array.isArray(b.parking_spaces) ? b.parking_spaces[0] : b.parking_spaces;
      return {
        id: b.id,
        space_id: b.space_id,
        start_time: b.start_time,
        end_time: b.end_time,
        total_price: b.total_price,
        status: b.status,
        payment_status: b.payment_status,
        qr_checkin_code: b.qr_checkin_code,
        refund_amount: Number(b.refund_amount ?? 0),
        cancellation_policy: ps?.cancellation_policy ?? "moderate",
        space_title: ps?.title ?? "",
        space_address: ps?.address ?? "",
      };
    },
  );
}

export type CancellationQuote = {
  policy: string;
  cutoff_hours: number;
  hours_until_start: number;
  refundable: boolean;
  refund_amount: number;
};

export async function getCancellationQuote(bookingId: string): Promise<CancellationQuote> {
  const { data, error } = await supabase.rpc("get_cancellation_quote", {
    p_booking_id: bookingId,
  } as never);
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as CancellationQuote | undefined;
  if (!row) throw new Error("Could not load the cancellation policy");
  return {
    policy: row.policy,
    cutoff_hours: Number(row.cutoff_hours),
    hours_until_start: Number(row.hours_until_start),
    refundable: !!row.refundable,
    refund_amount: Number(row.refund_amount ?? 0),
  };
}
