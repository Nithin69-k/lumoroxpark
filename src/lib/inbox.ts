import { supabase } from "@/integrations/supabase/client";

export type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  booking_id: string | null;
  read_at: string | null;
  created_at: string;
};

export async function listNotifications(): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, booking_id, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as Notification[];
}

export async function unreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function markAllRead(): Promise<void> {
  const { error } = await supabase.rpc("mark_notifications_read");
  if (error) throw error;
}

export type Message = {
  id: string;
  booking_id: string;
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export async function listMessages(bookingId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, booking_id, sender_id, body, read_at, created_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function sendMessage(bookingId: string, body: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Message is empty");
  const { error } = await supabase
    .from("messages")
    .insert({ booking_id: bookingId, sender_id: u.user.id, body: trimmed });
  if (error) throw error;
}

export type BookingThread = {
  booking_id: string;
  space_title: string;
  counterparty_name: string | null;
  last_message: string | null;
  last_at: string | null;
  unread: number;
};

export async function listMyThreads(): Promise<BookingThread[]> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  const uid = u.user.id;
  // Bookings where I'm renter or host
  // RLS already limits bookings to the ones I'm renter or host on.
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(
      "id, renter_id, space:parking_spaces!inner(id, title, host_id, host:profiles!parking_spaces_host_id_fkey(full_name)), renter:profiles!bookings_renter_id_fkey(full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  const rows = (bookings ?? []) as unknown as Array<{
    id: string;
    renter_id: string;
    space: { title: string; host_id: string; host: { full_name: string | null } | null };
    renter: { full_name: string | null } | null;
  }>;
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const { data: msgs } = await supabase
    .from("messages")
    .select("booking_id, body, created_at, sender_id, read_at")
    .in("booking_id", ids)
    .order("created_at", { ascending: false });

  const lastByBooking = new Map<string, { body: string; created_at: string }>();
  const unreadByBooking = new Map<string, number>();
  for (const m of msgs ?? []) {
    if (!lastByBooking.has(m.booking_id)) {
      lastByBooking.set(m.booking_id, { body: m.body, created_at: m.created_at });
    }
    if (!m.read_at && m.sender_id !== uid) {
      unreadByBooking.set(m.booking_id, (unreadByBooking.get(m.booking_id) ?? 0) + 1);
    }
  }

  return rows
    .map((r) => {
      const isHost = r.space.host_id === uid;
      const last = lastByBooking.get(r.id);
      return {
        booking_id: r.id,
        space_title: r.space.title,
        counterparty_name: isHost
          ? (r.renter?.full_name ?? "Renter")
          : (r.space.host?.full_name ?? "Host"),
        last_message: last?.body ?? null,
        last_at: last?.created_at ?? null,
        unread: unreadByBooking.get(r.id) ?? 0,
      };
    })
    .sort((a, b) => (b.last_at ?? "").localeCompare(a.last_at ?? ""));
}
