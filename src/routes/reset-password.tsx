import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset your password | LumoroX Park" },
      {
        name: "description",
        content:
          "Choose a new password for your LumoroX Park account and get back to booking parking.",
      },
      { property: "og:title", content: "Reset your password | LumoroX Park" },
      {
        property: "og:description",
        content: "Choose a new password for your LumoroX Park account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  // Supabase puts the recovery token in the URL hash and exchanges it for a
  // temporary session. Wait for that before showing the form.
  useEffect(() => {
    let done = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        done = true;
        setValid(true);
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (done) return;
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      setValid(Boolean(data.session) || hash.includes("type=recovery"));
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Both passwords must match");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated — you're signed in.");
    navigate({ to: "/profile", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-surface px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center" aria-label="LumoroX Park home">
          <BrandLogo className="h-10" />
        </Link>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <h1 className="text-2xl font-bold">Choose a new password</h1>

          {!ready ? (
            <p className="mt-3 text-sm text-muted-foreground">Checking your reset link…</p>
          ) : !valid ? (
            <div className="mt-3 space-y-4 text-sm text-muted-foreground">
              <p>
                This reset link is invalid or has expired. Request a fresh one and it will arrive in
                a minute or two.
              </p>
              <Button asChild className="w-full">
                <Link to="/auth" search={{ mode: "forgot" }}>
                  Request a new link
                </Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-3">
              <div>
                <Label htmlFor="pw">New password</Label>
                <Input
                  id="pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  autoComplete="new-password"
                  required
                />
              </div>
              <div>
                <Label htmlFor="pw2">Confirm password</Label>
                <Input
                  id="pw2"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={6}
                  autoComplete="new-password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
