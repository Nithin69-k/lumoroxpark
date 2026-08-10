
-- 1) BOOKINGS: remove permissive INSERT/UPDATE policies; all writes go through SECURITY DEFINER RPCs
DROP POLICY IF EXISTS "Renters create bookings" ON public.bookings;
DROP POLICY IF EXISTS "Involved parties update bookings" ON public.bookings;

CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid, p_reason text DEFAULT NULL)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_booking.renter_id = auth.uid() THEN
    v_role := 'renter';
  ELSIF v_booking.host_id = auth.uid() THEN
    v_role := 'host';
  ELSE
    RAISE EXCEPTION 'Only the renter or host can cancel this booking' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status = 'cancelled' THEN
    RAISE EXCEPTION 'Booking is already cancelled' USING ERRCODE = '22023';
  END IF;
  IF v_booking.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'Booking cannot be cancelled from status %', v_booking.status USING ERRCODE = '22023';
  END IF;
  IF v_booking.checked_in_at IS NOT NULL THEN
    RAISE EXCEPTION 'Booking already checked in and cannot be cancelled' USING ERRCODE = '22023';
  END IF;

  UPDATE public.bookings
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  INSERT INTO public.activity_log (user_id, action, reference_id, metadata)
  VALUES (auth.uid(), 'booking_cancelled', p_booking_id,
          jsonb_build_object('role', v_role, 'reason', p_reason));

  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_booking(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid, text) TO authenticated;

-- 2) REVIEWS: remove permissive INSERT policy; enforce via submit_review RPC + uniqueness
DROP POLICY IF EXISTS "Reviewers insert own reviews" ON public.reviews;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_booking_reviewer_unique
  ON public.reviews (booking_id, reviewer_id);

-- 3) PROFILES phone exposure: move phone into a private table
CREATE TABLE IF NOT EXISTS public.profile_contacts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_contacts TO authenticated;
GRANT ALL ON public.profile_contacts TO service_role;

ALTER TABLE public.profile_contacts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.users_share_booking(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE (b.renter_id = _a AND b.host_id = _b)
       OR (b.renter_id = _b AND b.host_id = _a)
  );
$$;

REVOKE ALL ON FUNCTION public.users_share_booking(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.users_share_booking(uuid, uuid) TO authenticated;

CREATE POLICY "Owner manages own phone" ON public.profile_contacts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Booking counterparties view phone" ON public.profile_contacts
  FOR SELECT TO authenticated
  USING (public.users_share_booking(auth.uid(), user_id));

INSERT INTO public.profile_contacts (user_id, phone)
SELECT id, phone FROM public.profiles WHERE phone IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS phone;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column' AND pronamespace = 'public'::regnamespace) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS profile_contacts_set_updated_at ON public.profile_contacts';
    EXECUTE 'CREATE TRIGGER profile_contacts_set_updated_at BEFORE UPDATE ON public.profile_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
  END IF;
END $$;

-- 4) spatial_ref_sys: cannot enable RLS (owned by postgis extension); revoke Data API access instead
REVOKE ALL ON TABLE public.spatial_ref_sys FROM PUBLIC, anon, authenticated;

-- 5) Revoke public/signed-in EXECUTE on PostGIS st_estimatedextent overloads
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text, boolean) FROM PUBLIC, anon, authenticated;
