import { supabase } from "@/integrations/supabase/client";

export type SeedDemoResult = { spaces: number; bookings: number; disputes: number };

export async function seedDemoData(): Promise<SeedDemoResult> {
  const { data, error } = await supabase.rpc("seed_demo_data");
  if (error) throw error;
  const row = (data ?? {}) as Partial<SeedDemoResult>;
  return {
    spaces: Number(row.spaces ?? 0),
    bookings: Number(row.bookings ?? 0),
    disputes: Number(row.disputes ?? 0),
  };
}

export async function resetDemoData(): Promise<{ spaces_removed: number }> {
  const { data, error } = await supabase.rpc("reset_demo_data");
  if (error) throw error;
  const row = (data ?? {}) as { spaces_removed?: number };
  return { spaces_removed: Number(row.spaces_removed ?? 0) };
}

export type ActivityRow = {
  id: string;
  user_id: string;
  action: string;
  reference_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export async function listMyActivity(limit = 50): Promise<ActivityRow[]> {
  const { data, error } = await supabase
    .from("activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityRow[];
}

export async function isAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function raiseDispute(bookingId: string, reason: string) {
  const { data, error } = await supabase.rpc("raise_dispute", {
    p_booking_id: bookingId,
    p_reason: reason,
  });
  if (error) throw error;
  return data as string;
}

export type DisputeStatus = "open" | "under_review" | "resolved" | "rejected";

export type MyDispute = {
  id: string;
  booking_id: string;
  reason: string;
  status: DisputeStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string | null;
};

export async function listMyDisputesForBooking(bookingId: string): Promise<MyDispute[]> {
  const { data, error } = await supabase
    .from("disputes")
    .select("id, booking_id, reason, status, admin_notes, created_at, updated_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MyDispute[];
}

export type AdminDispute = {
  id: string;
  booking_id: string;
  raised_by: string;
  reason: string;
  status: DisputeStatus;
  admin_notes: string | null;
  created_at: string;
  renter_name: string | null;
  host_name: string | null;
  space_title: string | null;
};

export async function adminListDisputes(): Promise<AdminDispute[]> {
  const { data, error } = await supabase.rpc("admin_list_disputes");
  if (error) throw error;
  return (data ?? []) as AdminDispute[];
}

export async function resolveDispute(id: string, status: DisputeStatus, notes: string) {
  const { error } = await supabase.rpc("resolve_dispute", {
    p_dispute_id: id,
    p_status: status,
    p_notes: notes,
  });
  if (error) throw error;
}

export type DisputeEvent = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  from_status: DisputeStatus | null;
  to_status: DisputeStatus;
  note: string | null;
  created_at: string;
};

export async function listDisputeEvents(disputeId: string): Promise<DisputeEvent[]> {
  const { data, error } = await supabase.rpc("list_dispute_events", { p_dispute_id: disputeId });
  if (error) throw error;
  return (data ?? []) as DisputeEvent[];
}

export const DISPUTE_STATUS_LABEL: Record<DisputeStatus, string> = {
  open: "Submitted",
  under_review: "Under review",
  resolved: "Resolved",
  rejected: "Rejected",
};

export type AdminStats = {
  users: number;
  spaces: number;
  active_spaces: number;
  bookings: number;
  completed_bookings: number;
  total_revenue: number;
  avg_trust_score: number;
  open_disputes: number;
};

export async function adminStats(): Promise<AdminStats | null> {
  const { data, error } = await supabase.rpc("admin_stats");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    users: Number(row.users ?? 0),
    spaces: Number(row.spaces ?? 0),
    active_spaces: Number(row.active_spaces ?? 0),
    bookings: Number(row.bookings ?? 0),
    completed_bookings: Number(row.completed_bookings ?? 0),
    total_revenue: Number(row.total_revenue ?? 0),
    avg_trust_score: Number(row.avg_trust_score ?? 0),
    open_disputes: Number(row.open_disputes ?? 0),
  };
}

export type DemandArea = {
  address: string;
  bookings: number;
  revenue: number;
  active_listings: number;
};

export async function adminTopDemandAreas(limit = 5): Promise<DemandArea[]> {
  const { data, error } = await supabase.rpc("admin_top_demand_areas", { p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    address: String(r.address ?? "—"),
    bookings: Number(r.bookings ?? 0),
    revenue: Number(r.revenue ?? 0),
    active_listings: Number(r.active_listings ?? 0),
  }));
}

export function humanAction(action: string): string {
  const map: Record<string, string> = {
    booking_created: "Reserved a space",
    booking_received: "New booking on your space",
    booking_confirmed: "Booking confirmed",
    booking_active: "Checked in",
    booking_completed: "Stay completed",
    booking_cancelled: "Booking cancelled",
    review_left: "Left a review",
    review_received: "Received a review",
    dispute_raised: "Raised a dispute",
    dispute_open: "Dispute submitted",
    dispute_under_review: "Dispute under review",
    dispute_resolved: "Dispute resolved",
    dispute_rejected: "Dispute rejected",
  };
  return map[action] ?? action.replace(/_/g, " ");
}
