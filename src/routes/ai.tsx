import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Sparkles, MapPin, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@tanstack/react-start";
import { askLumoroAi, type AiChatMessage } from "@/utils/ai.functions";
import { absoluteUrl } from "@/lib/site";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "Lumoro AI | LUMORO X PARK" },
      {
        name: "description",
        content:
          "Ask Lumoro AI to find parking near you, understand policies, or get help with LumoroX Park.",
      },
      { property: "og:title", content: "Lumoro AI | LUMORO X PARK" },
      { property: "og:url", content: absoluteUrl("/ai") },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/ai") }],
  }),
  component: AiPage,
});

const SUGGESTIONS = [
  "Find parking near me tomorrow 3–6pm",
  "Where can I park with EV charging this weekend?",
  "How do I pay for a booking?",
  "What is Host Pro and what does it cost?",
];

type ResultCard = {
  id: string;
  title: string;
  address: string;
  pricePerHour: number;
  distanceKm: number;
  covered: boolean;
  gated: boolean;
  ev: boolean;
};

type AssistantMsg = {
  role: "user" | "assistant";
  content: string;
  results?: ResultCard[];
  searchedFor?: string | null;
};

function AiPage() {
  const [messages, setMessages] = useState<AssistantMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const runAsk = useServerFn(askLumoroAi);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    setBusy(true);
    try {
      const history: AiChatMessage[] = messages
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await runAsk({
        data: { messages: [...history, { role: "user", content: trimmed }] },
      });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: res.reply,
          searchedFor: res.searchedFor,
          results: res.results.map((s) => ({
            id: s.id,
            title: s.title,
            address: s.address,
            pricePerHour: Number(s.price_per_hour),
            distanceKm: Number(s.distance_km ?? 0),
            covered: s.is_covered,
            gated: s.is_gated,
            ev: s.has_ev_charging,
          })),
        },
      ]);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Lumoro AI is unavailable right now";
      setMessages((m) => [...m, { role: "assistant", content: message }]);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-gradient-surface">
      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-5 py-4">
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Home
            </Link>
          </Button>
          <h1 className="font-display text-lg font-bold">Lumoro AI</h1>
          <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
            <Sparkles className="h-3 w-3" /> Assistant
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-5 py-6">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold">How can I help you park?</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Ask for parking in plain language — "somewhere near the airport on Friday" — or get
                answers about payments, policies and Host Pro.
              </p>
            </div>
            <div className="grid w-full max-w-md gap-2">
              {SUGGESTIONS.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  className="justify-start whitespace-normal text-left text-sm"
                  onClick={() => send(s)}
                >
                  <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex flex-col gap-3">
                  <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3 text-sm leading-relaxed">
                    {m.content}
                  </div>
                  {m.results && m.results.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {m.results.map((s) => (
                        <Link
                          key={s.id}
                          to="/space/$id"
                          params={{ id: s.id }}
                          className="rounded-xl border border-border bg-card p-3 text-sm transition-colors hover:border-primary/50"
                        >
                          <div className="font-medium text-foreground">{s.title}</div>
                          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{s.address}</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs">
                            <span className="font-semibold text-primary">
                              ${s.pricePerHour.toFixed(2)}/hr
                            </span>
                            <span className="text-muted-foreground">
                              {s.distanceKm.toFixed(1)} km
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {s.covered && <Tag>Covered</Tag>}
                            {s.gated && <Tag>Gated</Tag>}
                            {s.ev && <Tag>EV</Tag>}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
          </div>
        )}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            Lumoro AI is thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <div className="border-t border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-2 px-5 py-4">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Try: parking near Indiranagar tomorrow 4pm for 2 hours"
            disabled={busy}
          />
          <Button onClick={() => send(input)} disabled={busy || !input.trim()} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Tag({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
      {children}
    </span>
  );
}
