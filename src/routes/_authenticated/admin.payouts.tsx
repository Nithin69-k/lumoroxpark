import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Banknote } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isAdmin } from "@/lib/admin";
import { adminListPayouts, adminProcessPayout } from "@/lib/earnings";
import { LoadingScreen } from "@/components/LoadingScreen";

export const Route = createFileRoute("/_authenticated/admin/payouts")({
  beforeLoad: async ({ context }) => {
    const { user } = context as { user: { id: string } };
    const ok = await isAdmin(user.id).catch(() => false);
    return { isAdmin: ok };
  },
  head: () => ({
    meta: [
      { title: "Host Payout Queue | LUMORO X PARK Admin" },
      {
        name: "description",
        content:
          "Review, approve and settle host payout requests for the LUMORO X PARK marketplace.",
      },
      { property: "og:title", content: "Host Payout Queue | LUMORO X PARK Admin" },
      { property: "og:description", content: "Approve and settle host payouts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminGate,
});

const money = (n: number) => `$${n.toFixed(2)}`;

function AdminGate() {
  const navigate = useNavigate();
  const { isAdmin } = Route.useRouteContext();
  useEffect(() => {
    if (!isAdmin) navigate({ to: "/forbidden", replace: true });
  }, [isAdmin, navigate]);
  if (!isAdmin) return <LoadingScreen />;
  return <AdminPayouts />;
}

function AdminPayouts() {
  const qc = useQueryClient();
  const { data: payouts, isLoading } = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: adminListPayouts,
  });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "paid" | "reject" }) =>
      adminProcessPayout(id, action),
    onSuccess: () => {
      toast.success("Payout updated");
      qc.invalidateQueries({ queryKey: ["admin-payouts"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not update payout"),
  });

  return (
    <div className="min-h-full bg-gradient-surface">
      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-5 py-4">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Admin
            </Link>
          </Button>
          <h1 className="font-display text-lg font-bold">Payout queue</h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-6">
        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Loading…
          </div>
        ) : !payouts || payouts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <Banknote className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 font-semibold">No payout requests</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Host requests and automatic monthly payouts will appear here.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {payouts.map((p) => (
              <li key={p.id} className="rounded-2xl border border-border bg-card p-5 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">
                      {p.host_name ?? "Host"} · {money(p.amount)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(p.requested_at).toLocaleString()} ·{" "}
                      {p.is_automatic ? "Automatic monthly" : "Manual request"}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {p.account_holder ?? "—"} · {p.bank_name ?? "—"} · {p.bank_code ?? "—"} ·{" "}
                      {p.account_number ?? "—"}
                    </div>
                  </div>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs capitalize">
                    {p.status}
                  </span>
                </div>

                {p.status !== "paid" && p.status !== "rejected" && (
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    {p.status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={act.isPending}
                        onClick={() => act.mutate({ id: p.id, action: "approve" })}
                      >
                        Approve
                      </Button>
                    )}
                    <Button
                      size="sm"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ id: p.id, action: "paid" })}
                    >
                      Mark paid
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ id: p.id, action: "reject" })}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
