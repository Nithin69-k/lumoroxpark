
-- Check-in via QR code (host scans renter's code)
CREATE OR REPLACE FUNCTION public.checkin_booking(p_qr_code text)
RETURNS TABLE (booking_id uuid, space_title text, renter_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_b record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT b.id, b.space_id, b.host_id, b.renter_id, b.status, s.title
    INTO v_b
  FROM public.bookings b
  JOIN public.parking_spaces s ON s.id = b.space_id
  WHERE b.qr_checkin_code = p_qr_code
  LIMIT 1;

  IF v_b.id IS NULL THEN RAISE EXCEPTION 'Invalid check-in code'; END IF;
  IF v_b.host_id <> v_uid THEN RAISE EXCEPTION 'Only the host can check in this booking'; END IF;
  IF v_b.status = 'active' THEN RAISE EXCEPTION 'Already checked in'; END IF;
  IF v_b.status NOT IN ('pending','confirmed') THEN RAISE EXCEPTION 'Booking is %', v_b.status; END IF;

  UPDATE public.bookings
     SET status = 'active', checked_in_at = now(), updated_at = now()
   WHERE id = v_b.id;

  UPDATE public.parking_spaces
     SET live_occupancy_status = 'occupied', updated_at = now()
   WHERE id = v_b.space_id;

  RETURN QUERY
  SELECT v_b.id, v_b.title,
         COALESCE((SELECT full_name FROM public.profiles WHERE id = v_b.renter_id), 'Renter');
END;
$$;

GRANT EXECUTE ON FUNCTION public.checkin_booking(text) TO authenticated;

-- Check-out (either party can complete)
CREATE OR REPLACE FUNCTION public.checkout_booking(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_b record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF v_uid <> v_b.host_id AND v_uid <> v_b.renter_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_b.status <> 'active' THEN RAISE EXCEPTION 'Booking is % (must be active)', v_b.status; END IF;

  UPDATE public.bookings
     SET status = 'completed', checked_out_at = now(), updated_at = now()
   WHERE id = p_booking_id;

  UPDATE public.parking_spaces
     SET live_occupancy_status = 'available', updated_at = now()
   WHERE id = v_b.space_id;

  UPDATE public.profiles SET total_bookings = total_bookings + 1 WHERE id = v_b.host_id;
  UPDATE public.profiles SET total_bookings = total_bookings + 1 WHERE id = v_b.renter_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.checkout_booking(uuid) TO authenticated;

-- Renter submits review of host
CREATE OR REPLACE FUNCTION public.submit_review(
  p_booking_id uuid, p_rating int, p_comment text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_b record;
  v_review_id uuid;
  v_avg numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'Rating must be 1..5'; END IF;

  SELECT * INTO v_b FROM public.bookings WHERE id = p_booking_id;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF v_uid <> v_b.renter_id THEN RAISE EXCEPTION 'Only renter can review'; END IF;
  IF v_b.status <> 'completed' THEN RAISE EXCEPTION 'Booking not completed yet'; END IF;

  IF EXISTS (SELECT 1 FROM public.reviews WHERE booking_id = p_booking_id AND reviewer_id = v_uid) THEN
    RAISE EXCEPTION 'Already reviewed';
  END IF;

  INSERT INTO public.reviews (booking_id, reviewer_id, reviewee_id, space_id, rating, comment)
  VALUES (p_booking_id, v_uid, v_b.host_id, v_b.space_id, p_rating, NULLIF(p_comment,''))
  RETURNING id INTO v_review_id;

  SELECT AVG(rating)::numeric(3,2) INTO v_avg
    FROM public.reviews WHERE reviewee_id = v_b.host_id;

  UPDATE public.profiles
     SET rating = COALESCE(v_avg, 0),
         trust_score = LEAST(100, 50 + LEAST(50, total_bookings * 2) + (COALESCE(v_avg,0)::int * 2))
   WHERE id = v_b.host_id;

  RETURN v_review_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_review(uuid,int,text) TO authenticated;

-- Live occupancy realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.parking_spaces;
ALTER TABLE public.parking_spaces REPLICA IDENTITY FULL;

-- Reviews: public read (they're social proof)
DROP POLICY IF EXISTS "Anyone can view reviews" ON public.reviews;
CREATE POLICY "Anyone can view reviews" ON public.reviews FOR SELECT USING (true);
GRANT SELECT ON public.reviews TO anon, authenticated;
