
DROP POLICY IF EXISTS "Public can view profile basics" ON public.profiles;
REVOKE SELECT ON public.profiles FROM anon;

-- Recreate view as SECURITY DEFINER so anon can read public host fields
DROP VIEW IF EXISTS public.hosts_public;
CREATE VIEW public.hosts_public AS
SELECT id, full_name, avatar_url, rating, trust_score, total_bookings
FROM public.profiles;

GRANT SELECT ON public.hosts_public TO anon, authenticated;
