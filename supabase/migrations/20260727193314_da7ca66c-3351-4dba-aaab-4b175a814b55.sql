-- 1. bookings
DROP POLICY IF EXISTS "Users view own bookings" ON public.bookings;
CREATE POLICY "Users view own bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING ((auth.uid() = renter_id) OR (auth.uid() = host_id));

-- 2. disputes
DROP POLICY IF EXISTS "Involved parties view disputes" ON public.disputes;
CREATE POLICY "Involved parties view disputes" ON public.disputes
  FOR SELECT TO authenticated
  USING (booking_id IN (
    SELECT bookings.id FROM public.bookings
    WHERE bookings.renter_id = auth.uid() OR bookings.host_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users raise disputes on own bookings" ON public.disputes;
CREATE POLICY "Users raise disputes on own bookings" ON public.disputes
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = raised_by) AND booking_id IN (
    SELECT bookings.id FROM public.bookings
    WHERE bookings.renter_id = auth.uid() OR bookings.host_id = auth.uid()
  ));

-- 3. parking_spaces: consolidate duplicate public read policies, scope writes
DROP POLICY IF EXISTS "Active spaces are viewable by everyone" ON public.parking_spaces;
DROP POLICY IF EXISTS "Anyone can view active spaces" ON public.parking_spaces;
CREATE POLICY "Active spaces are viewable by everyone" ON public.parking_spaces
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR host_id = auth.uid());

DROP POLICY IF EXISTS "Hosts insert own spaces" ON public.parking_spaces;
CREATE POLICY "Hosts insert own spaces" ON public.parking_spaces
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "Hosts update own spaces" ON public.parking_spaces;
CREATE POLICY "Hosts update own spaces" ON public.parking_spaces
  FOR UPDATE TO authenticated USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "Hosts delete own spaces" ON public.parking_spaces;
CREATE POLICY "Hosts delete own spaces" ON public.parking_spaces
  FOR DELETE TO authenticated USING (auth.uid() = host_id);

-- 4. activity_log
DROP POLICY IF EXISTS "Users view own activity" ON public.activity_log;
CREATE POLICY "Users view own activity" ON public.activity_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own activity" ON public.activity_log;
CREATE POLICY "Users insert own activity" ON public.activity_log
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 5. SECURITY DEFINER routines: drop residual PUBLIC/anon execute everywhere
--    except the two intentionally public listing-browse routines.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname NOT IN ('search_spaces', 'get_space_detail')
      AND pg_get_userbyid(p.proowner) <> 'supabase_admin'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.search_spaces(double precision, double precision, double precision, timestamptz, timestamptz, boolean, boolean, boolean, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_spaces(double precision, double precision, double precision, timestamptz, timestamptz, boolean, boolean, boolean, numeric) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_space_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_space_detail(uuid) TO anon, authenticated;