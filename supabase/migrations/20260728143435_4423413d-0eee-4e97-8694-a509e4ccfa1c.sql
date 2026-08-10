CREATE OR REPLACE FUNCTION public.get_booking_charge(p_booking_id uuid, p_env text DEFAULT 'live')
RETURNS TABLE(base_amount numeric, platform_fee numeric, reservation_fee numeric, total numeric, credits integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b public.bookings; v_base numeric; v_fee numeric; v_res numeric := 1; v_rate numeric;
        v_credits integer;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.renter_id <> auth.uid() THEN RAISE EXCEPTION 'Not your booking'; END IF;
  v_base := round(b.total_price::numeric, 2);
  v_rate := public.host_commission_rate(b.host_id, p_env);
  v_fee := round(v_base * v_rate, 2);
  IF v_base + v_fee > 500 THEN
    RAISE EXCEPTION 'Bookings above $500 cannot be paid online yet. Please shorten the reservation.';
  END IF;
  -- Parking is sold in whole $1 credits, so the quote is rounded up to match
  -- exactly what the checkout will charge.
  v_credits := GREATEST(1, ceil(v_base + v_fee)::integer);
  RETURN QUERY SELECT v_base, v_fee, v_res, (v_credits + v_res)::numeric, v_credits;
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_booking_charge(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_booking_charge(uuid, text) TO authenticated;