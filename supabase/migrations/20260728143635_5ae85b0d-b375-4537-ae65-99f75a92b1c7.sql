DROP FUNCTION IF EXISTS public.my_listing_quota();
CREATE OR REPLACE FUNCTION public.my_listing_quota(p_env text DEFAULT 'live')
RETURNS TABLE(used integer, max_allowed integer, is_pro boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    (SELECT count(*)::integer FROM public.parking_spaces WHERE host_id = auth.uid()),
    CASE WHEN public.is_host_pro(auth.uid(), p_env) THEN 2147483647 ELSE 2 END,
    public.is_host_pro(auth.uid(), p_env);
$$;
REVOKE EXECUTE ON FUNCTION public.my_listing_quota(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_listing_quota(text) TO authenticated;