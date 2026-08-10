/**
 * Currency display helpers. Listing prices, booking totals and plan charges
 * are stored in USD; this module converts to INR for display using a fixed
 * configurable rate and lets the user pick how prices are shown.
 */

export const USD_TO_INR = Number(import.meta.env.VITE_USD_TO_INR ?? 86);

export type CurrencyMode = "usd" | "inr" | "both";

const STORAGE_KEY = "lx_currency_mode";

const listeners = new Set<() => void>();

function safeGet(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeSet(value: string) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // storage unavailable — the preference simply won't persist
  }
}

export function getCurrencyMode(): CurrencyMode {
  const stored = safeGet();
  if (stored === "usd" || stored === "inr" || stored === "both") return stored;
  return "both";
}

/** Switches the display currency and notifies every open Price component. */
export function setCurrencyMode(mode: CurrencyMode) {
  safeSet(mode);
  listeners.forEach((l) => l());
}

/** Subscribes the caller to currency preference changes; returns an unsubscribe fn. */
export function subscribeCurrencyMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usdToInr(usd: number): number {
  return usd * USD_TO_INR;
}

/** "$50" for whole numbers, "$50.00" otherwise. */
export function formatUsd(usd: number): string {
  return `$${Number.isInteger(usd) ? usd : usd.toFixed(2)}`;
}

/** "₹4,300" with Indian digit grouping; keeps decimals for small amounts. */
export function formatInr(usd: number): string {
  const inr = usdToInr(usd);
  const maxFrac = inr >= 10000 ? 0 : 2;
  return `₹${inr.toLocaleString("en-IN", { maximumFractionDigits: maxFrac })}`;
}
