import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { listMyThreads, type BookingThread } from "@/lib/inbox";

export const Route = createFileRoute("/_authenticated/messages/")({
  component: ThreadsPage,
});

function ThreadsPage() {
  const [items, setItems] = useState<BookingThread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMyThreads()
      .then(setItems)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-full bg-gradient-surface">
      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/profile">
                <ArrowLeft className="mr-1 h-4 w-4" />
                Profile
              </Link>
            </Button>
            <h1 className="font-display text-lg font-bold flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Messages
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8">
        {loading ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-muted" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No conversations yet. Book a spot or wait for a renter to reach out.
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((t) => (
              <li key={t.booking_id}>
                <Link
                  to="/messages/$bookingId"
                  params={{ bookingId: t.booking_id }}
                  className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{t.counterparty_name}</span>
                    {t.unread > 0 && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        {t.unread}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {t.space_title}
                  </div>
                  {t.last_message && (
                    <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">
                      {t.last_message}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
