import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Truck, CheckCircle, ShieldCheck, DollarSign, MapPin, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { SITE_URL, absoluteUrl } from "@/lib/site";

const canonicalUrl = absoluteUrl("/guides/rv-parking");
const pageTitle = "RV Parking & Storage Guide: Rent Out Your RV Space | LumoroX Park";
const pageDescription =
  "Turn your empty RV pad, driveway, or lot into income. Learn how to list RV parking and storage on LumoroX Park, what renters look for, and how to price your space.";

export const Route = createFileRoute("/guides/rv-parking")({
  head: () => ({
    meta: [
      { title: pageTitle },
      { name: "description", content: pageDescription },
      { property: "og:title", content: pageTitle },
      { property: "og:description", content: pageDescription },
      { property: "og:type", content: "article" },
      { property: "og:url", content: canonicalUrl },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Article",
              headline: "RV Parking & Storage Guide: Rent Out Your RV Space",
              description: pageDescription,
              author: {
                "@type": "Organization",
                name: "LumoroX Park",
                url: SITE_URL,
              },
              publisher: {
                "@type": "Organization",
                name: "LumoroX Park",
                url: SITE_URL,
              },
              mainEntityOfPage: {
                "@type": "WebPage",
                "@id": canonicalUrl,
              },
              datePublished: "2026-07-27",
              dateModified: "2026-07-27",
            },
            {
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "Do I need a permit to rent out RV parking on my property?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "It depends on your city, county, and HOA rules. Many areas allow short-term parking rentals on private residential property, but some require a business license, zoning clearance, or HOA approval. Check local regulations before listing your space.",
                  },
                },
                {
                  "@type": "Question",
                  name: "How much can I earn renting RV storage space?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Monthly RV storage rates typically range from $50 to $300+ depending on location, covered vs. uncovered storage, security features, and electrical hookups. Covered or gated spaces in high-demand areas command the highest premiums.",
                  },
                },
                {
                  "@type": "Question",
                  name: "What size RV space do I need to list?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Measure the usable length, width, and height of your space. Class A motorhomes can be 35–45 feet long, while travel trailers and fifth wheels are often 20–35 feet. Include the turnaround and access path in your listing so renters know their rig will fit.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Can I rent RV parking by the hour instead of monthly?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Yes. LumoroX Park supports hourly, daily, and longer-term bookings. Hourly RV parking works well for day trips, events, or overnight stops, while monthly storage is better for seasonal or long-term vehicle storage.",
                  },
                },
              ],
            },
          ],
        }),
      },
    ],
  }),
  component: RVParkingGuide,
});

function RVParkingGuide() {
  return (
    <div className="min-h-full bg-gradient-surface">
      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5 sm:py-4">
          <Link to="/" className="flex min-w-0 items-center" aria-label="LumoroX Park home">
            <BrandLogo className="h-8 sm:h-10" />
          </Link>
          <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/">Home</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/pricing">Pricing</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth" search={{ mode: "signup" }}>
                <span className="hidden sm:inline">List your RV space</span>
                <span className="sm:hidden">List space</span>
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12 md:py-16">
        <article>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Truck className="h-3.5 w-3.5" />
            Host guide
          </div>

          <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight md:text-5xl">
            Turn your empty RV pad into{" "}
            <span className="bg-gradient-brand bg-clip-text text-transparent">monthly income</span>
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            RV and camper storage is one of the fastest-growing segments in peer-to-peer space
            rentals. Thousands of owners search every month for safe, affordable places to park
            their rigs — and your driveway, side yard, or lot could be the answer.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth" search={{ mode: "signup" }}>
                List your RV space
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/browse">Find RV parking near me</Link>
            </Button>
          </div>

          <section className="mt-14 space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">
              Why RV storage demand is climbing
            </h2>
            <p className="text-muted-foreground">
              Search data shows strong, consistent interest in RV parking and storage:
            </p>
            <ul className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "rv space for rent", value: "2,400", sub: "monthly searches" },
                { label: "rv storage", value: "110,000", sub: "monthly searches" },
                { label: "rv storage near me", value: "60,500", sub: "monthly searches" },
              ].map((stat) => (
                <li
                  key={stat.label}
                  className="rounded-2xl border border-border bg-card p-4 shadow-card"
                >
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {stat.sub}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    &ldquo;{stat.label}&rdquo;
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              Specialized vehicle storage — RVs, campers, boats, and trailers — is also a
              top-performing content category for platforms like Neighbor.com. Renters are actively
              looking for alternatives to crowded, expensive traditional storage facilities. Private
              driveways and lots offer more space, easier access, and often lower prices.
            </p>
          </section>

          <section className="mt-12 space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">What makes a great RV listing</h2>
            <p className="text-muted-foreground">
              RV renters care about fit, access, and protection. The best listings answer those
              questions before the renter asks.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  icon: MapPin,
                  title: "Accurate dimensions",
                  body: "List the usable length, width, and overhead clearance. Include the access path and turnaround radius.",
                },
                {
                  icon: ShieldCheck,
                  title: "Security features",
                  body: "Gated access, cameras, motion lights, and on-site presence all increase trust and let you charge more.",
                },
                {
                  icon: Truck,
                  title: "Surface & access",
                  body: "Gravel, asphalt, concrete, or packed grass? Note whether the space is level, pull-through, or back-in.",
                },
                {
                  icon: Zap,
                  title: "Hookups & amenities",
                  body: "30/50-amp electrical, water access, dump station access, and covered roofs are strong differentiators.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-border bg-card p-5 shadow-card"
                >
                  <item.icon className="h-5 w-5 text-primary" />
                  <h3 className="mt-3 font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-12 space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">
              How to list your RV space on LumoroX Park
            </h2>
            <ol className="space-y-4">
              {[
                "Create a free host account and verify your profile.",
                "Add a new space, set the address, and pin the exact location on the map.",
                "Choose oversized-vehicle-friendly amenities: length, width, clearance, surface, and hookups.",
                "Upload clear photos showing the full space, access path, and any gates or covers.",
                "Set hourly, daily, and monthly rates. Long-term discounts help you win monthly storage renters.",
                "Publish and respond quickly to booking requests. Good response times boost your trust score.",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-muted-foreground">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-12 space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">Pricing your RV space</h2>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Start competitive, then optimize</h3>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {[
                  "Check local self-storage and RV park rates as a benchmark.",
                  "Charge a premium for covered parking, electrical hookups, and gated access.",
                  "Offer monthly discounts to capture long-term storage renters.",
                  "Use dynamic daily pricing for event weekends, camping seasons, and peak travel months.",
                ].map((tip) => (
                  <li key={tip} className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="mt-12 space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">
              Safety, trust, and legal basics
            </h2>
            <p className="text-muted-foreground">
              RVs are valuable assets, so renters prioritize hosts with clear, honest listings and
              good communication.
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {[
                "Verify local zoning and HOA rules before accepting your first booking.",
                "Take photos from multiple angles and update them seasonally.",
                "Write clear access instructions, including gate codes, speed limits, and contact info.",
                "Use LumoroX Park’s QR check-in so every arrival is logged and verified.",
                "Keep your own insurance up to date and encourage renters to carry RV insurance.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-12 space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">Frequently asked questions</h2>
            <div className="space-y-4">
              {[
                {
                  q: "Do I need a permit to rent out RV parking on my property?",
                  a: "It depends on your city, county, and HOA rules. Many areas allow short-term parking rentals on private residential property, but some require a business license, zoning clearance, or HOA approval. Check local regulations before listing your space.",
                },
                {
                  q: "How much can I earn renting RV storage space?",
                  a: "Monthly RV storage rates typically range from $50 to $300+ depending on location, covered vs. uncovered storage, security features, and electrical hookups. Covered or gated spaces in high-demand areas command the highest premiums.",
                },
                {
                  q: "What size RV space do I need to list?",
                  a: "Measure the usable length, width, and height of your space. Class A motorhomes can be 35–45 feet long, while travel trailers and fifth wheels are often 20–35 feet. Include the turnaround and access path in your listing so renters know their rig will fit.",
                },
                {
                  q: "Can I rent RV parking by the hour instead of monthly?",
                  a: "Yes. LumoroX Park supports hourly, daily, and longer-term bookings. Hourly RV parking works well for day trips, events, or overnight stops, while monthly storage is better for seasonal or long-term vehicle storage.",
                },
              ].map(({ q, a }) => (
                <div key={q} className="rounded-2xl border border-border bg-card p-5 shadow-card">
                  <h3 className="font-semibold">{q}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-14 rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center md:p-10">
            <h2 className="text-2xl font-bold tracking-tight">Ready to earn from your RV space?</h2>
            <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
              List your driveway, side yard, or lot on LumoroX Park and start receiving bookings
              from RV owners in your area.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup" }}>
                  List your RV space
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/browse">Browse RV parking</Link>
              </Button>
            </div>
          </section>
        </article>
      </main>
    </div>
  );
}
