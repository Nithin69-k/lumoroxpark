import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SpacePhoto } from "@/components/SpacePhoto";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Shield,
  Users,
  MapPin,
  Calendar,
  AlertTriangle,
  Check,
  X,
  Gavel,
  DollarSign,
  ShieldCheck,
  CheckCircle2,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  History,
  Clock,
  Sparkles,
  Trash2,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LoadingScreen } from "@/components/LoadingScreen";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DISPUTE_STATUS_LABEL,
  adminListDisputes,
  adminStats,
  adminTopDemandAreas,
  isAdmin,
  listDisputeEvents,
  resetDemoData,
  resolveDispute,
  seedDemoData,
  type AdminDispute,
  type DisputeEvent,
  type DisputeStatus,
} from "@/lib/admin";

export const Route = createFileRoute("/_authenticated/admin/")({
  beforeLoad: async ({ context }) => {
    const { user } = context as { user: { id: string } };
    const ok = await isAdmin(user.id).catch(() => false);
    return { isAdmin: ok };
  },
  component: AdminGate,
});

// Guards admin-only routes: checks isAdmin (resolved in beforeLoad) and
// redirects to /forbidden without breaking the rules-of-hooks ordering.
function AdminGate() {
  const navigate = useNavigate();
  const { isAdmin } = Route.useRouteContext();
  useEffect(() => {
    if (!isAdmin) navigate({ to: "/forbidden", replace: true });
  }, [isAdmin, navigate]);
  if (!isAdmin) return <LoadingScreen />;
  return <AdminDashboard />;
}

function AdminDashboard() {
  const { data: stats } = useQuery({ queryKey: ["admin-stats"], queryFn: adminStats });
  const { data: demand, isLoading: demandLoading } = useQuery({
    queryKey: ["admin-top-demand"],
    queryFn: () => adminTopDemandAreas(5),
  });
  const { data: disputes, isLoading } = useQuery({
    queryKey: ["admin-disputes"],
    queryFn: adminListDisputes,
  });

  const { data: pendingListings, isLoading: pendingLoading } = useQuery({
    queryKey: ["admin-pending-listings"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_pending_spaces" as any);
      if (error) throw error;
      return data as Array<{
        id: string;
        title: string;
        description: string;
        address: string;
        price_per_hour: number;
        created_at: string;
        host_id: string;
        host_name: string;
        host_email: string;
      }>;
    },
  });

  const approveListing = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase.rpc("admin_approve_space" as any, {
        p_space_id: id,
        p_approve: approve,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-pending-listings"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.success("Listing moderation completed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const qc = useQueryClient();
  const seed = useMutation({
    mutationFn: seedDemoData,
    onSuccess: (r) => {
      toast.success(`Seeded ${r.spaces} listings, ${r.bookings} bookings, ${r.disputes} disputes`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message || "Failed to seed demo data"),
  });
  const reset = useMutation({
    mutationFn: resetDemoData,
    onSuccess: (r) => {
      toast.success(`Removed ${r.spaces_removed} demo listing${r.spaces_removed === 1 ? "" : "s"}`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message || "Failed to reset demo data"),
  });
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="min-h-full bg-gradient-surface">
      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3 sm:px-5 sm:py-4">
          <Button asChild variant="ghost" size="sm" className="shrink-0 px-2 sm:px-3">
            <Link to="/profile">
              <ArrowLeft className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Profile</span>
            </Link>
          </Button>
          <h1 className="flex min-w-0 items-center gap-2 font-display text-base font-bold sm:text-lg">
            <Shield className="h-5 w-5 shrink-0 text-primary" /> Admin
          </h1>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/support">Support</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/payouts">Payouts</Link>
            </Button>

            <Button size="sm" onClick={() => seed.mutate()} disabled={seed.isPending}>
              <Sparkles className="mr-1 h-4 w-4" />
              {seed.isPending ? "Seeding…" : "Seed demo data"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmReset(true)}
              disabled={reset.isPending}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Reset demo
            </Button>
          </div>
        </div>
      </header>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove demo data?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes every listing tagged <span className="font-mono">[demo]</span> you own,
              along with their bookings and disputes. Real data is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => reset.mutate()}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <main className="mx-auto max-w-6xl px-5 py-6 space-y-8">
        <section className="space-y-4">
          <div>
            <h2 className="font-semibold">Platform overview</h2>
            <p className="text-xs text-muted-foreground">
              Live totals across every host, renter, and booking.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<DollarSign className="h-4 w-4" />}
              label="Total revenue"
              value={formatCurrency(stats?.total_revenue ?? 0)}
              hint={`${stats?.completed_bookings ?? 0} completed stays`}
              tone="accent"
            />
            <StatCard
              icon={<Calendar className="h-4 w-4" />}
              label="Total bookings"
              value={formatNumber(stats?.bookings ?? 0)}
              hint={`${stats?.completed_bookings ?? 0} completed`}
            />
            <StatCard
              icon={<MapPin className="h-4 w-4" />}
              label="Active listings"
              value={formatNumber(stats?.active_spaces ?? 0)}
              hint={`${stats?.spaces ?? 0} total`}
            />
            <StatCard
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Avg trust score"
              value={(stats?.avg_trust_score ?? 0).toFixed(1)}
              hint={`${stats?.users ?? 0} users`}
            />
            <StatCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Open disputes"
              value={formatNumber(stats?.open_disputes ?? 0)}
              tone={stats && stats.open_disputes > 0 ? "warning" : "success"}
            />
            <StatCard
              icon={<Users className="h-4 w-4" />}
              label="Users"
              value={formatNumber(stats?.users ?? 0)}
            />
            <StatCard
              icon={<MapPin className="h-4 w-4" />}
              label="Listings (all)"
              value={formatNumber(stats?.spaces ?? 0)}
            />
            <StatCard
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Completion rate"
              value={completionRate(stats?.completed_bookings ?? 0, stats?.bookings ?? 0)}
            />
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Top demand areas
              </h2>
              <p className="text-xs text-muted-foreground">
                Locations driving the most bookings right now.
              </p>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {demandLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading…</div>
            ) : !demand || demand.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No booking activity yet.</div>
            ) : (
              <ol className="divide-y divide-border">
                {demand.map((area, idx) => {
                  const max = Math.max(...demand.map((a) => a.bookings), 1);
                  const pct = Math.max(6, Math.round((area.bookings / max) * 100));
                  return (
                    <li key={`${area.address}-${idx}`} className="p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {idx + 1}
                            </span>
                            <p className="truncate font-medium" title={area.address}>
                              {area.address}
                            </p>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 pl-8 text-xs text-muted-foreground">
                            <span>{formatNumber(area.bookings)} bookings</span>
                            <span>{formatCurrency(area.revenue)} revenue</span>
                            <span>
                              {formatNumber(area.active_listings)} active listing
                              {area.active_listings === 1 ? "" : "s"}
                            </span>
                          </div>
                          <div className="mt-2 ml-8 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4.5 w-4.5 text-emerald-500" /> Host Listing Verification Requests
          </h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {pendingLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading verification requests…</div>
            ) : !pendingListings || pendingListings.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No pending listing verifications. All clear!</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Space / Location</TableHead>
                    <TableHead>Host Contact</TableHead>
                    <TableHead>Verification ID</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingListings.map((item) => (
                    <PendingListingRow
                      key={item.id}
                      item={item}
                      onResolve={(id, approve) => approveListing.mutate({ id, approve })}
                      isMutating={approveListing.isPending}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-semibold">Disputes</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading…</div>
            ) : !disputes || disputes.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No disputes yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Space</TableHead>
                    <TableHead>Renter</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {disputes.map((d) => (
                    <DisputeRow key={d.id} d={d} />
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
  tone?: "warning" | "success" | "accent";
}) {
  const toneClass =
    tone === "warning"
      ? "border-warning/40 bg-warning/5"
      : tone === "success"
        ? "border-success/40 bg-success/5"
        : tone === "accent"
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-card";
  return (
    <div className={`rounded-2xl border p-5 ${toneClass}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

const numberFmt = new Intl.NumberFormat("en-US");
const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatNumber(n: number): string {
  return numberFmt.format(n);
}

function formatCurrency(n: number): string {
  return currencyFmt.format(n);
}

function completionRate(completed: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((completed / total) * 100)}%`;
}

function statusTone(s: DisputeStatus): string {
  switch (s) {
    case "resolved":
      return "bg-success/10 text-success";
    case "rejected":
      return "bg-muted text-muted-foreground";
    case "under_review":
      return "bg-primary/10 text-primary";
    default:
      return "bg-warning/10 text-warning";
  }
}

function DisputeRow({ d }: { d: AdminDispute }) {
  const qc = useQueryClient();
  const [target, setTarget] = useState<DisputeStatus | null>(null);
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["dispute-events", d.id],
    queryFn: () => listDisputeEvents(d.id),
    enabled: showTimeline,
  });

  const mut = useMutation({
    mutationFn: () => resolveDispute(d.id, target!, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-disputes"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["dispute-events", d.id] });
      toast.success(`Marked ${DISPUTE_STATUS_LABEL[target!].toLowerCase()}`);
      setTarget(null);
      setNotes("");
      setConfirmOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canReview = d.status === "open";
  const canResolve = d.status === "open" || d.status === "under_review";
  const requiresNotes = target === "resolved" || target === "rejected";

  return (
    <>
      <TableRow>
        <TableCell className="text-xs text-muted-foreground align-top">
          <button
            type="button"
            onClick={() => setShowTimeline((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 -ml-1.5 hover:bg-muted"
            aria-expanded={showTimeline}
            aria-label={showTimeline ? "Hide audit timeline" : "Show audit timeline"}
          >
            {showTimeline ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
          </button>
        </TableCell>
        <TableCell>{d.space_title ?? "—"}</TableCell>
        <TableCell>{d.renter_name ?? "—"}</TableCell>
        <TableCell>{d.host_name ?? "—"}</TableCell>
        <TableCell className="max-w-xs truncate" title={d.reason}>
          {d.reason}
        </TableCell>
        <TableCell>
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone(d.status)}`}
          >
            {DISPUTE_STATUS_LABEL[d.status]}
          </span>
        </TableCell>
        <TableCell>
          {canResolve ? (
            <div className="flex flex-wrap gap-1">
              {canReview && (
                <Button size="sm" variant="outline" onClick={() => setTarget("under_review")}>
                  <Gavel className="mr-1 h-3.5 w-3.5" /> Review
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setTarget("resolved");
                  setNotes("");
                }}
              >
                <Check className="mr-1 h-3.5 w-3.5" /> Resolve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setTarget("rejected");
                  setNotes("");
                }}
              >
                <X className="mr-1 h-3.5 w-3.5" /> Reject
              </Button>
            </div>
          ) : d.admin_notes ? (
            <span className="text-xs text-muted-foreground line-clamp-1" title={d.admin_notes}>
              {d.admin_notes}
            </span>
          ) : null}
        </TableCell>
      </TableRow>

      {showTimeline && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={7} className="p-0">
            <div className="px-6 py-5">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <History className="h-3.5 w-3.5" /> Audit timeline
              </div>
              {eventsLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : !events || events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events recorded.</p>
              ) : (
                <DisputeTimeline events={events} />
              )}
            </div>
          </TableCell>
        </TableRow>
      )}

      {/* Notes dialog (only for resolve/reject) */}
      <Dialog
        open={target !== null && requiresNotes && !confirmOpen}
        onOpenChange={(o) => {
          if (!o) {
            setTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target === "resolved" ? "Resolve dispute" : "Reject dispute"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Add a note explaining the outcome — the renter and host will both see it.
          </p>
          <Textarea
            placeholder="Admin notes (min 5 characters)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={notes.trim().length < 5}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation prompt */}
      <AlertDialog
        open={target !== null && (requiresNotes ? confirmOpen : true)}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmOpen(false);
            if (!requiresNotes) setTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {target === "under_review" && "Move this dispute to under review?"}
              {target === "resolved" && "Confirm resolution"}
              {target === "rejected" && "Confirm rejection"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {target === "under_review"
                ? "The renter will be notified that an admin is looking into it. You can still resolve or reject afterward."
                : target === "resolved"
                  ? "This closes the dispute in the renter's favour and posts your note to both parties."
                  : "This closes the dispute without action. Both parties will see your note."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => mut.mutate()} disabled={mut.isPending}>
              {mut.isPending ? "Working…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DisputeTimeline({ events }: { events: DisputeEvent[] }) {
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {events.map((e, idx) => {
        const isFirst = idx === 0;
        const label =
          isFirst && !e.from_status
            ? "Submitted"
            : `${e.from_status ? DISPUTE_STATUS_LABEL[e.from_status] : "—"} → ${DISPUTE_STATUS_LABEL[e.to_status]}`;
        return (
          <li key={e.id} className="relative">
            <span
              className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-background ${dotTone(e.to_status)}`}
              aria-hidden
            />
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone(e.to_status)}`}
              >
                {label}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {format(new Date(e.created_at), "MMM d, yyyy · h:mm a")}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {e.actor_name ? `by ${e.actor_name}` : e.actor_id ? "by admin" : "by system"}
            </p>
            {e.note && (
              <p className="mt-2 whitespace-pre-wrap rounded-md border border-border/70 bg-background p-3 text-sm">
                {e.note}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function dotTone(s: DisputeStatus): string {
  switch (s) {
    case "resolved":
      return "bg-success";
    case "rejected":
      return "bg-muted-foreground";
    case "under_review":
      return "bg-primary";
    default:
      return "bg-warning";
  }
}

function PendingListingRow({
  item,
  onResolve,
  isMutating,
}: {
  item: {
    id: string;
    title: string;
    description: string;
    address: string;
    price_per_hour: number;
    created_at: string;
    host_id: string;
    host_name: string;
    host_email: string;
  };
  onResolve: (id: string, approve: boolean) => void;
  isMutating: boolean;
}) {
  const [showDocs, setShowDocs] = useState(false);
  const idType = item.description.match(/Gov ID Type: (.*)/)?.[1] ?? "N/A";
  const idNum = item.description.match(/Gov ID Num: (.*)/)?.[1] ?? "N/A";
  const idPhoto = item.description.match(/Gov ID Doc Path: (.*)/)?.[1];
  const propertyDoc = item.description.match(/Property Doc Path: (.*)/)?.[1];
  const cleanDesc = item.description.split("[VERIFICATION_INFO]")[0].trim();

  return (
    <TableRow>
      <TableCell className="font-semibold text-foreground text-left">
        <div>{item.title}</div>
        <div className="text-[11px] text-muted-foreground font-normal mt-0.5">{item.address}</div>
      </TableCell>
      <TableCell className="text-left text-xs">
        <div>{item.host_name}</div>
        <div className="text-[10px] text-muted-foreground">{item.host_email}</div>
      </TableCell>
      <TableCell className="text-left text-xs">
        <div className="capitalize font-semibold text-foreground">{idType} ID</div>
        <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{idNum}</div>
      </TableCell>
      <TableCell className="text-left">
        <Button size="sm" variant="outline" className="text-xs h-7 px-2.5 rounded-lg" onClick={() => setShowDocs(!showDocs)}>
          View Documents ({[idPhoto, propertyDoc].filter(Boolean).length})
        </Button>

        {showDocs && (
          <Dialog open={showDocs} onOpenChange={setShowDocs}>
            <DialogContent className="max-w-2xl bg-card border border-border">
              <DialogHeader>
                <DialogTitle>Listing Verification Documents</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2 mt-4">
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground block text-left">Government ID Document:</span>
                  <div className="aspect-video rounded-xl overflow-hidden bg-muted border border-border flex items-center justify-center">
                    {idPhoto ? (
                      <SpacePhoto path={idPhoto} alt="Gov ID" className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">No Document Uploaded</span>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground block text-left">Property Ownership Deed / Bill:</span>
                  <div className="aspect-video rounded-xl overflow-hidden bg-muted border border-border flex items-center justify-center">
                    {propertyDoc ? (
                      <SpacePhoto path={propertyDoc} alt="Property Doc" className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">No Document Uploaded</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="bg-muted/30 border border-border/40 rounded-xl p-3.5 mt-4 text-xs text-left leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground block mb-0.5">Listing Description:</span>
                {cleanDesc || "No description provided."}
              </div>
              <DialogFooter className="mt-4">
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setShowDocs(false)}>Close Documents</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive h-7 w-7 p-0 rounded-lg flex items-center justify-center"
            onClick={() => onResolve(item.id, false)}
            disabled={isMutating}
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 w-7 p-0 rounded-lg flex items-center justify-center"
            onClick={() => onResolve(item.id, true)}
            disabled={isMutating}
          >
            <Check className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
