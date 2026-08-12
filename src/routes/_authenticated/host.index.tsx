import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  MapPin,
  Power,
  PowerOff,
  Calendar as CalendarIcon,
  Trash2,
  ArrowLeft,
  ScanLine,
  Circle,
} from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Price } from "@/components/Price";
import {
  listMySpaces,
  toggleSpaceActive,
  listSlots,
  addSlot,
  deleteSlot,
  type MySpace,
} from "@/lib/spaces";
import { setLiveOccupancy } from "@/lib/lifecycle";
import { SpacePhoto } from "@/components/SpacePhoto";
import { fetchMyProfile } from "@/lib/profile";
import { AppMenu } from "@/components/AppMenu";

export const Route = createFileRoute("/_authenticated/host/")({
  component: HostDashboard,
});

function HostDashboard() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["profile", user.id],
    queryFn: () => fetchMyProfile(user.id),
  });

  const { data: spaces, isLoading } = useQuery({
    queryKey: ["my-spaces"],
    queryFn: listMySpaces,
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => toggleSpaceActive(id, active),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-spaces"] });
      toast.success("Listing updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (profile && !profile.is_host) {
    return (
      <div className="min-h-full bg-gradient-surface px-5 py-16">
        <div className="mx-auto max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-card">
          <h1 className="text-2xl font-bold">Become a host first</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enable host mode in your profile to list a parking space.
          </p>
          <Button asChild className="mt-6">
            <Link to="/profile">Go to profile</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gradient-surface">
      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-1 sm:gap-3">
            <Button asChild variant="ghost" size="sm" className="shrink-0 px-2 sm:px-3">
              <Link to="/profile">
                <ArrowLeft className="h-4 w-4 sm:mr-1" />{" "}
                <span className="hidden sm:inline">Profile</span>
              </Link>
            </Button>
            <h1 className="truncate font-display text-base font-bold sm:text-lg">Host dashboard</h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/host/earnings">Earnings</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/host/scan">
                <ScanLine className="h-4 w-4 sm:mr-1" />{" "}
                <span className="hidden sm:inline">Check-in</span>
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/host/new">
                <Plus className="h-4 w-4 sm:mr-1" />{" "}
                <span className="hidden sm:inline">Create spot</span>
              </Link>
            </Button>
            <AppMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-52 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : !spaces || spaces.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center">
            <MapPin className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">No listings yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first parking space to start earning.
            </p>
            <Button asChild className="mt-6">
              <Link to="/host/new">
                <Plus className="mr-1 h-4 w-4" /> List a space
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {spaces.map((s) => (
              <SpaceCard
                key={s.id}
                space={s}
                onToggle={(active) => toggle.mutate({ id: s.id, active })}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function SpaceCard({ space, onToggle }: { space: MySpace; onToggle: (active: boolean) => void }) {
  const qc = useQueryClient();
  const occ = useMutation({
    mutationFn: (status: "available" | "occupied") => setLiveOccupancy(space.id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-spaces"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const isOccupied = space.live_occupancy_status === "occupied";
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="relative h-40 bg-muted">
        {space.photos[0] ? (
          <SpacePhoto
            path={space.photos[0]}
            alt={space.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <MapPin className="h-8 w-8" />
          </div>
        )}
        <Badge
          className="absolute right-3 top-3"
          variant={space.is_active ? "default" : "secondary"}
        >
          {space.is_active ? "Active" : "Paused"}
        </Badge>
      </div>
      <div className="p-4">
        <h3 className="font-semibold">{space.title}</h3>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{space.address}</p>
        <button
          className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${
            isOccupied
              ? "border-warning/30 bg-warning/10 text-warning hover:bg-warning/20"
              : "border-success/30 bg-success/10 text-success hover:bg-success/20"
          }`}
          onClick={() => occ.mutate(isOccupied ? "available" : "occupied")}
          disabled={occ.isPending}
          title="Tap to toggle live occupancy"
        >
          <Circle className={`h-2 w-2 ${isOccupied ? "fill-warning" : "fill-success"}`} />
          {isOccupied ? "Occupied" : "Available"}
        </button>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm">
            <strong className="text-lg">
              <Price usd={Number(space.price_per_hour)} showInr={false} />
            </strong>
            <span className="text-muted-foreground"> / hour</span>
          </span>
          <div className="flex gap-2">
            <SlotDialog space={space} />
            <Button size="sm" variant="outline" onClick={() => onToggle(!space.is_active)}>
              {space.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlotDialog({ space }: { space: MySpace }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const { data: slots } = useQuery({
    queryKey: ["slots", space.id],
    queryFn: () => listSlots(space.id),
    enabled: open,
  });

  const add = useMutation({
    mutationFn: () => addSlot(space.id, new Date(start).toISOString(), new Date(end).toISOString()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["slots", space.id] });
      setStart("");
      setEnd("");
      toast.success("Availability added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSlot(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["slots", space.id] }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <CalendarIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Availability — {space.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="s">Start</Label>
              <Input
                id="s"
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="e">End</Label>
              <Input
                id="e"
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
            {!slots || slots.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                No slots yet — space is unavailable.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {slots.map((slot) => (
                  <li key={slot.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>
                      {format(new Date(slot.start_time), "MMM d, HH:mm")} →{" "}
                      {format(new Date(slot.end_time), "MMM d, HH:mm")}
                    </span>
                    <div className="flex items-center gap-2">
                      {slot.is_booked && <Badge variant="secondary">Booked</Badge>}
                      {!slot.is_booked && (
                        <Button size="icon" variant="ghost" onClick={() => remove.mutate(slot.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!start || !end || add.isPending} onClick={() => add.mutate()}>
            {add.isPending ? "Adding…" : "Add slot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
