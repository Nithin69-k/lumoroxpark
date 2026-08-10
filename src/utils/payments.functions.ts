import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PAYMENT_ENV, validateUpiReference } from "@/lib/upi";

export type ConfirmBookingResult = {
  status: string;
  conflict: boolean;
};

/**
 * Confirms a pending booking once the driver has paid by UPI and entered the
 * transaction reference from their UPI app.
 */
export const confirmUpiBookingPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { bookingId: string; transactionRef: string }) => data)
  .handler(async ({ data, context }): Promise<ConfirmBookingResult> => {
    const transactionRef = validateUpiReference(data.transactionRef);

    const { data: used, error: usedError } = await context.supabase
      .from("bookings")
      .select("id")
      .eq("razorpay_transaction_id", transactionRef)
      .eq("payment_status", "paid")
      .maybeSingle();
    if (usedError) throw new Error(usedError.message);
    if (used) throw new Error("That UPI reference was already used for another booking");

    const { data: charge, error: chargeError } = await context.supabase.rpc("get_booking_charge", {
      p_booking_id: data.bookingId,
      p_env: PAYMENT_ENV,
    });
    if (chargeError) throw new Error(chargeError.message);
    const chargeRow = (Array.isArray(charge) ? charge[0] : charge) as { total: number } | undefined;
    const amountCharged = chargeRow ? Number(chargeRow.total) : 0;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: outcome, error } = await supabaseAdmin.rpc("settle_booking_payment", {
      p_booking_id: data.bookingId,
      p_transaction_id: transactionRef,
      p_amount_charged: amountCharged,
      p_env: PAYMENT_ENV,
    });
    if (error) throw new Error(error.message);

    if (outcome === "conflict") {
      return { status: "conflict", conflict: true };
    }
    return { status: String(outcome ?? "settled"), conflict: false };
  });

export type CancelBookingResult = {
  status: string;
  paymentStatus: string;
  refundAmount: number;
  refundRequested: boolean;
};

/**
 * Cancels a booking under the host's cancellation policy. UPI refunds are
 * issued manually by the business, so the refund amount is reported for
 * reference rather than returned automatically.
 */
export const cancelBookingWithRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { bookingId: string; reason?: string }) => data)
  .handler(async ({ data, context }): Promise<CancelBookingResult> => {
    const { data: row, error } = await context.supabase.rpc("cancel_booking", {
      p_booking_id: data.bookingId,
      p_reason: data.reason ?? undefined,
    });
    if (error) throw new Error(error.message);

    const booking = (Array.isArray(row) ? row[0] : row) as {
      status: string;
      payment_status: string;
      refund_amount: number | string | null;
    } | null;

    return {
      status: booking?.status ?? "cancelled",
      paymentStatus: booking?.payment_status ?? "unpaid",
      refundAmount: Number(booking?.refund_amount ?? 0),
      refundRequested: false,
    };
  });

const PLAN_PRICES: Record<string, { amount: number; days: number }> = {
  host_pro_monthly: { amount: 19, days: 30 },
  host_pro_yearly: { amount: 190, days: 365 },
};

export type ActivateSubscriptionResult = {
  subscriptionId: string;
  amount: number;
};

/**
 * Activates Host Pro once the UPI payment for the plan has been made. The
 * transaction reference is stored as the subscription id so every payment is
 * traceable in the billing history.
 */
export const activateUpiSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { priceId: string; transactionRef: string }) => data)
  .handler(async ({ data, context }): Promise<ActivateSubscriptionResult> => {
    const plan = PLAN_PRICES[data.priceId];
    if (!plan) throw new Error("Unknown plan");
    const transactionRef = validateUpiReference(data.transactionRef);
    const subscriptionId = `upi-${transactionRef}`;

    const { data: existing, error: existingError } = await context.supabase
      .from("subscriptions")
      .select("id, status, cancel_at_period_end, current_period_end")
      .eq("user_id", context.userId)
      .eq("environment", PAYMENT_ENV)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const stillActive =
      existing &&
      (["active", "trialing", "past_due"].includes(existing.status) ||
        (existing.status === "canceled" &&
          existing.current_period_end &&
          new Date(existing.current_period_end) > new Date())) &&
      !existing.cancel_at_period_end;
    if (stillActive) {
      throw new Error("You already have an active Host Pro plan");
    }

    const { data: dup, error: dupError } = await context.supabase
      .from("subscriptions")
      .select("id")
      .eq("razorpay_subscription_id", subscriptionId)
      .maybeSingle();
    if (dupError) throw new Error(dupError.message);
    if (dup) throw new Error("That UPI reference was already used");

    const now = new Date();
    const end = new Date(now.getTime() + plan.days * 86400000);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        user_id: context.userId,
        product_id: "host_pro",
        price_id: data.priceId,
        status: "active",
        environment: PAYMENT_ENV,
        current_period_start: now.toISOString(),
        current_period_end: end.toISOString(),
        razorpay_subscription_id: subscriptionId,
        razorpay_customer_id: `upi-${context.userId.slice(0, 12)}`,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("notifications").insert({
      user_id: context.userId,
      kind: "payment",
      title: "Host Pro activated",
      body: "Your plan is active — unlimited listings, reduced commission and featured placement.",
      link: "/pricing",
    });

    return { subscriptionId: inserted.id, amount: plan.amount };
  });

/** Finds the user's subscription row for the payment environment. */
async function findSubscription(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data, error } = await context.supabase
    .from("subscriptions")
    .select("id, status, cancel_at_period_end, current_period_end")
    .eq("user_id", context.userId)
    .eq("environment", PAYMENT_ENV)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No subscription found for your account");
  return data;
}

/** Cancels the Host Pro subscription at the end of the current cycle. */
export const cancelSubscriptionAtPeriodEnd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const sub = await findSubscription(context);
    await context.supabase
      .from("subscriptions")
      .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
      .eq("id", sub.id);
    return { ok: true };
  });

/** Pauses the Host Pro subscription until resumed. */
export const pauseSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const sub = await findSubscription(context);
    await context.supabase
      .from("subscriptions")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("id", sub.id);
    return { ok: true };
  });

/** Resumes a paused Host Pro subscription. */
export const resumeSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const sub = await findSubscription(context);
    await context.supabase
      .from("subscriptions")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", sub.id);
    return { ok: true };
  });

/**
 * Switches an active Host Pro subscription between plans: the current plan is
 * cancelled at the end of its cycle, then the new plan is paid for by UPI
 * through the normal subscription flow.
 */
export const changeSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { priceId: string }) => data)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const plan = PLAN_PRICES[data.priceId];
    if (!plan) throw new Error("Unknown plan");
    const sub = await findSubscription(context);
    if (!["active", "trialing", "past_due"].includes(sub.status)) {
      throw new Error("Your plan must be active before you can switch it");
    }
    await context.supabase
      .from("subscriptions")
      .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
      .eq("id", sub.id);
    return { ok: true };
  });
