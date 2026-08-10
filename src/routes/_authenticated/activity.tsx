import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Activity as ActivityIcon,
  Calendar,
  Star,
  AlertTriangle,
  CheckCircle2,
  LogIn,
  LogOut,
  XCircle,
  Gavel,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import type { ComponentType } from "react";

import { Button } from "@/components/ui/button";
import { listMyActivity, humanAction, type ActivityRow } from "@/lib/admin";

export const Route = createFileRoute("/_authenticated/activity")({
  component: ActivityFeed,
});

type Tone = "primary" | "success" | "warning" | "destructive" | "muted";

function iconFor(action: string): { Icon: ComponentType<{ className?: string }>; tone: Tone } {
  if (action === "booking_created" || action === "booking_received")
    return { Icon: Calendar, tone: "primary" };
  if (action === "booking_confirmed") return { Icon: CheckCircle2, tone: "success" };
  if (action === "booking_active") return { Icon: LogIn, tone: "success" };
  if (action === "booking_completed") return { Icon: LogOut, tone: "muted" };
  if (action === "booking_cancelled") return { Icon: XCircle, tone: "destructive" };
  if (action.startsWith("review")) return { Icon: Star, tone: "warning" };
  if (action === "dispute_resolved") return { Icon: CheckCircle2, tone: "success" };
  if (action === "dispute_rejected") return { Icon: XCircle, tone: "muted" };
  if (action.startsWith("dispute")) return { Icon: Gavel, tone: "warning" };
  return { Icon: AlertTriangle, tone: "muted" };
}

const toneClass: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary ring-primary/30",
  success: "bg-success/10 text-success ring-success/30",
  warning: "bg-warning/10 text-warning ring-warning/30",
  destructive: "bg-destructive/10 text-destructive ring-destructive/30",
  muted: "bg-muted text-muted-foreground ring-border",
};

function summarizeMeta(row: ActivityRow): string | null {
  const m = row.metadata ?? {};
  const bits: string[] = [];
  if (typeof m.rating === "number") bits.push(`${m.rating}★`);
  if (typeof m.space_title === "string") bits.push(m.space_title);
  if (typeof m.reason === "string") bits.push(`“${String(m.reason).slice(0, 80)}”`);
  if (typeof m.notes === "string" && m.notes) bits.push(`Note: ${String(m.notes).slice(0, 80)}`);
  return bits.length ? bits.join(" · ") : null;
}

function groupByDay(rows: ActivityRow[]): Array<{ day: string; items: ActivityRow[] }> {
  const map = new Map<string, ActivityRow[]>();
  for (const r of rows) {
    const key = format(new Date(r.created_at), "yyyy-MM-dd");
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }
  return Array.from(map.entries()).map(([day, items]) => ({ day, items }));
}

function dayLabel(day: string): string {
  const d = new Date(day + "T00:00:00");
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (format(today, "yyyy-MM-dd") === day) return "Today";
  if (format(yest, "yyyy-MM-dd") === day) return "Yesterday";
  return format(d, "EEEE, MMM d");
}

function ActivityFeed() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-activity"],
    queryFn: () => listMyActivity(100),
  });

  const groups = data ? groupByDay(data) : [];

  return (
    <div className="min-h-full bg-gradient-surface">
      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-5 py-4">
          <Button asChild variant="ghost" size="sm">
            <Link to="/profile">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Profile
            </Link>
          </Button>
          <h1 className="font-display text-lg font-bold">Activity</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-6">
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-muted" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <ActivityIcon className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 font-semibold">No activity yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your bookings, reviews, and updates will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map(({ day, items }) => (
              <section key={day}>
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {dayLabel(day)}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <ol className="relative space-y-3 border-l border-border pl-6">
                  {items.map((row) => {
                    const { Icon, tone } = iconFor(row.action);
                    const summary = summarizeMeta(row);
                    return (
                      <li key={row.id} className="relative">
                        <span
                          className={`absolute -left-[31px] top-1.5 grid h-6 w-6 place-items-center rounded-full ring-2 ${toneClass[tone]}`}
                        >
                          <Icon className="h-3 w-3" />
                        </span>
                        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-sm font-medium">{humanAction(row.action)}</span>
                            <span className="whitespace-nowrap text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          {summary && (
                            <p className="mt-1 text-xs text-muted-foreground">{summary}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
