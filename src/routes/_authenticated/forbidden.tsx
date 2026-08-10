import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/forbidden")({
  component: ForbiddenPage,
});

function ForbiddenPage() {
  return (
    <div className="min-h-full bg-gradient-surface px-5 py-16">
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-card">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="mt-4 font-display text-xl font-bold">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This area is restricted to platform administrators. If you believe you should have access,
          please contact the team.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button asChild>
            <Link to="/profile">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to your profile
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/browse">Browse spaces</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
