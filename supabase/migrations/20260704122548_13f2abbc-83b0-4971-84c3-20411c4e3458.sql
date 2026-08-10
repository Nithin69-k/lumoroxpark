
CREATE OR REPLACE FUNCTION public.admin_top_demand_areas(p_limit integer DEFAULT 5)
RETURNS TABLE(
  address text,
  bookings bigint,
  revenue numeric,
  active_listings bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    ps.address,
    count(b.id) AS bookings,
    coalesce(sum(b.total_price) FILTER (WHERE b.status = 'completed' AND b.payment_status = 'paid'), 0) AS revenue,
    count(DISTINCT ps.id) FILTER (WHERE ps.is_active) AS active_listings
  FROM public.parking_spaces ps
  LEFT JOIN public.bookings b ON b.space_id = ps.id
  WHERE public.has_role(auth.uid(), 'admin')
  GROUP BY ps.address
  ORDER BY bookings DESC, revenue DESC
  LIMIT greatest(p_limit, 1);
$function$;
