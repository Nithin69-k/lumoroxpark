import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Bell,
  MessageSquare,
  LogOut,
  Star,
  Home,
  Car,
  Pencil,
  Calendar,
  Settings,
  Clock,
  ShieldAlert,
  Shield,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyProfile, updateMyProfile, trustBand, type Profile } from "@/lib/profile";
import { humanAction, isAdmin, listMyActivity } from "@/lib/admin";
import { unreadCount } from "@/lib/inbox";
import { listMyBookings } from "@/lib/search";
import { Price } from "@/components/Price";
import { listMyReviews } from "@/lib/lifecycle";
import { AccountSettings } from "@/components/AccountSettings";
import { AppMenu } from "@/components/AppMenu";
import { fetchMyHostVerification } from "@/lib/host-verification";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const {
    data: profile,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["profile", user.id],
    queryFn: () => fetchMyProfile(user.id),
  });

  const { data: admin } = useQuery({
    queryKey: ["is-admin", user.id],
    queryFn: () => isAdmin(user.id),
  });

  const { data: verification } = useQuery({
    queryKey: ["host-verification", user.id],
    queryFn: () => fetchMyHostVerification(user.id),
  });

  const { data: unread = 0 } = useQuery({
    queryKey: ["notif-unread", user.id],
    queryFn: () => unreadCount(),
    refetchInterval: 30000,
  });

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  if (error || (!isLoading && !profile)) {
    return (
      <div className="min-h-full bg-gradient-surface px-4 py-16">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold">We couldn't load your profile</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Your profile isn't available right now."}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button size="sm" onClick={() => refetch()}>
              Try again
            </Button>
            <Button size="sm" variant="outline" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || !profile) {
    return (
      <div className="min-h-full bg-gradient-surface px-4 py-12">
        <div className="mx-auto max-w-2xl animate-pulse">
          <div className="h-8 w-40 rounded bg-muted" />
          <div className="mt-6 h-48 rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  const initials = (profile.full_name ?? user.email ?? "?")
    .split(" ")
    .map((s: string) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const band = trustBand(profile.trust_score);
  const toneClass =
    band.tone === "success"
      ? "bg-success/15 text-success-foreground border-success/30"
      : band.tone === "warning"
        ? "bg-warning/15 text-warning-foreground border-warning/30"
        : band.tone === "destructive"
          ? "bg-destructive/15 text-destructive border-destructive/30"
          : "bg-muted text-muted-foreground border-border";

  return (
    <div className="min-h-full bg-gradient-surface">
      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5 sm:py-4">
          <Link to="/" className="flex min-w-0 items-center" aria-label="LumoroX Park home">
            <BrandLogo className="h-8 sm:h-9" />
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <Button asChild variant="ghost" size="icon" className="relative">
              <Link to="/notifications" aria-label="Notifications">
                <Bell className="h-4 w-4" />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" aria-label="Messages">
              <Link to="/messages">
                <MessageSquare className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="px-2 sm:px-3"
              onClick={handleSignOut}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4 sm:mr-2" />{" "}
              <span className="hidden sm:inline">Sign out</span>
            </Button>
            <AppMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={profile.avatar_url ?? undefined} alt={profile.full_name ?? ""} />
                <AvatarFallback className="bg-gradient-brand text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-2xl font-bold">{profile.full_name || "Unnamed"}</h1>
                <p className="text-sm text-muted-foreground">{user.email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="gap-1">
                    <Star className="h-3 w-3 fill-current" />
                    {Number(profile.rating).toFixed(1)}
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    {profile.is_host ? <Home className="h-3 w-3" /> : <Car className="h-3 w-3" />}
                    {profile.is_host ? "Host + renter" : "Renter"}
                  </Badge>
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
              <Pencil className="mr-2 h-4 w-4" />
              {editing ? "Close" : "Edit profile"}
            </Button>
          </div>

          <div className={`mt-6 rounded-2xl border p-5 ${toneClass}`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium opacity-80">
                  <Shield className="h-4 w-4" /> Trust score
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-4xl font-bold">{profile.trust_score}</span>
                  <span className="text-sm opacity-70">/ 100</span>
                  <span className="ml-2 rounded-full border border-current/30 bg-background/40 px-2 py-0.5 text-xs font-semibold">
                    {band.label}
                  </span>
                </div>
              </div>
              <div className="text-right text-xs opacity-70">
                <div>{profile.total_bookings} bookings</div>
                <div>Earn +1 for every on-time completion.</div>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-background/40">
              <div
                className="h-full rounded-full bg-current transition-all"
                style={{ width: `${Math.max(4, Math.min(100, profile.trust_score))}%` }}
              />
            </div>
          </div>

          {editing && <EditForm profile={profile} onClose={() => setEditing(false)} />}
        </div>

        <HistoryTabs userId={user.id} />

        <AccountSettings email={user.email ?? ""} />

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border p-5 text-sm">
            <strong className="block text-foreground">Bookings</strong>
            <p className="mt-2 text-muted-foreground">
              Your reservations, QR check-ins, and history.
            </p>
            <Button asChild size="sm" className="mt-3">
              <Link to="/bookings">View my bookings</Link>
            </Button>
          </div>
          <div className="rounded-2xl border border-border p-5 text-sm">
            <strong className="block text-foreground text-left">Your listings</strong>
            {profile.is_host ? (
              <div className="mt-2 text-left">
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Manage your parking spaces and availability.
                </p>
                <Button asChild size="sm" className="mt-3">
                  <Link to="/host">Open host dashboard</Link>
                </Button>
              </div>
            ) : verification?.status === "pending" ? (
              <div className="mt-2 text-left space-y-2">
                <p className="text-xs text-amber-500 font-semibold flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Verification Pending Approval
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Your application is under administrator review. We'll activate your dashboard once verified.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-2">
                  <Link to={"/become-host" as any}>Check Application Status</Link>
                </Button>
              </div>
            ) : verification?.status === "rejected" ? (
              <div className="mt-2 text-left space-y-2">
                <p className="text-xs text-destructive font-semibold flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5" /> Application Not Approved
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Reason: {verification.rejection_reason || "Invalid documents."}
                </p>
                <Button asChild size="sm" className="mt-2 bg-destructive hover:bg-destructive/90 text-white border-0">
                  <Link to={"/become-host" as any}>Resubmit Application</Link>
                </Button>
              </div>
            ) : (
              <div className="mt-2 text-left">
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Monetize your vacant driveway, garage or parking space. Verify your identity to start hosting.
                </p>
                <Button asChild size="sm" className="mt-3">
                  <Link to={"/become-host" as any}>Become a Host</Link>
                </Button>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-border p-5 text-sm">
            <strong className="block text-foreground">Activity</strong>
            <p className="mt-2 text-muted-foreground">
              Timeline of your bookings, reviews, and updates.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link to="/activity">View activity</Link>
            </Button>
          </div>
          {admin && (
            <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5 text-sm">
              <strong className="block text-foreground">Admin</strong>
              <p className="mt-2 text-muted-foreground">Platform stats and dispute resolution.</p>
              <Button asChild size="sm" className="mt-3">
                <Link to="/admin">Open admin</Link>
              </Button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function EditForm({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [busy, setBusy] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateMyProfile(profile.id, {
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
      });
      qc.invalidateQueries({ queryKey: ["profile", profile.id] });
      toast.success("Profile updated");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="mt-6 space-y-4 border-t border-border pt-6">
      <div>
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

function HistoryTabs({ userId }: { userId: string }) {
  const bookings = useQuery({
    queryKey: ["profile-bookings", userId],
    queryFn: () => listMyBookings(),
  });
  const reviews = useQuery({
    queryKey: ["profile-reviews", userId],
    queryFn: () => listMyReviews(userId),
  });
  const activity = useQuery({
    queryKey: ["profile-activity", userId],
    queryFn: () => listMyActivity(30),
  });

  return (
    <section className="mt-8 rounded-3xl border border-border bg-card p-4 shadow-card md:p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">History</h2>
      </div>
      <Tabs defaultValue="bookings">
        <TabsList className="w-full">
          <TabsTrigger value="bookings" className="flex-1">
            Bookings{" "}
            {bookings.data && (
              <span className="ml-1 text-xs text-muted-foreground">({bookings.data.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="reviews" className="flex-1">
            Reviews{" "}
            {reviews.data && (
              <span className="ml-1 text-xs text-muted-foreground">({reviews.data.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex-1">
            Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bookings" className="mt-4">
          {bookings.isLoading ? (
            <SkeletonRows />
          ) : !bookings.data || bookings.data.length === 0 ? (
            <EmptyState
              text="You haven't booked a space yet."
              cta={{ to: "/browse", label: "Find a spot" }}
            />
          ) : (
            <ul className="space-y-2">
              {bookings.data.slice(0, 6).map((b) => (
                <li key={b.id}>
                  <Link
                    to="/bookings"
                    className="flex items-center justify-between rounded-xl border border-border p-3 text-sm transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{b.space_title}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(b.start_time).toLocaleDateString()} ·{" "}
                        <Price usd={b.total_price} showInr={false} />
                      </div>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                      {b.status}
                    </span>
                  </Link>
                </li>
              ))}
              {bookings.data.length > 6 && (
                <div className="pt-2 text-center">
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/bookings">See all bookings</Link>
                  </Button>
                </div>
              )}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="reviews" className="mt-4">
          {reviews.isLoading ? (
            <SkeletonRows />
          ) : !reviews.data || reviews.data.length === 0 ? (
            <EmptyState text="No reviews yet. Complete a stay to leave and receive reviews." />
          ) : (
            <ul className="space-y-2">
              {reviews.data.slice(0, 6).map((r) => (
                <li key={r.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                        {r.direction === "given" ? "You wrote" : "You received"}
                      </span>
                      <span className="font-medium">
                        {"★".repeat(r.rating)}
                        <span className="text-muted-foreground">{"★".repeat(5 - r.rating)}</span>
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {r.space_title ?? "—"} · {r.reviewee_name ?? "—"}
                  </div>
                  {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          {activity.isLoading ? (
            <SkeletonRows />
          ) : !activity.data || activity.data.length === 0 ? (
            <EmptyState text="Nothing happened yet." />
          ) : (
            <>
              <ul className="space-y-2">
                {activity.data.slice(0, 8).map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
                  >
                    <span>{humanAction(a.action)}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="pt-3 text-center">
                <Button asChild size="sm" variant="ghost">
                  <Link to="/activity">See full timeline</Link>
                </Button>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}

function SkeletonRows() {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-12 rounded-xl bg-muted" />
      ))}
    </div>
  );
}

function EmptyState({ text, cta }: { text: string; cta?: { to: string; label: string } }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {text}
      {cta && (
        <div className="mt-3">
          <Button asChild size="sm">
            <Link to={cta.to}>{cta.label}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
