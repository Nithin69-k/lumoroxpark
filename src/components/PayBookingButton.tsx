import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UpiPaymentPanel } from "@/components/UpiPaymentPanel";
import { useServerFn } from "@tanstack/react-start";
import { confirmUpiBookingPayment } from "@/utils/payments.functions";
import { getBookingCharge, type BookingCharge } from "@/lib/payments";

export function PayBookingButton({ bookingId }: { bookingId: string }) {
  const [charge, setCharge] = useState<BookingCharge | null>(null);
  const [open, setOpen] = useState(false);
  const runConfirm = useServerFn(confirmUpiBookingPayment);

  useEffect(() => {
    let alive = true;
    getBookingCharge(bookingId)
      .then((c) => alive && setCharge(c))
      .catch(() => alive && setCharge(null));
    return () => {
      alive = false;
    };
  }, [bookingId]);

  async function confirm(ref: string) {
    const outcome = await runConfirm({
      data: { bookingId, transactionRef: ref },
    });
    if (outcome.conflict) {
      toast.warning(
        "This slot was taken while you were paying — contact support for a refund via UPI",
      );
      return;
    }
    toast.success("Payment confirmed — booking is locked in");
    window.location.reload();
  }

  return (
    <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-medium">Payment needed to confirm this reservation</div>
          {charge && (
            <div className="mt-1 text-xs text-muted-foreground">
              Parking ${charge.base_amount.toFixed(2)} + platform fee $
              {charge.platform_fee.toFixed(2)} + ${charge.reservation_fee.toFixed(2)} reservation ={" "}
              <span className="font-semibold text-foreground">${charge.total.toFixed(2)}</span>
            </div>
          )}
        </div>
        <Button size="sm" onClick={() => setOpen((o) => !o)} disabled={!charge}>
          {open ? (
            <>
              <ChevronUp className="mr-1 h-4 w-4" /> Close
            </>
          ) : (
            <>
              <ChevronDown className="mr-1 h-4 w-4" /> Pay by UPI
            </>
          )}
        </Button>
      </div>
      {open && charge && (
        <div className="mt-4 rounded-xl border border-border bg-background p-4">
          <UpiPaymentPanel
            amount={charge.total}
            note={`Parking booking ${bookingId.slice(0, 8)}`}
            onConfirm={confirm}
          />
        </div>
      )}
    </div>
  );
}
