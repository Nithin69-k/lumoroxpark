import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  Search,
  MapPin,
  CalendarCheck,
  QrCode,
  Wallet,
  ShieldCheck,
  LifeBuoy,
  Mail,
  AlertTriangle,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SUPPORT_EMAIL } from "@/lib/support";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help Center — guides & support | LUMORO X PARK" },
      {
        name: "description",
        content:
          "Step-by-step guides for renting and hosting parking on LUMORO X PARK, answers to common questions, and ways to reach our support team.",
      },
      { property: "og:title", content: "Help Center — guides & support | LUMORO X PARK" },
      {
        property: "og:description",
        content:
          "Guides for drivers and hosts, FAQs on payments and refunds, plus how to contact support.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HelpCenter,
});

const GUIDES = [
  {
    icon: Search,
    title: "Find a parking spot",
    steps: [
      "Open Find a spot and allow location access, or pan the map to the area you need.",
      "Use filters for covered, gated, EV charging or camera-monitored spaces.",
      "Open a listing to see photos, the exact price per hour and the cancellation policy.",
    ],
    to: "/browse" as const,
    cta: "Browse spaces",
  },
  {
    icon: CalendarCheck,
    title: "Book and pay",
    steps: [
      "Pick your start and end time — the total price, service fee and taxes are shown before you pay.",
      "Pay securely through our payment provider. Card details never touch our servers.",
      "Your booking appears instantly under My bookings with a check-in code.",
    ],
    to: "/pricing" as const,
    cta: "See pricing",
  },
  {
    icon: QrCode,
    title: "Check in and out",
    steps: [
      "On arrival, open the booking and show or read out your 16-character check-in code.",
      "The host scans or types the code to confirm you have arrived.",
      "Check out when you leave so the space is released for the next driver.",
    ],
    to: "/bookings" as const,
    cta: "My bookings",
  },
  {
    icon: MapPin,
    title: "List your space",
    steps: [
      "Go to List a space, add a title, photos, address and pin the exact spot on the map.",
      "Set your hourly and daily price, amenities and cancellation policy.",
      "Publish. Your listing appears in search straight away and you can pause it any time.",
    ],
    to: "/host/new" as const,
    cta: "List a space",
  },
  {
    icon: Wallet,
    title: "Get paid as a host",
    steps: [
      "Earnings are added to your wallet after each completed booking.",
      "Funds clear after a 24-hour hold that covers disputes and no-shows.",
      "Request a payout from Earnings & payouts once your available balance is cleared.",
    ],
    to: "/host/earnings" as const,
    cta: "Earnings & payouts",
  },
  {
    icon: ShieldCheck,
    title: "Stay safe & resolve issues",
    steps: [
      "Message the other party in-app so the conversation stays on record.",
      "If something goes wrong, raise a dispute from the booking within 48 hours.",
      "Our team reviews disputes and can issue refunds or hold host payouts.",
    ],
    to: "/support" as const,
    cta: "Contact support",
  },
];

const FAQS = [
  {
    q: "How do I cancel a booking and what will I get back?",
    a: "Open the booking under My bookings and choose Cancel. The refund shown depends on the host's cancellation policy (flexible, moderate or strict) and how close you are to the start time. The exact amount is always displayed before you confirm.",
  },
  {
    q: "When does a refund reach my account?",
    a: "Approved refunds are sent back to the original payment method. Banks typically take 5–10 business days to post them.",
  },
  {
    q: "The host's space was blocked, unsafe or not as described. What now?",
    a: "Message the host first from the booking. If it is not resolved, raise a dispute from the same booking within 48 hours and include photos. Our team reviews it and can refund you and hold the host's payout.",
  },
  {
    q: "How much does LUMORO X PARK charge?",
    a: "Drivers pay the host's listed price plus a small reservation fee. Hosts pay a commission on each completed booking. Host Pro is an optional monthly subscription for unlimited listings and featured placement.",
  },
  {
    q: "When do hosts get paid?",
    a: "Earnings move into your wallet after checkout and clear after a 24-hour hold. Once cleared you can request a payout to your bank account from Earnings & payouts.",
  },
  {
    q: "Do I need permission to list my driveway or parking bay?",
    a: "Yes. You must have the legal right to sublet the space — check your lease, landlord rules, housing society bylaws or local regulations before listing.",
  },
  {
    q: "How do I delete my account or my data?",
    a: `Email ${SUPPORT_EMAIL} from your registered address and we will delete your account and personal data, keeping only records we are legally required to retain.`,
  },
  {
    q: "How do I report a suspicious listing or user?",
    a: "Use the support form and choose “Report a listing or user”. Include the listing link or booking reference. We review every report and can suspend accounts.",
  },
];

function HelpCenter() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const faqs = q
    ? FAQS.filter((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q))
    : FAQS;
  const guides = q
    ? GUIDES.filter(
        (g) =>
          g.title.toLowerCase().includes(q) || g.steps.some((s) => s.toLowerCase().includes(q)),
      )
    : GUIDES;

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-5 sm:py-4">
          <Link
            to="/"
            className="inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />{" "}
            <span className="truncate">Back to LUMORO X PARK</span>
          </Link>
          <Link to="/support" className="shrink-0 text-sm font-medium text-primary hover:underline">
            Contact support
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-primary/10 p-2 text-primary">
            <LifeBuoy className="h-6 w-6" />
          </span>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Help Center</h1>
        </div>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Guides for drivers and hosts, answers to the questions we get most, and a direct line to
          our team when you need a person.
        </p>

        <div className="relative mt-6 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search help articles…"
            className="pl-9"
            aria-label="Search help articles"
          />
        </div>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight">Step-by-step guides</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {guides.map((g) => (
              <article key={g.title} className="rounded-2xl border border-border bg-card p-5">
                <span className="inline-flex rounded-lg bg-primary/10 p-2 text-primary">
                  <g.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-3 font-semibold">{g.title}</h3>
                <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {g.steps.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="font-semibold text-primary">{i + 1}.</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
                <Button asChild size="sm" variant="outline" className="mt-4">
                  <Link to={g.to}>{g.cta}</Link>
                </Button>
              </article>
            ))}
            {guides.length === 0 && (
              <p className="text-sm text-muted-foreground">No guides match “{query}”.</p>
            )}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-xl font-semibold tracking-tight">Frequently asked questions</h2>
          <Accordion type="single" collapsible className="mt-4">
            {faqs.map((f) => (
              <AccordionItem key={f.q} value={f.q}>
                <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          {faqs.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              Nothing matches “{query}”. Try the support form below.
            </p>
          )}
        </section>

        <section className="mt-14 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5">
            <Mail className="h-5 w-5 text-primary" />
            <h3 className="mt-3 font-semibold">Email us</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Write to{" "}
              <a className="text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
                {SUPPORT_EMAIL}
              </a>
              . We reply within 1–2 business days.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <LifeBuoy className="h-5 w-5 text-primary" />
            <h3 className="mt-3 font-semibold">Support ticket</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Send us the details in-app and track the reply against your account.
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link to="/support">Open a ticket</Link>
            </Button>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <AlertTriangle className="h-5 w-5 text-primary" />
            <h3 className="mt-3 font-semibold">Report a problem</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Unsafe space, suspicious listing or a bug? Report it and we will investigate.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link to="/support" search={{ category: "abuse" }}>
                Report
              </Link>
            </Button>
          </div>
        </section>

        <p className="mt-12 text-xs text-muted-foreground">
          Looking for the legal detail? Read our{" "}
          <Link to="/terms" className="text-primary hover:underline">
            Terms of Service
          </Link>
          ,{" "}
          <Link to="/refunds" className="text-primary hover:underline">
            Refund &amp; Cancellation Policy
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
