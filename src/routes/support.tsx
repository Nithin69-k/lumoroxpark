import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Mail, LifeBuoy, Clock, Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_EMAIL,
  categoryLabel,
  listMySupportTickets,
  submitSupportTicket,
} from "@/lib/support";

type SupportSearch = { category?: string };

export const Route = createFileRoute("/support")({
  validateSearch: (search: Record<string, unknown>): SupportSearch => ({
    category: typeof search.category === "string" ? search.category : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Contact Support | LUMORO X PARK" },
      {
        name: "description",
        content:
          "Get help with a booking, listing, payout or refund on LUMORO X PARK. Send a support ticket or email our team directly.",
      },
      { property: "og:title", content: "Contact Support | LUMORO X PARK" },
      {
        property: "og:description",
        content: "Send a support ticket, report a listing, or email the LUMORO X PARK team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  const { category: initialCategory } = Route.useSearch();
  const [signedIn, setSignedIn] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    category: initialCategory ?? "general",
    subject: "",
    message: "",
  });

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      setSignedIn(true);
      setForm((f) => ({
        ...f,
        email: f.email || data.user!.email || "",
        name: f.name || (data.user!.user_metadata?.full_name as string | undefined) || "",
      }));
    });
    return () => {
      active = false;
    };
  }, []);

  const tickets = useQuery({
    queryKey: ["my-support-tickets"],
    queryFn: listMySupportTickets,
    enabled: signedIn,
  });

  const send = useMutation({
    mutationFn: submitSupportTicket,
    onSuccess: () => {
      toast.success("Ticket sent — we'll reply by email within 1–2 business days.");
      setForm((f) => ({ ...f, subject: "", message: "" }));
      tickets.refetch();
    },
    onError: (e: Error) => toast.error(e.message || "Could not send your ticket"),
  });

  const canSubmit =
    form.name.trim() && form.email.trim() && form.subject.trim() && form.message.trim().length > 9;

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-5 sm:py-4">
          <Link
            to="/"
            className="inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />{" "}
            <span className="truncate">Back to LUMORO X PARK</span>
          </Link>
          <Link to="/help" className="shrink-0 text-sm font-medium text-primary hover:underline">
            Help Center
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-12">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-primary/10 p-2 text-primary">
            <LifeBuoy className="h-6 w-6" />
          </span>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Contact support</h1>
        </div>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Tell us what happened and we'll get back to you. For faster help, include the booking
          reference or listing link.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <a className="text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
          </span>
          <span className="inline-flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Mon–Sat, replies within 1–2 business days
          </span>
        </div>

        <form
          className="mt-8 space-y-5 rounded-2xl border border-border bg-card p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) {
              toast.error("Please fill in every field (message at least 10 characters).");
              return;
            }
            send.mutate(form);
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Alex Doe"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">What is this about?</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Choose a topic" />
              </SelectTrigger>
              <SelectContent>
                {SUPPORT_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Host did not release the space"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Details</Label>
            <Textarea
              id="message"
              rows={6}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Include dates, booking reference and anything we should know."
              required
            />
          </div>

          <Button type="submit" disabled={send.isPending}>
            <Send className="mr-2 h-4 w-4" />
            {send.isPending ? "Sending…" : "Send ticket"}
          </Button>
        </form>

        {signedIn && (
          <section className="mt-12">
            <h2 className="text-xl font-semibold tracking-tight">Your tickets</h2>
            {tickets.isLoading ? (
              <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
            ) : (tickets.data?.length ?? 0) === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                You haven't opened any tickets yet.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {tickets.data!.map((t) => (
                  <li key={t.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{t.subject}</p>
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs capitalize text-muted-foreground">
                        {t.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {categoryLabel(t.category)} · {format(new Date(t.created_at), "d MMM yyyy")}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {t.message}
                    </p>
                    {t.admin_notes && (
                      <p className="mt-3 rounded-lg bg-primary/5 p-3 text-sm">
                        <span className="font-medium">Our reply: </span>
                        {t.admin_notes}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
