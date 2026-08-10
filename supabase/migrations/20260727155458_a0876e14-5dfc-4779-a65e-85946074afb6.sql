-- 1) Scope profile visibility
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

CREATE POLICY "Profiles visible to self, counterparties and admins"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.users_share_booking(auth.uid(), id)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 2) Internal helpers should never be callable directly through the API
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_booking_party(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.users_share_booking(uuid, uuid) FROM anon, authenticated, public;

-- 3) PostGIS estimated-extent helpers are SECURITY DEFINER and not used by the app
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND p.proname = 'st_estimatedextent'
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated, public', fn.sig);
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END $$;

-- 4) PostGIS reference table: enable RLS if we own it, and keep it off the API either way
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY';
  EXCEPTION WHEN insufficient_privilege OR wrong_object_type THEN NULL;
  END;
  BEGIN
    EXECUTE 'REVOKE ALL ON TABLE public.spatial_ref_sys FROM anon, authenticated, public';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;