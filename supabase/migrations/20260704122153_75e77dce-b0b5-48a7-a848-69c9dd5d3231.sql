
DROP FUNCTION IF EXISTS public.admin_stats();

CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS TABLE(
  users bigint,
  spaces bigint,
  active_spaces bigint,
  bookings bigint,
  completed_bookings bigint,
  total_revenue numeric,
  avg_trust_score numeric,
  open_disputes bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT count(*) FROM public.profiles),
    (SELECT count(*) FROM public.parking_spaces),
    (SELECT count(*) FROM public.parking_spaces WHERE is_active = true),
    (SELECT count(*) FROM public.bookings),
    (SELECT count(*) FROM public.bookings WHERE status = 'completed'),
    (SELECT coalesce(sum(total_price), 0) FROM public.bookings WHERE status = 'completed' AND payment_status = 'paid'),
    (SELECT coalesce(round(avg(trust_score)::numeric, 1), 0) FROM public.profiles),
    (SELECT count(*) FROM public.disputes WHERE status = 'open')
  WHERE public.has_role(auth.uid(),'admin');
$function$;
