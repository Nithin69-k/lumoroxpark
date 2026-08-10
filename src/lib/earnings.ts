import { supabase } from "@/integrations/supabase/client";
import { getPaymentEnvironment } from "@/lib/upi";

export type Wallet = {
  lifetime_earnings: number;
  available_balance: number;
  pending_clearance: number;
  pending_payout: number;
  total_paid_out: number;
};

export type WalletTransaction = {
  id: string;
  kind: string;
  amount: number;
  balance_after: number;
  note: string | null;
  created_at: string;
};

export type PayoutRequest = {
  id: string;
  amount: number;
  status: string;
  bank_name: string | null;
  account_number: string | null;
  is_automatic: boolean;
  admin_notes: string | null;
  requested_at: string;
  processed_at: string | null;
};

export type AdminPayout = PayoutRequest & {
  host_id: string;
  host_name: string | null;
  account_holder: string | null;
  bank_code: string | null;
};

const num = (v: unknown) => Number(v ?? 0);

export async function getMyWallet(): Promise<Wallet> {
  const { data, error } = await supabase.rpc("get_my_wallet");
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Wallet | undefined;
  return {
    lifetime_earnings: num(row?.lifetime_earnings),
    available_balance: num(row?.available_balance),
    pending_clearance: num(row?.pending_clearance),
    pending_payout: num(row?.pending_payout),
    total_paid_out: num(row?.total_paid_out),
  };
}

export async function listMyWalletTransactions(limit = 50): Promise<WalletTransaction[]> {
  const { data, error } = await supabase.rpc("list_my_wallet_transactions", {
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as WalletTransaction[]).map((t) => ({
    ...t,
    amount: num(t.amount),
    balance_after: num(t.balance_after),
  }));
}

export async function listMyPayouts(): Promise<PayoutRequest[]> {
  const { data, error } = await supabase.rpc("list_my_payouts");
  if (error) throw error;
  return ((data ?? []) as PayoutRequest[]).map((p) => ({ ...p, amount: num(p.amount) }));
}

export async function requestPayout(input: {
  amount: number;
  accountHolder: string;
  accountNumber: string;
  bankCode: string;
  bankName: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("request_payout", {
    p_amount: input.amount,
    p_account_holder: input.accountHolder,
    p_account_number: input.accountNumber,
    p_bank_code: input.bankCode,
    p_bank_name: input.bankName,
  });
  if (error) throw error;
  return data as string;
}

export async function adminListPayouts(): Promise<AdminPayout[]> {
  const { data, error } = await supabase.rpc("admin_list_payouts");
  if (error) throw error;
  return ((data ?? []) as AdminPayout[]).map((p) => ({ ...p, amount: num(p.amount) }));
}

export async function adminProcessPayout(
  payoutId: string,
  action: "approve" | "paid" | "reject",
  notes?: string,
): Promise<void> {
  const { error } = await supabase.rpc("admin_process_payout", {
    p_payout_id: payoutId,
    p_action: action,
    p_notes: notes ?? undefined,
  });
  if (error) throw error;
}

export type EarningsPoint = { month: string; bookings: number; gross: number; net: number };

/** Host Pro only — monthly earnings breakdown for the last 12 months. */
export async function getHostEarningsAnalytics(): Promise<EarningsPoint[]> {
  const { data, error } = await supabase.rpc("host_earnings_analytics", {
    p_env: getPaymentEnvironment(),
  } as never);
  if (error) throw error;
  return ((data ?? []) as EarningsPoint[]).map((r) => ({
    month: r.month,
    bookings: num(r.bookings),
    gross: num(r.gross),
    net: num(r.net),
  }));
}
