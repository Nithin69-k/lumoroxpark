import { supabase } from "@/integrations/supabase/client";

export type HostVerification = {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  address: string;
  verification_type: string;
  document_url: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function submitHostVerification(input: {
  fullName: string;
  phone: string;
  address: string;
  verificationType: string;
  documentUrl: string;
}): Promise<string> {
  const { data, error } = await (supabase
    .from("host_verifications" as any)
    .insert({
      full_name: input.fullName,
      phone: input.phone,
      address: input.address,
      verification_type: input.verificationType,
      document_url: input.documentUrl,
    } as any)
    .select("id") as any)
    .single();

  if (error) throw error;
  return (data as any).id;
}

export async function fetchMyHostVerification(userId: string): Promise<HostVerification | null> {
  const { data, error } = await (supabase
    .from("host_verifications" as any)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1) as any)
    .maybeSingle();

  if (error) throw error;
  return data as HostVerification | null;
}

export async function uploadVerificationDocument(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  
  // Attempt uploading to private host-verification-documents bucket, fallback to space-photos
  try {
    const { error } = await supabase.storage
      .from("host-verification-documents")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return `host-verification-documents/${path}`;
  } catch {
    // Fallback if bucket doesn't exist yet
    const { error } = await supabase.storage
      .from("space-photos")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return `space-photos/${path}`;
  }
}

export async function getSignedDocUrl(path: string): Promise<string> {
  const parts = path.split("/");
  const bucket = parts[0];
  const fileKey = parts.slice(1).join("/");
  
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(fileKey, 60 * 60);

  if (error) throw error;
  return data.signedUrl;
}

export type AdminVerificationRow = HostVerification & {
  host_name?: string;
  host_email?: string;
};

export async function adminListHostVerifications(): Promise<AdminVerificationRow[]> {
  const { data: verifications, error: vError } = await (supabase
    .from("host_verifications" as any)
    .select("*")
    .order("created_at", { ascending: false }) as any);

  if (vError) throw vError;
  if (!verifications || verifications.length === 0) return [];

  // Fetch profiles and emails to match
  const userIds = verifications.map((v: any) => v.user_id);
  const { data: profiles } = await (supabase
    .from("profiles" as any)
    .select("id, full_name")
    .in("id", userIds) as any);

  const profileMap = new Map(profiles?.map((p: any) => [p.id, p.full_name]) ?? []);

  return verifications.map((v: any) => ({
    ...v,
    host_name: profileMap.get(v.user_id) || v.full_name,
  })) as AdminVerificationRow[];
}

export async function adminReviewHostApplication(
  verificationId: string,
  status: "approved" | "rejected",
  rejectionReason?: string
): Promise<void> {
  const { error } = await supabase.rpc("review_host_application" as any, {
    p_verification_id: verificationId,
    p_status: status,
    p_rejection_reason: rejectionReason || null,
  } as any);

  if (error) throw error;
}
