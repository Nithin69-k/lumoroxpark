import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Releases parking slots whose 15-minute checkout hold has lapsed.
 * Safe to call from anywhere: it only cancels unpaid, already-expired holds.
 */
export const expireStaleHolds = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("expire_pending_bookings");
  if (error) {
    console.error("expire_pending_bookings failed", error.message);
    return { expired: 0 };
  }
  return { expired: Number(data ?? 0) };
});

/**
 * Permanently deletes the signed-in user's account after re-checking that they
 * have no live reservations, pending refunds, wallet balance or active plan.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ deleted: true }> => {
    const { data: blockers, error } = await context.supabase.rpc("account_deletion_blockers");
    if (error) throw new Error(error.message);

    const reasons = ((blockers ?? []) as Array<{ reason: string }>).map((r) => r.reason);
    if (reasons.length > 0) throw new Error(reasons.join(" "));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (delError) throw new Error(delError.message);

    return { deleted: true };
  });
