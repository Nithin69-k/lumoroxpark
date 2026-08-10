import { policyLabel } from "@/lib/spaces";
import { ShieldCheck } from "lucide-react";

/** Shows the host's cancellation policy tier and its refund cutoff. */
export function PolicyBadge({
  policy,
  className = "",
}: {
  policy: string | null | undefined;
  className?: string;
}) {
  const p = policyLabel(policy);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground ${className}`}
      title={p.blurb}
    >
      <ShieldCheck className="h-3 w-3" />
      {p.label} cancellation · {p.hours}h
    </span>
  );
}
