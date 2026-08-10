import { supabase } from "@/integrations/supabase/client";
import { getPaymentEnvironment } from "@/lib/upi";

export type BookingCharge = {
  base_amount: number;
  platform_fee: number;
  reservation_fee: number;
  total: number;
  credits: number;
};

export async function getBookingCharge(bookingId: string): Promise<BookingCharge> {
  const { data, error } = await supabase.rpc("get_booking_charge", {
    p_booking_id: bookingId,
    p_env: getPaymentEnvironment(),
  } as never);
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as BookingCharge | undefined;
  if (!row) throw new Error("Could not price this booking");
  return {
    base_amount: Number(row.base_amount),
    platform_fee: Number(row.platform_fee),
    reservation_fee: Number(row.reservation_fee),
    total: Number(row.total),
    credits: Number(row.credits),
  };
}

export type BillingEntry = {
  kind: string;
  description: string;
  amount: number | null;
  status: string;
  reference: string | null;
  occurred_at: string;
};

/** Every payment, refund and plan charge on the signed-in account. */
export async function listMyBillingHistory(): Promise<BillingEntry[]> {
  const { data, error } = await supabase.rpc("my_billing_history", {
    p_env: getPaymentEnvironment(),
  } as never);
  if (error) throw error;
  return ((data ?? []) as BillingEntry[]).map((r) => ({
    ...r,
    amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
  }));
}

/** Reasons the account cannot be deleted right now (empty = deletable). */
export async function getAccountDeletionBlockers(): Promise<string[]> {
  const { data, error } = await supabase.rpc("account_deletion_blockers" as never);
  if (error) throw error;
  return ((data ?? []) as Array<{ reason: string }>).map((r) => r.reason);
}
