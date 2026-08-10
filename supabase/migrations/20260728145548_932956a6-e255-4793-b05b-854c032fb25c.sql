DO $$
BEGIN
  BEGIN
    SET LOCAL ROLE supabase_admin;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'could not assume supabase_admin';
  END;

  BEGIN
    EXECUTE 'REVOKE ALL ON TABLE public.spatial_ref_sys FROM PUBLIC, anon, authenticated';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'spatial_ref_sys revoke skipped: %', SQLERRM;
  END;

  DECLARE r record;
  BEGIN
    FOR r IN
      SELECT p.oid::regprocedure AS f
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'st_estimatedextent'
    LOOP
      BEGIN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.f);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'skipped %: %', r.f, SQLERRM;
      END;
    END LOOP;
  END;

  RESET ROLE;
END $$;

REVOKE ALL ON public.wallet_transactions FROM anon;