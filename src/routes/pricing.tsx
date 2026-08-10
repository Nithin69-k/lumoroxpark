import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { UpiPaymentPanel } from "@/components/UpiPaymentPanel";
import { Price } from "@/components/Price";
import { useServerFn } from "@tanstack/react-start";
import { activateUpiSubscription, changeSubscriptionPlan } from "@/utils/payments.functions";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Host Pro Pricing | LUMORO X PARK" },
      {
        name: "description",
        content:
          "Compare the free host plan with Host Pro: unlimited listings, featured placement and earnings analytics for parking hosts.",
      },
      { property: "og:title", content: "Host Pro Pricing | LUMORO X PARK" },
      {
        property: "og:description",
        content: "Unlimited listings, featured placement and analytics for parking hosts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PricingPage,
});

const FREE = [
  "Up to 2 listings",
  "10% platform commission",
  "Standard search placement",
  "Wallet & monthly payouts",
];
const PRO = [
  "Unlimited listings",
  "Reduced 5% platform commission",
  "Featured placement in search + Pro badge",
  "Earnings analytics & demand insights",
  "Priority support",
];

const PLANS: Record<string, { label: string; amount: number }> = {
  host_pro_monthly: { label: "Host Pro monthly", amount: 19 },
  host_pro_yearly: { label: "Host Pro yearly", amount: 190 },
};

function PricingPage() {
  const { isActive, subscription, pastDue, paused, cancelling, cancelAtPeriodEnd, pause, resume } =
    useSubscription();
  const [subBusy, setSubBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [payingPlan, setPayingPlan] = useState<string | null>(null);
  const runChangePlan = useServerFn(changeSubscriptionPlan);
  const runActivate = useServerFn(activateUpiSubscription);

  const currentPrice = subscription?.price_id;
  const otherPlan =
    currentPrice === "host_pro_monthly"
      ? { priceId: "host_pro_yearly", label: "Switch to yearly — 2 months free" }
      : currentPrice === "host_pro_yearly"
        ? { priceId: "host_pro_monthly", label: "Switch to monthly billing" }
        : null;

  async function switchPlan(priceId: string) {
    setSwitching(true);
    try {
      await runChangePlan({ data: { priceId } });
      toast.success("Your current plan ends at its cycle — pay for the new plan below");
      setPayingPlan(priceId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not switch your plan");
    } finally {
      setSwitching(false);
    }
  }

  async function runManage(fn: () => Promise<{ ok: true }>, success: string) {
    setSubBusy(true);
    try {
      await fn();
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update your subscription");
    } finally {
      setSubBusy(false);
    }
  }

  async function subscribe(priceId: string) {
    try {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) throw new Error("Sign in to subscribe");
      setPayingPlan(priceId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open checkout");
    }
  }

  async function confirmUpi(priceId: string, transactionRef: string) {
    await runActivate({ data: { priceId, transactionRef } });
    toast.success("Host Pro activated — welcome aboard");
    setPayingPlan(null);
  }

  const plan = payingPlan ? PLANS[payingPlan] : null;

  return (
    <div className="min-h-full bg-gradient-surface">
      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-5 py-4">
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Home
            </Link>
          </Button>
          <h1 className="font-display text-lg font-bold">Host plans</h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10">
        <div className="text-center">
          <h2 className="font-display text-3xl font-bold">Earn more from your driveway</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Listing is free. Upgrade when you want more spaces and better visibility.
          </p>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <h3 className="font-semibold">Starter</h3>
            <div className="mt-2 text-3xl font-bold">
              <Price usd={0} />
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {FREE.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-muted-foreground" />
                  {f}
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" className="mt-6 w-full">
              <Link to="/host">Go to host dashboard</Link>
            </Button>
          </div>

          <div className="rounded-2xl border border-primary/40 bg-primary/5 p-6 shadow-card">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Host Pro</h3>
            </div>
            <div className="mt-2 text-3xl font-bold">
              <Price usd={19} />
              <span className="text-base font-normal text-muted-foreground">/month</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              or <Price usd={190} showInr={false} /> billed yearly — 2 months free
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              {PRO.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  {f}
                </li>
              ))}
            </ul>

            {isActive ? (
              <div className="mt-6 space-y-3">
                <div className="rounded-xl border border-border bg-background/60 p-3 text-sm">
                  You're on Host Pro
                  {subscription?.cancel_at_period_end && subscription.current_period_end
                    ? ` — access until ${new Date(subscription.current_period_end).toLocaleDateString()}`
                    : subscription?.current_period_end
                      ? ` — renews ${new Date(subscription.current_period_end).toLocaleDateString()}`
                      : ""}
                  .
                </div>
                {pastDue && (
                  <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
                    Your last payment failed. Contact support to keep Pro benefits.
                  </div>
                )}
                {paused && (
                  <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
                    Your plan is paused, so Pro benefits are on hold. Resume it to keep them.
                  </div>
                )}
                {otherPlan && (
                  <Button
                    variant="secondary"
                    className="w-full"
                    disabled={switching}
                    onClick={() => switchPlan(otherPlan.priceId)}
                  >
                    {switching ? "Switching…" : otherPlan.label}
                  </Button>
                )}
                {cancelling ? (
                  <div className="rounded-xl border border-border bg-background/60 p-3 text-sm">
                    Your plan stays active until{" "}
                    {subscription?.current_period_end
                      ? new Date(subscription.current_period_end).toLocaleDateString()
                      : "the end of this cycle"}
                    , then it won't renew.
                  </div>
                ) : paused ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={subBusy}
                    onClick={() => runManage(resume, "Your plan has been resumed")}
                  >
                    {subBusy ? "Working…" : "Resume plan"}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={subBusy}
                    onClick={() => runManage(pause, "Your plan has been paused")}
                  >
                    {subBusy ? "Working…" : "Pause plan"}
                  </Button>
                )}
                {!paused && !cancelling && (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={subBusy}
                    onClick={() =>
                      runManage(cancelAtPeriodEnd, "Your plan won't renew after this cycle")
                    }
                  >
                    {subBusy ? "Working…" : "Cancel at end of cycle"}
                  </Button>
                )}
              </div>
            ) : (
              <div className="mt-6 space-y-2">
                <Button className="w-full" onClick={() => subscribe("host_pro_monthly")}>
                  Subscribe monthly
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => subscribe("host_pro_yearly")}
                >
                  Subscribe yearly
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>

      <Dialog open={Boolean(plan)} onOpenChange={(o) => !o && setPayingPlan(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pay for {plan?.label}</DialogTitle>
            <DialogDescription>
              Pay once via UPI and your Host Pro plan is activated immediately for the billing
              period.
            </DialogDescription>
          </DialogHeader>
          {plan && (
            <UpiPaymentPanel
              amount={plan.amount}
              note={plan.label}
              confirmLabel="Activate plan"
              onConfirm={(ref) => confirmUpi(payingPlan!, ref)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
