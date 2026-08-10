import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { fetchMyProfile, updateMyProfile } from "@/lib/profile";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

function Onboarding() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchMyProfile(user.id).then((p) => {
      if (p) {
        setFullName(p.full_name ?? "");
        setPhone(p.phone ?? "");
        setIsHost(p.is_host);
      }
      setLoaded(true);
    });
  }, [user.id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateMyProfile(user.id, {
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        is_host: isHost,
      });
      toast.success("Profile saved");
      navigate({ to: "/profile", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <div className="min-h-screen" />;

  return (
    <div className="min-h-full bg-gradient-surface px-4 py-12">
      <div className="mx-auto max-w-lg">
        <h1 className="text-3xl font-bold tracking-tight">Welcome to LumoroX Park</h1>
        <p className="mt-2 text-muted-foreground">
          Tell us a bit about you. You can update this any time.
        </p>

        <form
          onSubmit={handleSave}
          className="mt-8 space-y-5 rounded-2xl border border-border bg-card p-6 shadow-card"
        >
          <div>
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 000 0000"
            />
          </div>

          <div className="rounded-xl border border-border bg-gradient-surface p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="host" className="text-base">
                  I want to list a parking space
                </Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Turn your driveway or private lot into income. You can still book spots as a
                  renter.
                </p>
              </div>
              <Switch id="host" checked={isHost} onCheckedChange={setIsHost} />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
