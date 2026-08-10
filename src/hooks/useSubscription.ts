import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPaymentEnvironment } from "@/lib/upi";
import {
  cancelSubscriptionAtPeriodEnd,
  pauseSubscription,
  resumeSubscription,
} from "@/utils/payments.functions";
import { useServerFn } from "@tanstack/react-start";

export type SubscriptionRow = {
  id: string;
  price_id: string;
  product_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
};

function computeActive(sub: SubscriptionRow | null): boolean {
  if (!sub) return false;
  const end = sub.current_period_end ? new Date(sub.current_period_end) : null;
  const future = !end || end > new Date();
  if (["active", "trialing", "past_due"].includes(sub.status)) return future;
  if (sub.status === "canceled") return !!end && end > new Date();
  return false;
}

export function useSubscription() {
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const runCancel = useServerFn(cancelSubscriptionAtPeriodEnd);
  const runPause = useServerFn(pauseSubscription);
  const runResume = useServerFn(resumeSubscription);

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("subscriptions")
      .select("id, price_id, product_id, status, current_period_end, cancel_at_period_end")
      .eq("user_id", userId)
      .eq("environment", getPaymentEnvironment())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setSubscription((data as SubscriptionRow | null) ?? null);
    setLoading(false);
  }

  useEffect(() => {
    let alive = true;
    load().catch(() => alive && setLoading(false));

    const channel = supabase
      .channel("subscriptions-self")
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, () => {
        if (alive) load().catch(() => undefined);
      })
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const isActive = computeActive(subscription);

  async function cancelAtPeriodEnd() {
    const res = await runCancel();
    await load();
    return res;
  }

  async function pause() {
    const res = await runPause();
    await load();
    return res;
  }

  async function resume() {
    const res = await runResume();
    await load();
    return res;
  }

  return {
    subscription,
    isActive,
    isPro: isActive,
    pastDue: subscription?.status === "past_due",
    cancelling: !!subscription?.cancel_at_period_end,
    paused: subscription?.status === "paused",
    loading,
    refresh: load,
    cancelAtPeriodEnd,
    pause,
    resume,
  };
}
