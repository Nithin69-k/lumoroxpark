REVOKE EXECUTE ON FUNCTION public.grant_role(uuid, app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_role(uuid, app_role) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_role(uuid, app_role) TO service_role;