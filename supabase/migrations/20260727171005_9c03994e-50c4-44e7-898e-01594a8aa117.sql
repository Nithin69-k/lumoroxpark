-- 1. Fix mutable search_path on helper function
CREATE OR REPLACE FUNCTION public.cancellation_cutoff_hours(_policy text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$ SELECT CASE _policy WHEN 'flexible' THEN 1 WHEN 'strict' THEN 24 ELSE 12 END; $function$;

-- 2. Revoke direct EXECUTE on SECURITY DEFINER helpers that must only be
--    called internally by other (already guarded) functions.
REVOKE ALL ON FUNCTION public.is_host_pro(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.host_commission_rate(uuid) FROM PUBLIC, anon, authenticated;

-- 3. Internal-only helpers should not be callable through the API
REVOKE ALL ON FUNCTION public.cancellation_cutoff_hours(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- 4. Keep service_role access for server-side/admin paths
GRANT EXECUTE ON FUNCTION public.is_host_pro(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.host_commission_rate(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancellation_cutoff_hours(text) TO service_role;