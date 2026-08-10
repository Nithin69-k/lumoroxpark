
CREATE OR REPLACE FUNCTION public.seed_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_space1 uuid;
  v_space2 uuid;
  v_space3 uuid;
  v_booking1 uuid;
  v_booking2 uuid;
  v_booking3 uuid;
  v_booking4 uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  -- Ensure profile row exists (should already, but be safe)
  INSERT INTO public.profiles (id, full_name)
  VALUES (v_uid, 'Demo Admin')
  ON CONFLICT (id) DO NOTHING;

  -- Listings (tagged in title so we can clean them up)
  INSERT INTO public.parking_spaces (host_id, title, description, address, price_per_hour, price_per_day, has_camera, is_gated, is_covered, has_ev_charging, is_active)
  VALUES (v_uid, '[demo] Downtown Covered Garage', 'Secure covered parking near city center.', '123 Market St, Downtown', 6.50, 45.00, true, true, true, true, true)
  RETURNING id INTO v_space1;

  INSERT INTO public.parking_spaces (host_id, title, description, address, price_per_hour, price_per_day, has_camera, is_gated, is_covered, is_active)
  VALUES (v_uid, '[demo] Airport Long-Stay Lot', 'Perfect for weekend travel.', '500 Airport Rd, Terminal B', 3.00, 22.00, true, true, false, true)
  RETURNING id INTO v_space2;

  INSERT INTO public.parking_spaces (host_id, title, description, address, price_per_hour, is_active)
  VALUES (v_uid, '[demo] Residential Driveway', 'Quiet suburb driveway, easy access.', '42 Elm Ave, Suburbia', 2.25, true)
  RETURNING id INTO v_space3;

  -- Bookings across statuses (admin acts as both host and renter for demo)
  INSERT INTO public.bookings (space_id, renter_id, host_id, start_time, end_time, total_price, status, payment_status, checked_in_at, checked_out_at)
  VALUES (v_space1, v_uid, v_uid, now() - interval '3 days', now() - interval '2 days', 45.00, 'completed', 'paid', now() - interval '3 days', now() - interval '2 days')
  RETURNING id INTO v_booking1;

  INSERT INTO public.bookings (space_id, renter_id, host_id, start_time, end_time, total_price, status, payment_status, checked_in_at)
  VALUES (v_space2, v_uid, v_uid, now() - interval '1 hour', now() + interval '5 hours', 18.00, 'active', 'paid', now() - interval '1 hour')
  RETURNING id INTO v_booking2;

  INSERT INTO public.bookings (space_id, renter_id, host_id, start_time, end_time, total_price, status, payment_status)
  VALUES (v_space1, v_uid, v_uid, now() + interval '2 days', now() + interval '2 days 4 hours', 26.00, 'confirmed', 'paid')
  RETURNING id INTO v_booking3;

  INSERT INTO public.bookings (space_id, renter_id, host_id, start_time, end_time, total_price, status, payment_status)
  VALUES (v_space3, v_uid, v_uid, now() - interval '10 days', now() - interval '9 days', 22.50, 'completed', 'paid')
  RETURNING id INTO v_booking4;

  -- Disputes across statuses
  INSERT INTO public.disputes (booking_id, raised_by, reason, status)
  VALUES (v_booking1, v_uid, 'Space was not as described — gate was broken.', 'open');

  INSERT INTO public.disputes (booking_id, raised_by, reason, status, admin_notes)
  VALUES (v_booking4, v_uid, 'Vehicle was blocked in at checkout.', 'under_review', 'Investigating with host.');

  RETURN jsonb_build_object(
    'spaces', 3,
    'bookings', 4,
    'disputes', 2
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_demo_data() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.seed_demo_data() TO authenticated;


CREATE OR REPLACE FUNCTION public.reset_demo_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_removed int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  WITH deleted AS (
    DELETE FROM public.parking_spaces
    WHERE host_id = v_uid AND title LIKE '[demo]%'
    RETURNING 1
  )
  SELECT count(*) INTO v_removed FROM deleted;

  RETURN jsonb_build_object('spaces_removed', v_removed);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_demo_data() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reset_demo_data() TO authenticated;
