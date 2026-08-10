import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, QrCode } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QrCodeImage } from "@/components/QrCodeImage";
import { UPI_ID, UPI_PAYEE_NAME, buildUpiUri, isUpiConfigured } from "@/lib/upi";

/**
 * Business UPI payment panel: shows the payee's QR code and UPI ID for the
 * exact amount, then takes the payer's UPI transaction reference to confirm.
 */
export function UpiPaymentPanel({
  amount,
  note,
  confirmLabel = "Confirm payment",
  onConfirm,
}: {
  amount: number;
  note: string;
  confirmLabel?: string;
  onConfirm: (transactionRef: string) => Promise<void>;
}) {
  const [ref, setRef] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (!isUpiConfigured()) {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
        UPI payments are not configured yet. Please add a business UPI ID.
      </div>
    );
  }

  const uri = buildUpiUri({ amount, note });

  async function copyUpiId() {
    try {
      await navigator.clipboard.writeText(UPI_ID!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy the UPI ID");
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm(ref);
      setRef("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not confirm the payment");
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="shrink-0 rounded-xl border border-border bg-background p-2">
          <QrCodeImage value={uri} size={150} alt={`UPI payment QR for ${UPI_PAYEE_NAME}`} />
        </div>
        <div className="min-w-0 space-y-2 text-sm">
          <div className="font-medium text-foreground">Pay to {UPI_PAYEE_NAME}</div>
          <div className="flex items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 text-xs">{UPI_ID}</code>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={copyUpiId}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            Scan the QR or send the amount to the UPI ID above from any UPI app. Your payment
            confirmation shows a transaction reference (UTR).
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
        <div className="text-sm">
          <div className="font-medium">Amount to pay</div>
          <div className="text-xl font-bold text-foreground">{amount.toFixed(2)}</div>
        </div>
        <div className="text-xs text-muted-foreground">Reference: {note}</div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="upi-ref">
          UPI transaction reference (from your payment confirmation)
        </label>
        <div className="flex gap-2">
          <Input
            id="upi-ref"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="e.g. 414829301291"
            autoComplete="off"
          />
          <Button onClick={confirm} disabled={busy || !ref.trim()}>
            <QrCode className="mr-1 h-4 w-4" />
            {busy ? "Confirming…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
