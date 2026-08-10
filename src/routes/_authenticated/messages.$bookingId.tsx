import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { listMessages, sendMessage, type Message } from "@/lib/inbox";

export const Route = createFileRoute("/_authenticated/messages/$bookingId")({
  component: ThreadPage,
});

function ThreadPage() {
  const { bookingId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const [items, setItems] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await listMessages(bookingId);
      setItems(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load messages");
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    refresh();
  }, [bookingId, refresh]);

  useEffect(() => {
    const ch = supabase
      .channel(`msg:${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload) => setItems((prev) => [...prev, payload.new as Message]),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [bookingId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      await sendMessage(bookingId, body);
      setBody("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-surface">
      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-5 py-4">
          <Button asChild variant="ghost" size="sm">
            <Link to="/messages">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Threads
            </Link>
          </Button>
          <h1 className="font-display text-lg font-bold">Conversation</h1>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-6">
        <div className="flex-1 space-y-3 overflow-y-auto pb-4">
          {loading ? (
            <div className="animate-pulse space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 w-2/3 rounded-2xl bg-muted" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="pt-10 text-center text-sm text-muted-foreground">
              No messages yet. Say hello.
            </p>
          ) : (
            items.map((m) => {
              const mine = m.sender_id === user.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                      mine ? "bg-primary text-primary-foreground" : "border border-border bg-card"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <div
                      className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                    >
                      {new Date(m.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={handleSend}
          className="sticky bottom-4 flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-card"
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(e as unknown as React.FormEvent);
              }
            }}
            placeholder="Write a message…"
            rows={1}
            className="min-h-[40px] resize-none border-0 focus-visible:ring-0"
          />
          <Button type="submit" size="icon" disabled={sending || !body.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </main>
    </div>
  );
}
