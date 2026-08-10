import { useEffect, useState } from "react";
import { DollarSign, IndianRupee } from "lucide-react";

import {
  getCurrencyMode,
  setCurrencyMode,
  subscribeCurrencyMode,
  formatInr,
  formatUsd,
  type CurrencyMode,
} from "@/lib/currency";

function useCurrencyMode(): CurrencyMode {
  const [mode, setMode] = useState<CurrencyMode>(() => getCurrencyMode());
  useEffect(() => subscribeCurrencyMode(() => setMode(getCurrencyMode())), []);
  return mode;
}

/**
 * Renders a USD amount in the user's preferred currency. In "both" mode the
 * INR equivalent is shown alongside, so renters and hosts see prices in the
 * currency they actually think in.
 */
export function Price({
  usd,
  className,
  showInr = true,
}: {
  usd: number;
  className?: string;
  showInr?: boolean;
}) {
  const mode = useCurrencyMode();
  if (mode === "inr") return <span className={className}>{formatInr(usd)}</span>;
  if (mode === "usd" || !showInr) return <span className={className}>{formatUsd(usd)}</span>;
  return (
    <span className={className}>
      {formatUsd(usd)}{" "}
      <span className="text-[0.85em] font-normal text-muted-foreground">({formatInr(usd)})</span>
    </span>
  );
}

const MODES: Array<{ value: CurrencyMode; label: string }> = [
  { value: "usd", label: "$ USD" },
  { value: "inr", label: "₹ INR" },
  { value: "both", label: "$ + ₹" },
];

/** Compact currency selector used next to search filters and booking cards. */
export function CurrencyToggle({ className }: { className?: string }) {
  const mode = useCurrencyMode();
  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5 ${className ?? ""}`}
      aria-label="Currency"
    >
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          onClick={() => setCurrencyMode(m.value)}
          aria-pressed={mode === m.value}
          title={m.label}
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors ${
            mode === m.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {m.value === "inr" ? (
            <IndianRupee className="h-3 w-3" />
          ) : m.value === "usd" ? (
            <DollarSign className="h-3 w-3" />
          ) : (
            <span>
              $<span className="mx-0.5">+</span>₹
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
