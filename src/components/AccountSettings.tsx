import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  KeyRound,
  Mail,
  Receipt,
  Trash2,
  Lock,
  CreditCard,
  User,
  ShieldAlert,
  CheckCircle2,
  Calendar,
  ChevronRight,
  Info,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/utils/account.functions";
import {
  getAccountDeletionBlockers,
  listMyBillingHistory,
  type BillingEntry,
} from "@/lib/payments";

export function AccountSettings({ email }: { email: string }) {
  const [activeTab, setActiveTab] = useState<"billing" | "security" | "account">("billing");

  const tabs = [
    { id: "billing", label: "Billing & Invoices", icon: CreditCard },
    { id: "security", label: "Security & Login", icon: Lock },
    { id: "account", label: "Account Management", icon: User },
  ] as const;

  return (
    <section className="mt-8 overflow-hidden rounded-3xl border border-border bg-card shadow-card-hover transition-all duration-300">
      {/* Header and Tab Selection */}
      <div className="border-b border-border/80 bg-muted/30 p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
              Account Workspace
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage payments, update login credentials, and configure personal settings.
            </p>
          </div>
          {/* Segmented control tabs */}
          <div className="flex rounded-2xl bg-muted/80 p-1 border border-border/40 max-w-fit">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab Panels */}
      <div className="p-5 md:p-6 bg-card">
        {activeTab === "billing" && <BillingPanel />}
        {activeTab === "security" && <SecurityPanel />}
        {activeTab === "account" && <AccountPanel currentEmail={email} />}
      </div>
    </section>
  );
}

/* ==========================================================================
   BILLING PANEL
   ========================================================================== */
function BillingPanel() {
  const { data, isLoading, error } = useQuery<BillingEntry[]>({
    queryKey: ["billing-history"],
    queryFn: listMyBillingHistory,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/60" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed border-border/80 bg-muted/20">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <h4 className="mt-3 text-sm font-semibold text-foreground">Billing details offline</h4>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm">
          We could not load your payment history at this time. Please reload or contact support.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-foreground">Transaction Ledger</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          History of all payments, driver refunds, and host subscription adjustments.
        </p>
      </div>

      {!data || data.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-10 text-center rounded-2xl border border-dashed border-border/60 bg-muted/20">
          <div className="p-3.5 rounded-2xl bg-muted text-muted-foreground">
            <Receipt className="h-6 w-6" />
          </div>
          <h4 className="mt-4 text-sm font-bold text-foreground">No Transactions</h4>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs leading-normal">
            Your ledger is clean! Booking charges or host payouts will show up here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/80">
          <ul className="divide-y divide-border/80">
            {data.map((row, i) => {
              const isRefund = row.amount !== null && row.amount < 0;
              const formattedAmt = row.amount === null ? "—" : `$${Math.abs(row.amount).toFixed(2)}`;
              const displayStatus = row.status.replace(/_/g, " ");

              return (
                <li
                  key={`${row.reference ?? row.kind}-${i}`}
                  className="flex items-center justify-between gap-4 p-4 hover:bg-muted/10 transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`p-2.5 rounded-xl border ${
                        isRefund
                          ? "bg-emerald-500/5 text-emerald-500 border-emerald-500/10"
                          : "bg-primary/5 text-primary border-primary/10"
                      }`}
                    >
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 text-left">
                      <div className="text-sm font-bold text-foreground truncate">{row.description}</div>
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{new Date(row.occurred_at).toLocaleDateString()}</span>
                        <span>•</span>
                        <span
                          className={`capitalize font-medium ${
                            row.status === "completed" || row.status === "paid"
                              ? "text-emerald-500"
                              : "text-amber-500"
                          }`}
                        >
                          {displayStatus}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-sm font-extrabold text-foreground">{formattedAmt}</span>
                    {isRefund && (
                      <span className="block text-[9px] font-semibold text-emerald-500 uppercase mt-0.5 tracking-wider">
                        Refunded
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   SECURITY PANEL
   ========================================================================== */
function SecurityPanel() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setConfirm("");
      toast.success("Security password updated successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update your password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h3 className="text-sm font-bold text-foreground">Update Password</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Secure your account credentials. We recommend using a strong password manager generator.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 text-left">
            <Label htmlFor="newPassword">New Password</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/80" />
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                className="pl-9.5 rounded-xl"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5 text-left">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/80" />
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                className="pl-9.5 rounded-xl"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
          </div>
        </div>

        <div className="pt-2">
          <Button type="submit" size="sm" className="rounded-xl font-bold" disabled={busy}>
            {busy ? "Saving settings…" : "Update password"}
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ==========================================================================
   ACCOUNT PANEL
   ========================================================================== */
function AccountPanel({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser(
        { email: email.trim() },
        { emailRedirectTo: `${window.location.origin}/profile` },
      );
      if (error) throw error;
      setEmail("");
      toast.success("Verification links sent. Check both inbox folders.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update your email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Email Address Section */}
      <div className="space-y-4 max-w-xl">
        <div>
          <h3 className="text-sm font-bold text-foreground">Email Address</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your registered login email address. We'll request confirmation links on both ends.
          </p>
        </div>

        <form onSubmit={submitEmail} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5 text-left">
            <Label htmlFor="newEmail">
              New Email Address{" "}
              <span className="text-[10px] text-muted-foreground font-normal">
                (Current: {currentEmail})
              </span>
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/80" />
              <Input
                id="newEmail"
                type="email"
                className="pl-9.5 rounded-xl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
          </div>
          <Button type="submit" size="sm" className="rounded-xl font-bold" disabled={busy}>
            {busy ? "Sending link…" : "Update email"}
          </Button>
        </form>
      </div>

      {/* Danger Zone: Delete Account */}
      <div className="pt-6 border-t border-border/80">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/[0.02] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="text-left">
              <div className="flex items-center gap-2 text-sm font-bold text-destructive">
                <ShieldAlert className="h-4.5 w-4.5" />
                Danger Zone: Permanently Delete Account
              </div>
              <p className="mt-1 text-xs text-muted-foreground max-w-xl leading-relaxed">
                This action will instantly delete your profile, current reservations, and all listed parking spaces. 
                Any outstanding slot earnings or active host subscriptions will be terminated. **This cannot be undone.**
              </p>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-destructive/10">
            <DeleteAccountFlow />
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteAccountFlow() {
  const navigate = useNavigate();
  const runDelete = useServerFn(deleteMyAccount);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: blockers = [], isLoading } = useQuery({
    queryKey: ["account-deletion-blockers"],
    queryFn: getAccountDeletionBlockers,
  });

  async function submit() {
    setBusy(true);
    try {
      await runDelete({ data: undefined });
      await supabase.auth.signOut();
      toast.success("Your account has been deleted");
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete your account");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <div className="h-10 animate-pulse rounded-xl bg-muted/40" />;

  if (blockers.length > 0) {
    return (
      <div className="rounded-xl bg-destructive/5 p-4 border border-destructive/10 text-left">
        <div className="flex items-center gap-2 text-xs font-bold text-destructive">
          <Info className="h-4 w-4" />
          Resolve these blockers before deletion:
        </div>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground pl-5 list-disc">
          {blockers.map((b) => (
            <li key={b} className="leading-relaxed">{b}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5 sm:flex-row sm:items-end max-w-md">
      <div className="flex-1 space-y-1.5 text-left">
        <Label htmlFor="deleteConfirm" className="text-destructive/90">
          Confirm Deletion
        </Label>
        <Input
          id="deleteConfirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Type DELETE to confirm"
          className="rounded-xl border-destructive/20 focus-visible:ring-destructive/30"
        />
      </div>
      <Button
        variant="destructive"
        size="sm"
        className="rounded-xl font-bold font-sans"
        disabled={busy || confirmText !== "DELETE"}
        onClick={submit}
      >
        {busy ? "Terminating account…" : "Permanently Delete"}
      </Button>
    </div>
  );
}
