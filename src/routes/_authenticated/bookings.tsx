import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { expireStaleHolds } from "@/utils/account.functions";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  CheckCircle2,
  Clock,
  LogOut,
  Star,
  AlertTriangle,
  MessageSquare,
  Gavel,
  XCircle,
} from "lucide-react";
import { z } from "zod";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
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
import { QrCodeImage } from "@/components/QrCodeImage";
import { PayBookingButton } from "@/components/PayBookingButton";
import { CancelBookingButton } from "@/components/CancelBookingButton";
import { PolicyBadge } from "@/components/PolicyBadge";
import { listMyBookings, type MyBooking } from "@/lib/search";
import { checkoutBooking, submitReview, hasReviewedBooking } from "@/lib/lifecycle";
import { AppMenu } from "@/components/AppMenu";
import { Price } from "@/components/Price";
import {
  raiseDispute,
  listMyDisputesForBooking,
  DISPUTE_STATUS_LABEL,
  type MyDispute,
  type DisputeStatus,
} from "@/lib/admin";

const searchSchema = z.object({ new: z.string().optional() });

export const Route = createFileRoute("/_authenticated/bookings")({
  validateSearch: (s) => searchSchema.parse(s),
  component: BookingsPage,
});

function BookingsPage() {
  const releaseHolds = useServerFn(expireStaleHolds);
  const search = Route.useSearch();
  const [items, setItems] = useState<MyBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});

  async function refresh() {
    try {
      const rows = await listMyBookings();
      setItems(rows);
      const completed = rows.filter((r) => r.status === "completed");
      const flags = await Promise.all(completed.map((r) => hasReviewedBooking(r.id)));
      const map: Record<string, boolean> = {};
      completed.forEach((r, i) => (map[r.id] = flags[i]));
      setReviewed(map);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load bookings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    // Free up any parking slots whose checkout hold lapsed, then refresh the
    // list. Deferred until the page has fully loaded: if the async chain
    // resolves while React is still hydrating, the state updates land before
    // the components have mounted (React dev warning). After window "load"
    // hydration is always complete.
    const run = () => {
      if (!alive) return;
      releaseHolds({ data: undefined })
        .catch(() => undefined)
        .finally(() => alive && refresh());
    };
    if (document.readyState === "complete") run();
    else window.addEventListener("load", run, { once: true });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-full bg-gradient-surface">
      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto grid max-w-4xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <Button asChild variant="ghost" size="sm" className="shrink-0 px-2 sm:px-3">
              <Link to="/profile">
                <ArrowLeft className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Profile</span>
              </Link>
            </Button>
            <h1 className="truncate font-display text-base font-bold sm:text-lg">My bookings</h1>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button asChild size="sm" className="shrink-0">
              <Link to="/browse">Find a spot</Link>
            </Button>
            <AppMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-6">
        {search.new && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <div>
              <div className="font-medium">Reservation created</div>
              <div className="text-muted-foreground">
                Show the QR code on arrival — your host scans it to check you in.
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <Calendar className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 font-semibold">No bookings yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reserve your first parking spot to see it here.
            </p>
            <Button asChild className="mt-4">
              <Link to="/browse">Browse spots</Link>
            </Button>
          </div>
        ) : (
          <ul className="space-y-4">
            {items.map((b) => (
              <BookingCard
                key={b.id}
                b={b}
                alreadyReviewed={!!reviewed[b.id]}
                onChanged={refresh}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function BookingCard({
  b,
  alreadyReviewed,
  onChanged,
}: {
  b: MyBooking;
  alreadyReviewed: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleCheckout() {
    setBusy(true);
    try {
      await checkoutBooking(b.id);
      toast.success("Checked out");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/space/$id"
            params={{ id: b.space_id }}
            className="text-lg font-semibold hover:underline"
          >
            {b.space_title}
          </Link>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {b.space_address}
          </div>
          <div className="mt-2 flex items-center gap-1 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            {fmt(b.start_time)} → {fmt(b.end_time)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">
            <Price usd={b.total_price} showInr={false} />
          </div>
          <StatusBadge status={b.status} payment={b.payment_status} />
          <div className="mt-2">
            <PolicyBadge policy={b.cancellation_policy} />
          </div>
        </div>
      </div>

      {b.payment_status !== "paid" && (b.status === "pending" || b.status === "confirmed") && (
        <PayBookingButton bookingId={b.id} />
      )}

      {b.status === "pending" && b.payment_status !== "paid"
        ? null
        : (b.status === "pending" || b.status === "confirmed") &&
          b.qr_checkin_code && (
            <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:gap-4">
              <QrCodeImage value={b.qr_checkin_code} size={140} />
              <div className="text-center sm:text-left">
                <div className="text-sm font-medium">Show this at arrival</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">
                  {b.qr_checkin_code}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Your host will scan or type this code to check you in.
                </p>
              </div>
            </div>
          )}

      {b.status === "active" && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-success/30 bg-success/5 p-3">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span>Checked in — enjoy your stay</span>
          </div>
          <Button size="sm" variant="outline" onClick={handleCheckout} disabled={busy}>
            <LogOut className="mr-1 h-4 w-4" /> {busy ? "…" : "Check out"}
          </Button>
        </div>
      )}

      {b.status === "completed" && !alreadyReviewed && (
        <ReviewForm bookingId={b.id} onSubmitted={onChanged} />
      )}
      {b.status === "completed" && alreadyReviewed && (
        <div className="mt-3 text-xs text-muted-foreground">Thanks for reviewing this stay.</div>
      )}

      <DisputeTracker bookingId={b.id} />

      <div className="mt-3 flex justify-end gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/messages/$bookingId" params={{ bookingId: b.id }}>
            <MessageSquare className="mr-1 h-4 w-4" /> Message
          </Link>
        </Button>
        {(b.status === "pending" || b.status === "confirmed") && (
          <CancelBookingButton bookingId={b.id} onCancelled={onChanged} />
        )}
        <ReportDialog bookingId={b.id} />
      </div>
    </li>
  );
}

const STEPS: DisputeStatus[] = ["open", "under_review", "resolved"];

function DisputeTracker({ bookingId }: { bookingId: string }) {
  const [disputes, setDisputes] = useState<MyDispute[] | null>(null);

  useEffect(() => {
    let alive = true;
    listMyDisputesForBooking(bookingId)
      .then((r) => alive && setDisputes(r))
      .catch(() => alive && setDisputes([]));
    return () => {
      alive = false;
    };
  }, [bookingId]);

  if (!disputes || disputes.length === 0) return null;
  const d = disputes[0];
  const rejected = d.status === "rejected";
  const currentIdx = rejected ? -1 : STEPS.indexOf(d.status);

  return (
    <div
      className={`mt-4 rounded-xl border p-4 ${rejected ? "border-muted bg-muted/20" : "border-warning/30 bg-warning/5"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {rejected ? (
            <XCircle className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Gavel className="h-4 w-4 text-warning" />
          )}
          <span>Dispute · {DISPUTE_STATUS_LABEL[d.status]}</span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {formatDistanceToNow(new Date(d.updated_at ?? d.created_at), { addSuffix: true })}
        </span>
      </div>

      {!rejected ? (
        <ol className="mt-3 flex items-center gap-2">
          {STEPS.map((step, i) => {
            const done = i <= currentIdx;
            const active = i === currentIdx;
            const label =
              step === "open" ? "Submitted" : step === "under_review" ? "Under review" : "Resolved";
            return (
              <li key={step} className="flex flex-1 items-center gap-2">
                <div className="flex flex-col items-center">
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-semibold ${
                      done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    } ${active ? "ring-2 ring-primary/40" : ""}`}
                  >
                    {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span
                    className={`mt-1 text-[10px] ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}
                  >
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`h-0.5 flex-1 ${i < currentIdx ? "bg-primary" : "bg-border"}`} />
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          An admin reviewed this report and chose not to take further action.
        </p>
      )}

      <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">You reported:</span> {d.reason}
      </p>
      {d.admin_notes && (
        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Admin note:</span> {d.admin_notes}
        </p>
      )}
    </div>
  );
}

function ReportDialog({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await raiseDispute(bookingId, reason.trim());
      toast.success("Report submitted — you'll see updates on this booking");
      setOpen(false);
      setConfirmOpen(false);
      setReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open && !confirmOpen} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
            <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Report an issue
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report an issue with this booking</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Give us the facts — the other party and our admins will read this.
          </p>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What went wrong? (spot unavailable, damage, no-show, etc.)"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={reason.trim().length < 5}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit this report?</AlertDialogTitle>
            <AlertDialogDescription>
              Your report will be sent to LumoroX admins and the other party. You can't edit it
              after submitting — please make sure your description is accurate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={submit} disabled={busy}>
              {busy ? "Sending…" : "Submit report"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ReviewForm({ bookingId, onSubmitted }: { bookingId: string; onSubmitted: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setBusy(true);
    try {
      await submitReview(bookingId, rating, comment.trim());
      toast.success("Review submitted");
      onSubmitted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit review");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
      <div className="text-sm font-medium">Rate your stay</div>
      <div className="mt-2 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
            aria-pressed={rating === n}
          >
            <Star
              className={`h-6 w-6 ${n <= rating ? "fill-warning text-warning" : "text-muted-foreground"}`}
            />
          </button>
        ))}
      </div>
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="How was the spot? (optional)"
        rows={2}
        className="mt-3"
      />
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={handleSubmit} disabled={busy}>
          {busy ? "Submitting…" : "Submit review"}
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ status, payment }: { status: string; payment: string }) {
  const label =
    status === "active"
      ? "Active"
      : status === "completed"
        ? "Completed"
        : status === "cancelled"
          ? payment === "refunded"
            ? "Cancelled · refunded"
            : payment === "refund_pending"
              ? "Cancelled · refund pending"
              : "Cancelled"
          : payment === "pending"
            ? "Reserved"
            : status;
  const tone =
    status === "active"
      ? "bg-success/10 text-success"
      : status === "completed"
        ? "bg-muted text-muted-foreground"
        : status === "cancelled"
          ? "bg-destructive/10 text-destructive"
          : "bg-warning/10 text-warning";
  return (
    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {label}
    </span>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
