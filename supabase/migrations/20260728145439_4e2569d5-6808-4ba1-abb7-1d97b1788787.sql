-- 1. Financial ledger: no direct writes from API roles at all.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.wallet_transactions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.host_wallets FROM anon, authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
GRANT ALL ON public.host_wallets TO service_role;

-- Explicit deny-by-default write policies (documented intent: SECURITY DEFINER routines only).
DROP POLICY IF EXISTS "No direct ledger writes" ON public.wallet_transactions;
CREATE POLICY "No direct ledger writes"
  ON public.wallet_transactions
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Hosts view own ledger" ON public.wallet_transactions;
CREATE POLICY "Hosts view own ledger"
  ON public.wallet_transactions
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = host_id) OR public.has_role(auth.uid(), 'admin'::app_role));

-- The restrictive policy above blocks SELECT too; re-allow reads explicitly.
DROP POLICY IF EXISTS "No direct ledger writes" ON public.wallet_transactions;
CREATE POLICY "No direct ledger writes"
  ON public.wallet_transactions
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "No direct ledger updates" ON public.wallet_transactions;
CREATE POLICY "No direct ledger updates"
  ON public.wallet_transactions
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "No direct ledger deletes" ON public.wallet_transactions;
CREATE POLICY "No direct ledger deletes"
  ON public.wallet_transactions
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING (false);

-- 2. PostGIS system table: not application data, keep it out of the Data API.
DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON TABLE public.spatial_ref_sys FROM anon, authenticated';
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE NOTICE 'skipped spatial_ref_sys revoke';
END $$;

-- 3. Drop superseded overloads (app calls only the _env variants).
DROP FUNCTION IF EXISTS public.create_parking_space(text, text, text, double precision, double precision, numeric, numeric, text[], boolean, boolean, boolean, boolean, boolean, text[], text);
DROP FUNCTION IF EXISTS public.get_booking_charge(uuid);

-- 4. Shrink the callable SECURITY DEFINER surface.
REVOKE ALL ON FUNCTION public.is_host_pro(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.host_commission_rate(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS f
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'st_estimatedextent'
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.f);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'skipped %', r.f;
    END;
  END LOOP;
END $$;