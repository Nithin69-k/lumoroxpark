import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileText,
  Upload,
  User,
  Phone,
  MapPin,
  Clock,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LoadingScreen } from "@/components/LoadingScreen";
import { fetchMyProfile } from "@/lib/profile";
import {
  submitHostVerification,
  fetchMyHostVerification,
  uploadVerificationDocument,
} from "@/lib/host-verification";

export const Route = createFileRoute("/_authenticated/become-host")({
  component: BecomeHostPage,
});

function BecomeHostPage() {
  const { user } = Route.useRouteContext() as any;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [verificationType, setVerificationType] = useState("aadhaar");
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", user.id],
    queryFn: () => fetchMyProfile(user.id),
  });

  const { data: application, isLoading: appLoading } = useQuery({
    queryKey: ["host-verification", user.id],
    queryFn: () => fetchMyHostVerification(user.id),
  });

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
    }
  }, [profile]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!docUrl) throw new Error("Please upload a verification document");
      await submitHostVerification({
        fullName: fullName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        verificationType,
        documentUrl: docUrl,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["host-verification"] });
      toast.success("Application submitted successfully!");
      setResubmitting(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    try {
      const path = await uploadVerificationDocument(user.id, file);
      setDocUrl(path);
      toast.success("Verification document uploaded successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Document upload failed");
    } finally {
      setUploadingDoc(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim() || !address.trim() || !docUrl) {
      toast.error("All verification fields are required");
      return;
    }
    submit.mutate();
  }

  if (profileLoading || appLoading) return <LoadingScreen />;

  // 1. Host Already Approved
  if (profile?.is_host || application?.status === "approved") {
    return (
      <div className="min-h-full bg-gradient-surface px-5 py-12 flex items-center justify-center">
        <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 md:p-8 text-center shadow-card space-y-6">
          <div className="mx-auto p-4 rounded-full bg-emerald-500/10 text-emerald-500 w-16 h-16 flex items-center justify-center">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold">Verification Approved!</h2>
            <p className="text-sm text-muted-foreground mt-2">
              You are an authorized LumoroX host. You can now publish driveway listings, manage availability, and view passenger bookings.
            </p>
          </div>
          <Button asChild className="w-full rounded-xl font-bold">
            <Link to="/host">Go to Host Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  // 2. Verification Application Pending Review
  if (application?.status === "pending" && !resubmitting) {
    return (
      <div className="min-h-full bg-gradient-surface px-5 py-12 flex items-center justify-center">
        <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 md:p-8 text-center shadow-card space-y-6">
          <div className="mx-auto p-4 rounded-full bg-amber-500/10 text-amber-500 w-16 h-16 flex items-center justify-center">
            <Clock className="h-8 w-8 animate-pulse" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold">Verification Pending</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Your host application has been submitted successfully and is awaiting owner verification.
              We verify document legitimacy and address records to prevent fraud. Typically approved within 24 hours.
            </p>
          </div>
          <div className="bg-muted/40 rounded-2xl p-4.5 text-left text-xs space-y-2 border border-border/40">
            <div className="font-semibold text-foreground">Submitted Credentials:</div>
            <div className="text-muted-foreground">Name: <span className="text-foreground font-medium">{application.full_name}</span></div>
            <div className="text-muted-foreground">ID Type: <span className="text-foreground font-medium uppercase">{application.verification_type}</span></div>
            <div className="text-muted-foreground">Address: <span className="text-foreground font-medium">{application.address}</span></div>
          </div>
          <Button asChild variant="outline" className="w-full rounded-xl">
            <Link to="/profile">Back to Profile</Link>
          </Button>
        </div>
      </div>
    );
  }

  // 3. Verification Application Rejected
  if (application?.status === "rejected" && !resubmitting) {
    return (
      <div className="min-h-full bg-gradient-surface px-5 py-12 flex items-center justify-center">
        <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 md:p-8 text-center shadow-card space-y-6">
          <div className="mx-auto p-4 rounded-full bg-destructive/10 text-destructive w-16 h-16 flex items-center justify-center">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold text-destructive">Application Not Approved</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Your host application was not approved. Please review the reason below and submit updated documents.
            </p>
          </div>
          {application.rejection_reason && (
            <div className="bg-destructive/5 rounded-2xl p-4 text-left text-xs border border-destructive/10">
              <span className="font-semibold text-destructive block mb-1">Rejection Reason:</span>
              <p className="text-muted-foreground leading-relaxed">{application.rejection_reason}</p>
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="flex-1 rounded-xl" asChild>
              <Link to="/profile">Profile</Link>
            </Button>
            <Button className="flex-1 rounded-xl font-bold bg-primary hover:bg-primary/90" onClick={() => setResubmitting(true)}>
              Resubmit Application
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Default Submit Application Form
  return (
    <div className="min-h-full bg-gradient-surface py-8">
      <div className="mx-auto max-w-xl px-5">
        <div className="flex items-center gap-2 mb-6">
          <Button asChild variant="ghost" size="sm" className="px-2">
            <Link to="/profile">
              <ArrowLeft className="h-4 w-4 mr-1" /> Profile
            </Link>
          </Button>
          <span className="text-muted-foreground">/</span>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Become a Host</span>
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 md:p-8 shadow-card space-y-6">
          <div className="text-left">
            <h1 className="font-display text-2xl font-bold text-foreground">Become a Host</h1>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Verify your identity and parking space rights to list spots and receive passenger payouts.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5 text-left">
              <Label htmlFor="fullName">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/80" />
                <Input
                  id="fullName"
                  placeholder="Enter full legal name"
                  className="pl-10 rounded-xl"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5 text-left">
              <Label htmlFor="phone">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/80" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+91 XXXXX XXXXX"
                  className="pl-10 rounded-xl"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5 text-left">
              <Label htmlFor="address">Verification / Property Address</Label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/80" />
                <Textarea
                  id="address"
                  placeholder="Enter your home or property residency address"
                  className="pl-10 rounded-xl min-h-[80px]"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5 text-left">
              <Label htmlFor="idType">Government ID Type</Label>
              <select
                id="idType"
                value={verificationType}
                onChange={(e) => setVerificationType(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="aadhaar" className="bg-background text-foreground">Aadhaar Card</option>
                <option value="pan" className="bg-background text-foreground">PAN Card</option>
                <option value="dl" className="bg-background text-foreground">Driver's License</option>
                <option value="passport" className="bg-background text-foreground">Passport</option>
              </select>
            </div>

            <div className="space-y-2 text-left pt-2">
              <Label>Upload Verification Document (ID or Property Deed)</Label>
              {docUrl ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-xs text-emerald-500 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-4 w-4" /> Credentials Document Registered
                  </span>
                  <button type="button" onClick={() => setDocUrl(null)} className="text-muted-foreground hover:text-foreground font-semibold">Remove</button>
                </div>
              ) : (
                <label className="flex h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border text-xs text-muted-foreground hover:bg-accent/50 transition-colors">
                  <Upload className="mb-2 h-6 w-6" />
                  {uploadingDoc ? "Uploading files…" : "Click to upload Front Identity Card or Property deed"}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={handleDocUpload}
                    disabled={uploadingDoc}
                  />
                </label>
              )}
            </div>

            <div className="pt-4 border-t border-border/80 mt-6 text-left">
              <div className="bg-muted/30 rounded-xl p-3.5 border border-border/40 text-[10.5px] text-muted-foreground leading-relaxed">
                By clicking submit, you authorize LumoroX Park to review your identity documents and agree to be legally liable under civil and criminal laws for space hosting safety.
              </div>
            </div>

            <Button type="submit" className="w-full rounded-xl font-bold mt-2" disabled={submit.isPending || uploadingDoc}>
              {submit.isPending ? "Submitting application…" : "Submit Host Application"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
