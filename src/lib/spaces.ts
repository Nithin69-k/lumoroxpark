import { supabase } from "@/integrations/supabase/client";
import { getPaymentEnvironment } from "@/lib/upi";

export type MySpace = {
  id: string;
  title: string;
  address: string;
  lat: number;
  lng: number;
  price_per_hour: number;
  price_per_day: number | null;
  is_active: boolean;
  live_occupancy_status: string;
  photos: string[];
  created_at: string;
};

export type CreateSpaceInput = {
  title: string;
  description: string;
  address: string;
  lat: number;
  lng: number;
  price_per_hour: number;
  price_per_day: number | null;
  vehicle_types: string[];
  is_covered: boolean;
  is_gated: boolean;
  has_ev_charging: boolean;
  has_camera: boolean;
  has_sensor: boolean;
  photos: string[];
  cancellation_policy: CancellationPolicy;
};

export type CancellationPolicy = "flexible" | "moderate" | "strict";

export const CANCELLATION_POLICIES: {
  value: CancellationPolicy;
  label: string;
  hours: number;
  blurb: string;
}[] = [
  {
    value: "flexible",
    label: "Flexible",
    hours: 1,
    blurb: "Full refund up to 1 hour before start.",
  },
  {
    value: "moderate",
    label: "Moderate",
    hours: 12,
    blurb: "Full refund up to 12 hours before start.",
  },
  {
    value: "strict",
    label: "Strict",
    hours: 24,
    blurb: "Full refund up to 24 hours before start.",
  },
];

export function policyLabel(p: string | null | undefined) {
  return CANCELLATION_POLICIES.find((x) => x.value === p) ?? CANCELLATION_POLICIES[1];
}

export type ListingQuota = { used: number; max_allowed: number; is_pro: boolean };

export async function getMyListingQuota(): Promise<ListingQuota> {
  const { data, error } = await supabase.rpc("my_listing_quota", {
    p_env: getPaymentEnvironment(),
  } as never);
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as ListingQuota | undefined;
  return {
    used: Number(row?.used ?? 0),
    max_allowed: Number(row?.max_allowed ?? 2),
    is_pro: !!row?.is_pro,
  };
}

export async function createSpace(input: CreateSpaceInput): Promise<string> {
  const { data, error } = await supabase.rpc("create_parking_space", {
    p_title: input.title,
    p_description: input.description,
    p_address: input.address,
    p_lat: input.lat,
    p_lng: input.lng,
    p_price_per_hour: input.price_per_hour,
    p_price_per_day: input.price_per_day as number,
    p_vehicle_types: input.vehicle_types,
    p_is_covered: input.is_covered,
    p_is_gated: input.is_gated,
    p_has_ev_charging: input.has_ev_charging,
    p_has_camera: input.has_camera,
    p_has_sensor: input.has_sensor,
    p_photos: input.photos,
    p_cancellation_policy: input.cancellation_policy,
    p_env: getPaymentEnvironment(),
  } as never);
  if (error) throw error;
  return data as string;
}

export async function listMySpaces(): Promise<MySpace[]> {
  const { data, error } = await supabase.rpc("list_my_spaces");
  if (error) throw error;
  return (data ?? []) as MySpace[];
}

export async function toggleSpaceActive(id: string, isActive: boolean) {
  const { error } = await supabase
    .from("parking_spaces")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw error;
}

export async function uploadSpacePhoto(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("space-photos")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function signedPhotoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("space-photos")
    .createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export type Slot = {
  id: string;
  space_id: string;
  start_time: string;
  end_time: string;
  is_booked: boolean;
};

export async function listSlots(spaceId: string): Promise<Slot[]> {
  const { data, error } = await supabase
    .from("availability_slots")
    .select("*")
    .eq("space_id", spaceId)
    .order("start_time", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Slot[];
}

export async function addSlot(spaceId: string, startIso: string, endIso: string) {
  const { error } = await supabase
    .from("availability_slots")
    .insert({ space_id: spaceId, start_time: startIso, end_time: endIso });
  if (error) throw error;
}

export async function deleteSlot(id: string) {
  const { error } = await supabase.from("availability_slots").delete().eq("id", id);
  if (error) throw error;
}
