import { supabase } from "@/integrations/supabase/client";

export type GoogleSignInResult = { error?: { message: string }; redirected?: boolean };

export async function signInWithGoogle(redirectTo: string): Promise<GoogleSignInResult> {
  if (typeof window === "undefined") return { error: { message: "Unavailable" } };

  // Ask for the authorize URL instead of navigating right away so a missing
  // Google OAuth configuration fails with a friendly message instead of
  // stranding the user on a raw JSON error page from Supabase.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) return { error: { message: error.message } };
  if (!data.url) return { error: { message: "Google sign-in is unavailable" } };

  // Probe the authorize endpoint: a 4xx means the provider is not enabled in
  // the Supabase project. A redirect (opaque response, status 0) means it works.
  try {
    const probe = await fetch(data.url, { method: "GET", redirect: "manual" });
    if (probe.status === 400) {
      return {
        error: {
          message:
            "Google sign-in isn't enabled yet — sign in with email instead, or contact support.",
        },
      };
    }
  } catch {
    // Probe itself failed (e.g. network): proceed, the redirect may still work.
  }

  window.location.assign(data.url);
  return { redirected: true };
}
