import { Link } from "@tanstack/react-router";

import { SUPPORT_EMAIL } from "@/lib/support";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p>© {new Date().getFullYear()} LUMORO X PARK. All rights reserved.</p>
          <p>
            Support:{" "}
            <a className="transition-colors hover:text-foreground" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          <Link to="/ai" className="transition-colors hover:text-foreground">
            AI Assistant
          </Link>
          <Link to="/pricing" className="transition-colors hover:text-foreground">
            Pricing
          </Link>
          <Link to="/help" className="transition-colors hover:text-foreground">
            Help Center
          </Link>
          <Link to="/support" className="transition-colors hover:text-foreground">
            Contact Support
          </Link>
          <Link to="/guides/rv-parking" className="transition-colors hover:text-foreground">
            RV Parking Guide
          </Link>
          <Link to="/terms" className="transition-colors hover:text-foreground">
            Terms of Service
          </Link>
          <Link to="/refunds" className="transition-colors hover:text-foreground">
            Refund &amp; Cancellation
          </Link>
          <Link to="/privacy" className="transition-colors hover:text-foreground">
            Privacy Policy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
