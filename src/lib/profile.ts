import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  is_host: boolean;
  rating: number;
  total_bookings: number;
  trust_score: number;
  created_at: string;
  updated_at: string;
};

export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: contact } = await supabase
    .from("profile_contacts")
    .select("phone")
    .eq("user_id", userId)
    .maybeSingle();
  return { ...(data as Omit<Profile, "phone">), phone: contact?.phone ?? null };
}

export async function updateMyProfile(
  userId: string,
  patch: Partial<Pick<Profile, "full_name" | "phone" | "is_host" | "avatar_url">>,
): Promise<Profile> {
  const { phone, ...profilePatch } = patch;
  const { data, error } = await supabase
    .from("profiles")
    .update(profilePatch)
    .eq("id", userId)
    .select("*")
    .single();
  if (error) throw error;
  if (phone !== undefined) {
    const { error: contactError } = await supabase
      .from("profile_contacts")
      .upsert({ user_id: userId, phone }, { onConflict: "user_id" });
    if (contactError) throw contactError;
  }
  const { data: contact } = await supabase
    .from("profile_contacts")
    .select("phone")
    .eq("user_id", userId)
    .maybeSingle();
  return { ...(data as Omit<Profile, "phone">), phone: contact?.phone ?? null };
}

export function trustBand(score: number): {
  label: string;
  tone: "success" | "warning" | "destructive" | "muted";
} {
  if (score >= 90) return { label: "Excellent", tone: "success" };
  if (score >= 70) return { label: "Trusted", tone: "success" };
  if (score >= 50) return { label: "Building", tone: "warning" };
  if (score >= 30) return { label: "At risk", tone: "warning" };
  return { label: "Low trust", tone: "destructive" };
}
