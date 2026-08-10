import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ScanLine, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkinBooking } from "@/lib/lifecycle";

export const Route = createFileRoute("/_authenticated/host/scan")({
  component: ScanPage,
});

function ScanPage() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<{ space_title: string; renter_name: string } | null>(null);

  async function handleCheckIn() {
    if (!code.trim()) return;
    setBusy(true);
    setOk(null);
    try {
      const r = await checkinBooking(code.trim());
      setOk({ space_title: r.space_title, renter_name: r.renter_name });
      toast.success(`${r.renter_name} checked in`);
      setCode("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-gradient-surface">
      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-4">
          <Button asChild variant="ghost" size="sm">
            <Link to="/host">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Host dashboard
            </Link>
          </Button>
          <h1 className="font-display text-lg font-bold">Check-in</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-10">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-brand">
            <ScanLine className="h-8 w-8 text-primary-foreground" />
          </div>
          <h2 className="mt-4 text-center text-xl font-semibold">Enter the renter's code</h2>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            Ask the renter to open their booking and read out the 16-character check-in code (or
            scan it later — camera scan coming soon).
          </p>

          <div className="mt-6 space-y-3">
            <div>
              <Label htmlFor="code">Check-in code</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toLowerCase())}
                placeholder="e.g. 4a7f92c1e30bb85d"
                autoComplete="off"
                className="font-mono"
              />
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={handleCheckIn}
              disabled={busy || !code.trim()}
            >
              {busy ? "Checking in…" : "Check in"}
            </Button>
          </div>

          {ok && (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 p-3 text-sm">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
              <div>
                <div className="font-medium">Checked in</div>
                <div className="text-muted-foreground">
                  {ok.renter_name} · {ok.space_title}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
