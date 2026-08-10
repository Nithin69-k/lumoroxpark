import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, LifeBuoy, Mail } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isAdmin } from "@/lib/admin";
import { categoryLabel, listMySupportTickets, updateTicketStatus } from "@/lib/support";
import { LoadingScreen } from "@/components/LoadingScreen";

export const Route = createFileRoute("/_authenticated/admin/support")({
  beforeLoad: async ({ context }) => {
    const { user } = context as { user: { id: string } };
    const ok = await isAdmin(user.id).catch(() => false);
    return { isAdmin: ok };
  },
  component: AdminGate,
});

const STATUSES = ["open", "in_progress", "resolved", "closed"];

function AdminGate() {
  const navigate = useNavigate();
  const { isAdmin } = Route.useRouteContext();
  useEffect(() => {
    if (!isAdmin) navigate({ to: "/forbidden", replace: true });
  }, [isAdmin, navigate]);
  if (!isAdmin) return <LoadingScreen />;
  return <AdminSupport />;
}

function AdminSupport() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-support-tickets"],
    queryFn: listMySupportTickets,
  });
  const [notes, setNotes] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: string; note?: string }) =>
      updateTicketStatus(id, status, note),
    onSuccess: () => {
      toast.success("Ticket updated");
      qc.invalidateQueries({ queryKey: ["admin-support-tickets"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not update ticket"),
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
          <h1 className="flex items-center gap-2 font-display text-lg font-bold">
            <LifeBuoy className="h-5 w-5 text-primary" /> Support tickets
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-5 py-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading tickets…</p>
        ) : (data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No support tickets yet.</p>
        ) : (
          data!.map((t) => (
            <article key={t.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{t.subject}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.name} ·{" "}
                    <a
                      href={`mailto:${t.email}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Mail className="h-3 w-3" />
                      {t.email}
                    </a>{" "}
                    · {categoryLabel(t.category)} ·{" "}
                    {format(new Date(t.created_at), "d MMM yyyy, HH:mm")}
                  </p>
                </div>
                <Select
                  value={t.status}
                  onValueChange={(v) => save.mutate({ id: t.id, status: v })}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">
                        {s.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{t.message}</p>

              <div className="mt-4 space-y-2">
                <Textarea
                  rows={3}
                  placeholder="Reply / internal note shown to the user"
                  value={notes[t.id] ?? t.admin_notes ?? ""}
                  onChange={(e) => setNotes({ ...notes, [t.id]: e.target.value })}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate({
                      id: t.id,
                      status: t.status,
                      note: notes[t.id] ?? t.admin_notes ?? "",
                    })
                  }
                >
                  Save reply
                </Button>
              </div>
            </article>
          ))
        )}
      </main>
    </div>
  );
}
