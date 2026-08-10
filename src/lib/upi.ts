const upiId = import.meta.env.VITE_UPI_ID as string | undefined;
const upiPayeeName = import.meta.env.VITE_UPI_PAYEE_NAME as string | undefined;

/** Business UPI ID, e.g. `lumoropark@hdfcbank`. */
export const UPI_ID = upiId;
/** Business name shown in the UPI app as the payee. */
export const UPI_PAYEE_NAME = upiPayeeName ?? "LUMORO X PARK";

/** Flat reservation fee charged to the driver on every booking. */
export const RESERVATION_FEE = 1;
/** Platform commission taken from every booking. */
export const PLATFORM_COMMISSION_RATE = 0.1;
/** Minimum available balance before a host can be paid out. */
export const MIN_PAYOUT_AMOUNT = 20;

/** Payment environment used for commission rates and subscription checks. */
export const PAYMENT_ENV = "live" as const;

export function getPaymentEnvironment(): "live" {
  return PAYMENT_ENV;
}

export function isUpiConfigured(): boolean {
  return Boolean(upiId);
}

/** Builds a `upi://` deep link that any UPI app can scan or open. */
export function buildUpiUri(options: { amount: number; note: string }): string {
  if (!upiId) throw new Error("UPI payments are not configured yet");
  const params = new URLSearchParams({
    pa: upiId,
    pn: upiPayeeName ?? UPI_PAYEE_NAME,
    am: options.amount.toFixed(2),
    cu: "INR",
    tn: options.note.slice(0, 98),
  });
  return `upi://pay?${params.toString()}`;
}

/** Normalises and validates a UPI transaction reference (UTR) entered by the payer. */
export function validateUpiReference(reference: string): string {
  const trimmed = reference.trim().toUpperCase();
  if (!/^[A-Za-z0-9]{8,16}$/.test(trimmed)) {
    throw new Error(
      "Enter the UPI transaction reference from your payment confirmation (usually 12 characters)",
    );
  }
  return trimmed;
}
