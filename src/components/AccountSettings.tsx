import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, Mail, Receipt, Trash2 } from "lucide-react";

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

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ChangePassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Use at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setConfirm("");
      toast.success("Password updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update your password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Update password"}
        </Button>
      </div>
    </form>
  );
}

function ChangeEmail({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser(
        { email: email.trim() },
        { emailRedirectTo: `${window.location.origin}/profile` },
      );
      if (error) throw error;
      setEmail("");
      toast.success("Check both inboxes to confirm the change");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update your email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Label htmlFor="newEmail">New email (currently {currentEmail})</Label>
        <Input
          id="newEmail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
      </div>
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? "Sending…" : "Send confirmation"}
      </Button>
    </form>
  );
}

function BillingHistory() {
  const { data, isLoading, error } = useQuery<BillingEntry[]>({
    queryKey: ["billing-history"],
    queryFn: listMyBillingHistory,
  });

  if (isLoading) return <div className="h-16 animate-pulse rounded-xl bg-muted" />;
  if (error)
    return (
      <p className="text-xs text-muted-foreground">Billing history is unavailable right now.</p>
    );
  if (!data || data.length === 0)
    return <p className="text-xs text-muted-foreground">No payments on this account yet.</p>;

  return (
    <ul className="space-y-2">
      {data.map((row, i) => (
        <li
          key={`${row.reference ?? row.kind}-${i}`}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border p-3 text-sm"
        >
          <div className="min-w-0">
            <div className="truncate font-medium">{row.description}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(row.occurred_at).toLocaleDateString()} · {row.status.replace(/_/g, " ")}
            </div>
          </div>
          <div className="text-right font-semibold">
            {row.amount === null ? "—" : `$${Math.abs(row.amount).toFixed(2)}`}
            {row.amount !== null && row.amount < 0 && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">refunded</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function DeleteAccount() {
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

  if (isLoading) return <div className="h-10 animate-pulse rounded-xl bg-muted" />;

  if (blockers.length > 0) {
    return (
      <ul className="space-y-1 text-xs text-muted-foreground">
        {blockers.map((b) => (
          <li key={b}>• {b}</li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Label htmlFor="deleteConfirm">Type DELETE to confirm</Label>
        <Input
          id="deleteConfirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DELETE"
        />
      </div>
      <Button
        variant="destructive"
        size="sm"
        disabled={busy || confirmText !== "DELETE"}
        onClick={submit}
      >
        {busy ? "Deleting…" : "Delete my account"}
      </Button>
    </div>
  );
}

export function AccountSettings({ email }: { email: string }) {
  return (
    <section className="mt-8 rounded-3xl border border-border bg-card p-4 shadow-card md:p-6">
      <h2 className="font-display text-lg font-semibold">Account & billing</h2>
      <div className="mt-4 grid gap-4">
        <Section
          icon={<Receipt className="h-4 w-4" />}
          title="Billing history"
          description="Payments, refunds and Host Pro charges on this account."
        >
          <BillingHistory />
        </Section>
        <Section
          icon={<KeyRound className="h-4 w-4" />}
          title="Password"
          description="Set a new password for signing in."
        >
          <ChangePassword />
        </Section>
        <Section
          icon={<Mail className="h-4 w-4" />}
          title="Email address"
          description="We'll email both addresses to confirm the change."
        >
          <ChangeEmail currentEmail={email} />
        </Section>
        <Section
          icon={<Trash2 className="h-4 w-4 text-destructive" />}
          title="Delete account"
          description="Permanently removes your profile, listings and history. This can't be undone."
        >
          <DeleteAccount />
        </Section>
      </div>
    </section>
  );
}
