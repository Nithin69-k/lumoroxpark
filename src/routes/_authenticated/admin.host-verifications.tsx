import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Shield,
  User,
  Phone,
  MapPin,
  Calendar,
  Clock,
  Check,
  X,
  FileText,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/LoadingScreen";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SpacePhoto } from "@/components/SpacePhoto";
import { isAdmin } from "@/lib/admin";
import {
  adminListHostVerifications,
  adminReviewHostApplication,
  getSignedDocUrl,
  type AdminVerificationRow,
} from "@/lib/host-verification";

export const Route = createFileRoute("/_authenticated/admin/host-verifications")({
  beforeLoad: async ({ context }) => {
    const { user } = context as { user: { id: string } };
    const ok = await isAdmin(user.id).catch(() => false);
    return { isAdmin: ok };
  },
  component: AdminHostVerificationsGate,
});

function AdminHostVerificationsGate() {
  const navigate = useNavigate();
  const { isAdmin } = Route.useRouteContext() as any;
  useEffect(() => {
    if (!isAdmin) navigate({ to: "/forbidden", replace: true });
  }, [isAdmin, navigate]);
  if (!isAdmin) return <LoadingScreen />;
  return <AdminHostVerificationsDashboard />;
}

function AdminHostVerificationsDashboard() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [rejectingApp, setRejectingApp] = useState<AdminVerificationRow | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [viewingAppDocs, setViewingAppDocs] = useState<AdminVerificationRow | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["admin-host-verifications"],
    queryFn: adminListHostVerifications,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      reason,
    }: {
      id: string;
      status: "approved" | "rejected";
      reason?: string;
    }) => {
      await adminReviewHostApplication(id, status, reason);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-host-verifications"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Application review completed");
      setRejectingApp(null);
      setRejectionReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Resolve signed document url on preview
  useEffect(() => {
    if (viewingAppDocs && viewingAppDocs.document_url) {
      getSignedDocUrl(viewingAppDocs.document_url)
        .then((url) => setSignedUrl(url))
        .catch(() => setSignedUrl(null));
    } else {
      setSignedUrl(null);
    }
  }, [viewingAppDocs]);

  const filteredApps = applications.filter((app) => {
    if (filter === "all") return true;
    return app.status === filter;
  });

  return (
    <div className="min-h-full bg-gradient-surface">
      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3 sm:px-5 sm:py-4">
          <Button asChild variant="ghost" size="sm" className="shrink-0 px-2 sm:px-3">
            <Link to="/admin">
              <ArrowLeft className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Admin Panel</span>
            </Link>
          </Button>
          <h1 className="flex min-w-0 items-center gap-2 font-display text-base font-bold sm:text-lg">
            <Shield className="h-5 w-5 shrink-0 text-primary" /> Host Verifications
          </h1>

          <div className="ml-auto flex rounded-xl bg-muted/80 p-0.5 border border-border/40 text-xs shrink-0">
            {(["all", "pending", "approved", "rejected"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`rounded-lg px-2.5 py-1.5 capitalize font-semibold transition-all ${
                  filter === tab
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-6 space-y-6">
        <div className="rounded-3xl border border-border bg-card overflow-hidden shadow-card">
          {isLoading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading applications…</div>
          ) : filteredApps.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="mx-auto p-3.5 bg-muted/50 rounded-2xl text-muted-foreground w-fit">
                <FileText className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-sm text-foreground">No Applications</h3>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                There are no host applications matching the selected status right now.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Phone / Contact</TableHead>
                  <TableHead>Verification Details</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApps.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-semibold text-foreground text-left text-xs">
                      <div>{app.full_name}</div>
                      <div className="text-[10px] text-muted-foreground font-normal mt-0.5">{app.address}</div>
                    </TableCell>
                    <TableCell className="text-left text-xs">
                      <div>{app.phone}</div>
                    </TableCell>
                    <TableCell className="text-left text-xs">
                      <div className="capitalize font-semibold text-foreground">{app.verification_type} ID</div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 px-2 mt-1 rounded-lg"
                        onClick={() => setViewingAppDocs(app)}
                      >
                        Review Documents
                      </Button>
                    </TableCell>
                    <TableCell className="text-left text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {format(new Date(app.created_at), "MMM d, yyyy")}
                      </div>
                    </TableCell>
                    <TableCell className="text-left text-xs">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          app.status === "approved"
                            ? "bg-emerald-500/5 text-emerald-500 border-emerald-500/10"
                            : app.status === "rejected"
                              ? "bg-destructive/5 text-destructive border-destructive/10"
                              : "bg-amber-500/5 text-amber-500 border-amber-500/10"
                        }`}
                      >
                        {app.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {app.status === "pending" && (
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive h-7 w-7 p-0 rounded-lg flex items-center justify-center"
                            onClick={() => setRejectingApp(app)}
                            disabled={reviewMutation.isPending}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 w-7 p-0 rounded-lg flex items-center justify-center"
                            onClick={() => reviewMutation.mutate({ id: app.id, status: "approved" })}
                            disabled={reviewMutation.isPending}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      {app.status === "rejected" && app.rejection_reason && (
                        <span className="text-[10px] text-muted-foreground line-clamp-1 block text-right max-w-[120px]" title={app.rejection_reason}>
                          {app.rejection_reason}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </main>

      {/* Reject Confirmation Dialog */}
      {rejectingApp && (
        <Dialog open={!!rejectingApp} onOpenChange={() => setRejectingApp(null)}>
          <DialogContent className="max-w-md bg-card border border-border">
            <DialogHeader>
              <DialogTitle className="text-left flex items-center gap-1.5 text-destructive">
                <ShieldAlert className="h-5 w-5" /> Reject Host Application
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4 text-left">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Provide a detailed explanation for rejecting <span className="font-semibold text-foreground">{rejectingApp.full_name}</span>'s verification. The applicant will see this message and be allowed to correct the files.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="reason">Reason for rejection:</Label>
                <Input
                  id="reason"
                  placeholder="e.g. Unclear government ID photo, address document does not match"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setRejectingApp(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="rounded-xl font-semibold"
                onClick={() =>
                  reviewMutation.mutate({
                    id: rejectingApp.id,
                    status: "rejected",
                    reason: rejectionReason,
                  })
                }
                disabled={!rejectionReason.trim() || reviewMutation.isPending}
              >
                Reject Application
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* View Document Dialog */}
      {viewingAppDocs && (
        <Dialog open={!!viewingAppDocs} onOpenChange={() => setViewingAppDocs(null)}>
          <DialogContent className="max-w-2xl bg-card border border-border">
            <DialogHeader>
              <DialogTitle className="text-left flex items-center gap-1.5 text-foreground">
                <FileText className="h-5 w-5 text-primary" /> Application Credentials
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4 text-left">
              <div className="grid gap-4 sm:grid-cols-2 text-xs">
                <div className="space-y-1">
                  <span className="text-muted-foreground block font-medium">Applicant Name</span>
                  <span className="text-foreground font-semibold block">{viewingAppDocs.full_name}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground block font-medium">Phone Number</span>
                  <span className="text-foreground font-semibold block">{viewingAppDocs.phone}</span>
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <span className="text-muted-foreground block font-medium">Address</span>
                  <span className="text-foreground font-semibold block leading-relaxed">{viewingAppDocs.address}</span>
                </div>
              </div>

              <div className="border-t border-border/80 pt-4 mt-2">
                <span className="text-xs font-semibold text-muted-foreground block mb-2">Submitted Supporting Document:</span>
                <div className="aspect-video rounded-xl overflow-hidden bg-muted border border-border flex items-center justify-center">
                  {signedUrl ? (
                    signedUrl.endsWith(".pdf") ? (
                      <div className="flex flex-col items-center justify-center p-6 text-center">
                        <FileText className="h-10 w-10 text-muted-foreground mb-2" />
                        <span className="text-xs font-semibold">PDF Document Submitted</span>
                        <a
                          href={signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 text-xs text-primary underline font-medium"
                        >
                          Open document in new tab
                        </a>
                      </div>
                    ) : (
                      <img src={signedUrl} alt="Doc preview" className="h-full w-full object-contain" />
                    )
                  ) : (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setViewingAppDocs(null)}>
                Close Viewer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
