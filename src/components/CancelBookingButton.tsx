import { useEffect, useState } from "react";
import { toast } from "sonner";
import { XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getCancellationQuote, type CancellationQuote } from "@/lib/search";
import { cancelBookingWithRefund } from "@/utils/payments.functions";
import { policyLabel } from "@/lib/spaces";

export function CancelBookingButton({
  bookingId,
  onCancelled,
}: {
  bookingId: string;
  onCancelled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState<CancellationQuote | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    getCancellationQuote(bookingId)
      .then((q) => alive && setQuote(q))
      .catch(() => alive && setQuote(null));
    return () => {
      alive = false;
    };
  }, [open, bookingId]);

  async function confirm() {
    setBusy(true);
    try {
      const res = await cancelBookingWithRefund({
        data: {
          bookingId,
          reason: reason.trim() || undefined,
        },
      });
      if (res.refundAmount > 0) {
        toast.success(
          `Booking cancelled — $${res.refundAmount.toFixed(2)} will be refunded to your UPI`,
        );
      } else {
        toast.success("Booking cancelled");
      }
      setOpen(false);
      onCancelled();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel this booking");
    } finally {
      setBusy(false);
    }
  }

  const p = policyLabel(quote?.policy);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
          <XCircle className="mr-1 h-3.5 w-3.5" /> Cancel booking
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                This host uses the <span className="font-medium text-foreground">{p.label}</span>{" "}
                policy — {p.blurb.toLowerCase()}
              </p>
              {quote && (
                <p>
                  {quote.refundable ? (
                    <span className="font-medium text-success">
                      You'll be refunded ${quote.refund_amount.toFixed(2)}.
                    </span>
                  ) : (
                    <span className="font-medium text-warning">
                      The {quote.cutoff_hours}h cutoff has passed, so this cancellation is
                      non-refundable.
                    </span>
                  )}
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          rows={2}
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep booking</AlertDialogCancel>
          <AlertDialogAction onClick={confirm} disabled={busy}>
            {busy ? "Cancelling…" : "Cancel booking"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
