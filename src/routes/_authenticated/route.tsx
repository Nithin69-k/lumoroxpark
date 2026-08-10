import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingScreen } from "@/components/LoadingScreen";
import type { User } from "@supabase/supabase-js";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // The session lives in localStorage, so only the client can verify it. We
  // type the context for child routes (`user` is always present by the time
  // children render — AuthGate only mounts Outlet after a successful check).
  beforeLoad: async (): Promise<{ user: User }> => {
    const { data, error } = await supabase.auth.getUser();
    return { user: (error || !data.user ? null : data.user) as User };
  },
  component: AuthGate,
});

// Redirecting inside beforeLoad on an ssr:false route swaps the DOM during
// hydration and causes React error #418. Instead we render a splash first and
// navigate in an effect, after hydration has settled.
function AuthGate() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate({ to: "/auth", search: { mode: "signin" }, replace: true });
      return;
    }
    setChecked(true);
  }, [user, navigate]);

  if (!checked) return <LoadingScreen />;

  return <Outlet />;
}
