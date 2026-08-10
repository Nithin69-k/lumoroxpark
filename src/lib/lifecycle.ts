import { supabase } from "@/integrations/supabase/client";

export async function checkinBooking(qrCode: string) {
  const { data, error } = await supabase.rpc("checkin_booking", { p_qr_code: qrCode });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as { booking_id: string; space_title: string; renter_name: string };
}

export async function checkoutBooking(bookingId: string) {
  const { error } = await supabase.rpc("checkout_booking", { p_booking_id: bookingId });
  if (error) throw error;
}

export async function submitReview(bookingId: string, rating: number, comment: string) {
  const { data, error } = await supabase.rpc("submit_review", {
    p_booking_id: bookingId,
    p_rating: rating,
    p_comment: comment,
  });
  if (error) throw error;
  return data as string;
}

export async function setLiveOccupancy(spaceId: string, status: "available" | "occupied") {
  const { error } = await supabase
    .from("parking_spaces")
    .update({ live_occupancy_status: status })
    .eq("id", spaceId);
  if (error) throw error;
}

export type Review = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_id: string;
};

export async function listSpaceReviews(spaceId: string): Promise<Review[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select("id, rating, comment, created_at, reviewer_id")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as Review[];
}

export async function hasReviewedBooking(bookingId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("reviews")
    .select("id")
    .eq("booking_id", bookingId)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export type MyReview = Review & {
  space_title: string | null;
  reviewee_name: string | null;
  direction: "given" | "received";
};

export async function listMyReviews(userId: string): Promise<MyReview[]> {
  const [given, received] = await Promise.all([
    supabase
      .from("reviews")
      .select(
        "id, rating, comment, created_at, reviewer_id, reviewee_id, space:parking_spaces(title), reviewee:profiles!reviews_reviewee_id_fkey(full_name)",
      )
      .eq("reviewer_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("reviews")
      .select(
        "id, rating, comment, created_at, reviewer_id, reviewee_id, space:parking_spaces(title), reviewer:profiles!reviews_reviewer_id_fkey(full_name)",
      )
      .eq("reviewee_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (given.error) throw given.error;
  if (received.error) throw received.error;

  const gRows = (given.data ?? []) as unknown as Array<{
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    reviewer_id: string;
    space: { title: string | null } | null;
    reviewee: { full_name: string | null } | null;
  }>;
  const rRows = (received.data ?? []) as unknown as Array<{
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    reviewer_id: string;
    space: { title: string | null } | null;
    reviewer: { full_name: string | null } | null;
  }>;

  const out: MyReview[] = [
    ...gRows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      reviewer_id: r.reviewer_id,
      space_title: r.space?.title ?? null,
      reviewee_name: r.reviewee?.full_name ?? null,
      direction: "given" as const,
    })),
    ...rRows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      reviewer_id: r.reviewer_id,
      space_title: r.space?.title ?? null,
      reviewee_name: r.reviewer?.full_name ?? null,
      direction: "received" as const,
    })),
  ];
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
