import { supabase } from "@/integrations/supabase/client";

export const SUPPORT_EMAIL = "lumoroxpark@gmail.com";
export const BUSINESS_NAME = "Parking Space Management";
export const BRAND_NAME = "LUMORO X PARK";

export const SUPPORT_CATEGORIES = [
  { value: "general", label: "General question" },
  { value: "booking", label: "Booking or check-in issue" },
  { value: "hosting", label: "Hosting & listings" },
  { value: "payment", label: "Payments, payouts or refunds" },
  { value: "bug", label: "Report a bug" },
  { value: "abuse", label: "Report a listing or user" },
] as const;

export type SupportTicket = {
  id: string;
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
};

export type NewTicket = {
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
};

export async function submitSupportTicket(input: NewTicket): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("support_tickets").insert({
    ...input,
    user_id: auth.user?.id ?? null,
  });
  if (error) throw error;
}

export async function listMySupportTickets(): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from("support_tickets")
    .select("id, name, email, category, subject, message, status, admin_notes, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as SupportTicket[];
}

export async function updateTicketStatus(id: string, status: string, adminNotes?: string) {
  const { error } = await supabase
    .from("support_tickets")
    .update({ status, ...(adminNotes !== undefined ? { admin_notes: adminNotes } : {}) })
    .eq("id", id);
  if (error) throw error;
}

export function categoryLabel(value: string) {
  return SUPPORT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
