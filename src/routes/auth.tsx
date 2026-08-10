import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { signInWithGoogle } from "@/lib/google-signin";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup", "forgot"]).catch("signin"),
  next: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  component: AuthPage,
});

function AuthPage() {
  const { mode: initialMode, next } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  // Only same-origin relative paths are allowed as `next` targets.
  const safeNext =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      const stashed =
        typeof window !== "undefined" ? sessionStorage.getItem("post_auth_next") : null;
      if (stashed) sessionStorage.removeItem("post_auth_next");
      navigate({ to: stashed ?? safeNext ?? "/onboarding", replace: true });
    });
  }, [navigate, safeNext]);

  /** Transient failures (offline, DNS, 5xx) are worth retrying; bad credentials are not. */
  function isTransient(err: unknown) {
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    const status = (err as { status?: number })?.status;
    if (typeof status === "number" && status >= 500) return true;
    return (
      msg.includes("failed to fetch") ||
      msg.includes("load failed") ||
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg.includes("temporarily") ||
      msg.includes("upstream")
    );
  }

  /** Runs `fn`, retrying transient failures up to 3 attempts with backoff. */
  async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
    const delays = [400, 1200];
    for (let i = 0; ; i++) {
      try {
        setAttempt(i + 1);
        return await fn();
      } catch (err) {
        if (i >= delays.length || !isTransient(err)) throw err;
        toast.message(`Connection problem — retrying (${i + 2}/${delays.length + 1})…`);
        await new Promise((r) => setTimeout(r, delays[i]));
      }
    }
  }

  async function sendReset() {
    if (!email) {
      toast.error("Enter your email first");
      return;
    }
    setBusy(true);
    setLastError(null);
    try {
      await withRetry(async () => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/reset-password",
        });
        if (error) throw error;
      });
      setResetSent(true);
      toast.success("Password reset link sent — check your inbox.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not send the reset email";
      setLastError(message);
      toast.error(message);
    } finally {
      setBusy(false);
      setAttempt(0);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "forgot") {
      await sendReset();
      return;
    }
    setBusy(true);
    setLastError(null);
    try {
      if (mode === "signup") {
        await withRetry(async () => {
          const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: safeNext
                ? window.location.origin + safeNext
                : window.location.origin,
              data: { full_name: fullName },
            },
          });
          if (error) throw error;
        });
        toast.success("Account created — you're in!");
        navigate({ to: safeNext ?? "/onboarding", replace: true });
      } else {
        await withRetry(async () => {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
        });
        toast.success("Welcome back");
        navigate({ to: safeNext ?? "/profile", replace: true });
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Something went wrong";
      const message = /invalid login credentials/i.test(raw)
        ? "That email and password don't match. Check them, or reset your password."
        : raw;
      setLastError(message);
      toast.error(message);
    } finally {
      setBusy(false);
      setAttempt(0);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    // Preserve `next` across the full-page OAuth round-trip.
    if (safeNext && typeof window !== "undefined") {
      sessionStorage.setItem("post_auth_next", safeNext);
    }
    const result = await signInWithGoogle(window.location.origin + "/auth");
    if (result.error) {
      toast.error(result.error.message ?? "Google sign-in failed");
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    const stashed = typeof window !== "undefined" ? sessionStorage.getItem("post_auth_next") : null;
    if (stashed) sessionStorage.removeItem("post_auth_next");
    navigate({ to: stashed ?? safeNext ?? "/onboarding", replace: true });
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-surface px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center" aria-label="LumoroX Park home">
          <BrandLogo className="h-10" />
        </Link>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <h1 className="text-2xl font-bold">
            {mode === "signup"
              ? "Create your account"
              : mode === "forgot"
                ? "Reset your password"
                : "Sign in"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signup"
              ? "Book parking or list your driveway — you can do both."
              : mode === "forgot"
                ? "We'll email you a link to choose a new password."
                : "Welcome back to LumoroX Park."}
          </p>

          {mode !== "forgot" && (
            <>
              <Button
                type="button"
                variant="outline"
                className="mt-6 w-full"
                onClick={handleGoogle}
                disabled={busy}
              >
                <GoogleIcon /> Continue with Google
              </Button>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or with email</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form
            onSubmit={handleEmail}
            className={mode === "forgot" ? "mt-6 space-y-3" : "space-y-3"}
          >
            {mode === "signup" && (
              <div>
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            {mode !== "forgot" && (
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("forgot");
                        setLastError(null);
                        setResetSent(false);
                      }}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  minLength={6}
                  required
                />
              </div>
            )}

            {resetSent && mode === "forgot" && (
              <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                Link sent to <span className="font-medium text-foreground">{email}</span>. It
                expires in 60 minutes — check spam if it doesn't arrive.
              </p>
            )}

            {lastError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                <p>{lastError}</p>
                <button
                  type="submit"
                  className="mt-1 font-medium underline underline-offset-2"
                  disabled={busy}
                >
                  Try again
                </button>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy
                ? attempt > 1
                  ? `Retrying (${attempt}/3)…`
                  : "Please wait…"
                : mode === "signup"
                  ? "Create account"
                  : mode === "forgot"
                    ? "Send reset link"
                    : "Sign in"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "forgot" ? (
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setLastError(null);
                }}
                className="font-medium text-primary hover:underline"
              >
                Back to sign in
              </button>
            ) : (
              <>
                {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "signup" ? "signin" : "signup");
                    setLastError(null);
                  }}
                  className="font-medium text-primary hover:underline"
                >
                  {mode === "signup" ? "Sign in" : "Create an account"}
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.06.56 4.2 1.65l3.15-3.15C17.45 1.5 14.97.5 12 .5A11 11 0 0 0 2.18 7.05L5.84 9.9C6.71 7.3 9.14 4.75 12 4.75Z"
      />
    </svg>
  );
}
