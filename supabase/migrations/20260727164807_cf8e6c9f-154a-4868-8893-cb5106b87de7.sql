-- ============================================================
-- 1. Cancellation policy on listings
-- ============================================================
ALTER TABLE public.parking_spaces
  ADD COLUMN IF NOT EXISTS cancellation_policy text NOT NULL DEFAULT 'moderate';

ALTER TABLE public.parking_spaces
  DROP CONSTRAINT IF EXISTS parking_spaces_cancellation_policy_check;
ALTER TABLE public.parking_spaces
  ADD CONSTRAINT parking_spaces_cancellation_policy_check
  CHECK (cancellation_policy IN ('flexible','moderate','strict'));

-- ============================================================
-- 2. Booking cancellation / refund / escrow columns
-- ============================================================
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS refund_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paddle_refund_id text,
  ADD COLUMN IF NOT EXISTS earnings_clear_at timestamptz,
  ADD COLUMN IF NOT EXISTS earnings_released_at timestamptz;

ALTER TABLE public.host_wallets
  ADD COLUMN IF NOT EXISTS pending_clearance numeric NOT NULL DEFAULT 0;

-- ============================================================
-- 3. Host Pro entitlement helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_host_pro(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = _user_id
      AND (
        (s.status IN ('active','trialing','past_due')
          AND (s.current_period_end IS NULL OR s.current_period_end > now()))
        OR (s.status = 'canceled' AND s.current_period_end > now())
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_host_pro(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_host_pro(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.host_commission_rate(_host_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN public.is_host_pro(_host_id) THEN 0.05 ELSE 0.10 END;
$$;

REVOKE ALL ON FUNCTION public.host_commission_rate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_commission_rate(uuid) TO authenticated, service_role;

-- ============================================================
-- 4. Listing cap for free hosts
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_parking_space(
  p_title text,
  p_description text,
  p_address text,
  p_lat double precision,
  p_lng double precision,
  p_price_per_hour numeric,
  p_price_per_day numeric,
  p_vehicle_types text[],
  p_is_covered boolean,
  p_is_gated boolean,
  p_has_ev_charging boolean,
  p_has_camera boolean,
  p_has_sensor boolean,
  p_photos text[],
  p_cancellation_policy text DEFAULT 'moderate'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF COALESCE(p_cancellation_policy,'moderate') NOT IN ('flexible','moderate','strict') THEN
    RAISE EXCEPTION 'Invalid cancellation policy';
  END IF;

  IF NOT public.is_host_pro(auth.uid()) THEN
    SELECT count(*) INTO v_count FROM public.parking_spaces WHERE host_id = auth.uid();
    IF v_count >= 2 THEN
      RAISE EXCEPTION 'Free hosts can list up to 2 spaces. Upgrade to Host Pro for unlimited listings.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.parking_spaces (
    host_id, title, description, address, location,
    price_per_hour, price_per_day, vehicle_types,
    is_covered, is_gated, has_ev_charging, has_camera, has_sensor,
    photos, is_active, cancellation_policy
  ) VALUES (
    auth.uid(), p_title, p_description, p_address,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_price_per_hour, p_price_per_day, p_vehicle_types,
    p_is_covered, p_is_gated, p_has_ev_charging, p_has_camera, p_has_sensor,
    COALESCE(p_photos, ARRAY[]::text[]), true, COALESCE(p_cancellation_policy,'moderate')
  ) RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_parking_space(text,text,text,double precision,double precision,numeric,numeric,text[],boolean,boolean,boolean,boolean,boolean,text[],text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_parking_space(text,text,text,double precision,double precision,numeric,numeric,text[],boolean,boolean,boolean,boolean,boolean,text[],text) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_listing_quota()
RETURNS TABLE(used integer, max_allowed integer, is_pro boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*)::integer FROM public.parking_spaces WHERE host_id = auth.uid()),
    CASE WHEN public.is_host_pro(auth.uid()) THEN 2147483647 ELSE 2 END,
    public.is_host_pro(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.my_listing_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_listing_quota() TO authenticated;

-- ============================================================
-- 5. Pricing: Pro commission
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_booking_charge(p_booking_id uuid)
RETURNS TABLE(base_amount numeric, platform_fee numeric, reservation_fee numeric, total numeric, credits integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b public.bookings; v_base numeric; v_fee numeric; v_res numeric := 1; v_rate numeric;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.renter_id <> auth.uid() THEN RAISE EXCEPTION 'Not your booking'; END IF;
  v_base := round(b.total_price::numeric, 2);
  v_rate := public.host_commission_rate(b.host_id);
  v_fee := round(v_base * v_rate, 2);
  IF v_base + v_fee > 500 THEN
    RAISE EXCEPTION 'Bookings above $500 cannot be paid online yet. Please shorten the reservation.';
  END IF;
  RETURN QUERY SELECT v_base, v_fee, v_res, round(v_base + v_fee + v_res, 2),
    GREATEST(1, ceil(v_base + v_fee)::integer);
END; $$;

REVOKE ALL ON FUNCTION public.get_booking_charge(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_booking_charge(uuid) TO authenticated;

-- ============================================================
-- 6. Settlement into escrow (pending clearance)
-- ============================================================
CREATE OR REPLACE FUNCTION public.settle_booking_payment(p_booking_id uuid, p_transaction_id text, p_amount_charged numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b public.bookings; v_fee numeric; v_res numeric := 1; v_earn numeric; v_rate numeric;
        v_pending numeric; v_space text; v_expected numeric;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.payment_status IN ('paid','refund_pending','refunded') THEN RETURN; END IF;

  v_rate := public.host_commission_rate(b.host_id);
  v_fee := round(b.total_price * v_rate, 2);
  v_earn := round(b.total_price - v_fee, 2);
  v_expected := round(b.total_price + v_fee + v_res, 2);

  IF p_amount_charged IS NOT NULL AND p_amount_charged < v_expected - 1 THEN
    RAISE EXCEPTION 'Underpayment for booking %: charged %, expected %', b.id, p_amount_charged, v_expected;
  END IF;

  UPDATE public.bookings SET
    payment_status = 'paid',
    status = 'confirmed',
    platform_fee = v_fee,
    reservation_fee = v_res,
    host_earning = v_earn,
    amount_charged = COALESCE(p_amount_charged, v_expected),
    paddle_transaction_id = p_transaction_id,
    qr_checkin_code = COALESCE(b.qr_checkin_code, encode(extensions.gen_random_bytes(9), 'hex')),
    earnings_clear_at = b.end_time + interval '24 hours',
    updated_at = now()
  WHERE id = b.id;

  INSERT INTO public.host_wallets(host_id) VALUES (b.host_id) ON CONFLICT (host_id) DO NOTHING;
  UPDATE public.host_wallets SET
    pending_clearance = pending_clearance + v_earn,
    updated_at = now()
  WHERE host_id = b.host_id
  RETURNING pending_clearance INTO v_pending;

  INSERT INTO public.wallet_transactions(host_id, booking_id, kind, amount, balance_after, note)
  VALUES (b.host_id, b.id, 'earning_pending', v_earn, v_pending,
    'Booking paid — held in clearance until 24h after the stay (net of ' || round(v_rate*100) || '% commission)');

  SELECT title INTO v_space FROM public.parking_spaces WHERE id = b.space_id;

  INSERT INTO public.notifications(user_id, kind, title, body, link, booking_id) VALUES
    (b.renter_id, 'booking_confirmed', 'Booking confirmed',
      'Your payment went through. Your check-in code is ready for ' || COALESCE(v_space,'your space') || '.', '/bookings', b.id),
    (b.host_id, 'payment', 'You earned ' || to_char(v_earn, 'FM999999990.00'),
      'A booking for ' || COALESCE(v_space,'your space') || ' was paid. Funds clear 24h after the stay ends.', '/host/earnings', b.id);
END; $$;

REVOKE ALL ON FUNCTION public.settle_booking_payment(uuid, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_booking_payment(uuid, text, numeric) TO service_role;

-- ============================================================
-- 7. Escrow release job
-- ============================================================
CREATE OR REPLACE FUNCTION public.release_cleared_earnings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b record; v_bal numeric; v_n integer := 0;
BEGIN
  FOR b IN
    SELECT * FROM public.bookings
    WHERE payment_status = 'paid'
      AND status <> 'cancelled'
      AND host_earning > 0
      AND earnings_released_at IS NULL
      AND earnings_clear_at IS NOT NULL
      AND earnings_clear_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM public.disputes d
        WHERE d.booking_id = bookings.id AND d.status IN ('open','under_review')
      )
    FOR UPDATE
  LOOP
    UPDATE public.host_wallets SET
      pending_clearance = GREATEST(0, pending_clearance - b.host_earning),
      available_balance = available_balance + b.host_earning,
      lifetime_earnings = lifetime_earnings + b.host_earning,
      updated_at = now()
    WHERE host_id = b.host_id
    RETURNING available_balance INTO v_bal;

    UPDATE public.bookings SET earnings_released_at = now(), updated_at = now() WHERE id = b.id;

    INSERT INTO public.wallet_transactions(host_id, booking_id, kind, amount, balance_after, note)
    VALUES (b.host_id, b.id, 'earning_cleared', b.host_earning, COALESCE(v_bal,0),
      'Earnings cleared and available to withdraw');

    INSERT INTO public.notifications(user_id, kind, title, body, link, booking_id)
    VALUES (b.host_id, 'payment', 'Earnings cleared',
      to_char(b.host_earning,'FM999999990.00') || ' is now available to withdraw.', '/host/earnings', b.id);

    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END; $$;

REVOKE ALL ON FUNCTION public.release_cleared_earnings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_cleared_earnings() TO service_role;

-- ============================================================
-- 8. Cancellation quote + policy-driven cancellation with refund
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancellation_cutoff_hours(_policy text)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$ SELECT CASE _policy WHEN 'flexible' THEN 1 WHEN 'strict' THEN 24 ELSE 12 END; $$;

CREATE OR REPLACE FUNCTION public.get_cancellation_quote(p_booking_id uuid)
RETURNS TABLE(policy text, cutoff_hours integer, hours_until_start numeric, refundable boolean, refund_amount numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b public.bookings; v_policy text; v_cut integer; v_hours numeric; v_ok boolean;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF auth.uid() NOT IN (b.renter_id, b.host_id) THEN RAISE EXCEPTION 'Not your booking'; END IF;

  SELECT s.cancellation_policy INTO v_policy FROM public.parking_spaces s WHERE s.id = b.space_id;
  v_policy := COALESCE(v_policy, 'moderate');
  v_cut := public.cancellation_cutoff_hours(v_policy);
  v_hours := round(EXTRACT(epoch FROM (b.start_time - now())) / 3600.0, 2);
  v_ok := (b.payment_status = 'paid') AND (auth.uid() = b.host_id OR v_hours >= v_cut);

  RETURN QUERY SELECT v_policy, v_cut, v_hours, v_ok,
    CASE WHEN v_ok THEN round(b.amount_charged, 2) ELSE 0::numeric END;
END; $$;

REVOKE ALL ON FUNCTION public.get_cancellation_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cancellation_quote(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid, p_reason text DEFAULT NULL)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_role text;
  v_policy text;
  v_cut integer;
  v_hours numeric;
  v_refund numeric := 0;
  v_bal numeric;
  v_space text;
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

  SELECT s.cancellation_policy, s.title INTO v_policy, v_space
    FROM public.parking_spaces s WHERE s.id = v_booking.space_id;
  v_policy := COALESCE(v_policy, 'moderate');
  v_cut := public.cancellation_cutoff_hours(v_policy);
  v_hours := EXTRACT(epoch FROM (v_booking.start_time - now())) / 3600.0;

  IF v_booking.payment_status = 'paid'
     AND (v_role = 'host' OR v_hours >= v_cut) THEN
    v_refund := round(v_booking.amount_charged, 2);
  END IF;

  UPDATE public.bookings
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      cancellation_reason = p_reason,
      refund_amount = v_refund,
      payment_status = CASE WHEN v_refund > 0 THEN 'refund_pending' ELSE payment_status END,
      updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  -- Reverse the host's credit when a refund is owed
  IF v_refund > 0 AND v_booking.host_earning > 0 THEN
    IF v_booking.earnings_released_at IS NULL THEN
      UPDATE public.host_wallets SET
        pending_clearance = GREATEST(0, pending_clearance - v_booking.host_earning),
        updated_at = now()
      WHERE host_id = v_booking.host_id
      RETURNING available_balance INTO v_bal;
    ELSE
      UPDATE public.host_wallets SET
        available_balance = GREATEST(0, available_balance - v_booking.host_earning),
        lifetime_earnings = GREATEST(0, lifetime_earnings - v_booking.host_earning),
        updated_at = now()
      WHERE host_id = v_booking.host_id
      RETURNING available_balance INTO v_bal;
    END IF;

    INSERT INTO public.wallet_transactions(host_id, booking_id, kind, amount, balance_after, note)
    VALUES (v_booking.host_id, v_booking.id, 'refund_reversal', -v_booking.host_earning, COALESCE(v_bal,0),
      'Booking cancelled — earnings reversed for refund');
  END IF;

  INSERT INTO public.notifications(user_id, kind, title, body, link, booking_id) VALUES
    (v_booking.renter_id, 'info',
      CASE WHEN v_refund > 0 THEN 'Booking cancelled — refund on the way' ELSE 'Booking cancelled' END,
      CASE WHEN v_refund > 0
        THEN 'Your refund of ' || to_char(v_refund,'FM999999990.00') || ' is being processed.'
        ELSE 'This booking was cancelled. The ' || v_policy || ' policy cutoff (' || v_cut || 'h before start) had passed, so no refund applies.' END,
      '/bookings', v_booking.id),
    (v_booking.host_id, 'info', 'Booking cancelled',
      'A booking for ' || COALESCE(v_space,'your space') || ' was cancelled by the ' || v_role || '.',
      '/host', v_booking.id);

  INSERT INTO public.activity_log (user_id, action, reference_id, metadata)
  VALUES (auth.uid(), 'booking_cancelled', p_booking_id,
          jsonb_build_object('role', v_role, 'reason', p_reason, 'policy', v_policy, 'refund', v_refund));

  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_booking(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid, text) TO authenticated;

-- Service-role helpers for the refund worker / webhook
CREATE OR REPLACE FUNCTION public.get_refund_job(p_booking_id uuid)
RETURNS TABLE(transaction_id text, refund_amount numeric, payment_status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT paddle_transaction_id, refund_amount, payment_status
  FROM public.bookings WHERE id = p_booking_id;
$$;

REVOKE ALL ON FUNCTION public.get_refund_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_refund_job(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_booking_refunded(p_booking_id uuid, p_refund_id text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b public.bookings;
BEGIN
  UPDATE public.bookings
  SET payment_status = 'refunded',
      paddle_refund_id = COALESCE(p_refund_id, paddle_refund_id),
      updated_at = now()
  WHERE id = p_booking_id AND payment_status <> 'refunded'
  RETURNING * INTO b;

  IF b.id IS NULL THEN RETURN; END IF;

  INSERT INTO public.notifications(user_id, kind, title, body, link, booking_id)
  VALUES (b.renter_id, 'payment', 'Refund issued',
    to_char(GREATEST(b.refund_amount, 0),'FM999999990.00') || ' has been refunded to your original payment method.',
    '/bookings', b.id);
END; $$;

REVOKE ALL ON FUNCTION public.mark_booking_refunded(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_booking_refunded(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_booking_refunded_by_transaction(p_transaction_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.bookings WHERE paddle_transaction_id = p_transaction_id LIMIT 1;
  IF v_id IS NOT NULL THEN PERFORM public.mark_booking_refunded(v_id, NULL); END IF;
END; $$;

REVOKE ALL ON FUNCTION public.mark_booking_refunded_by_transaction(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_booking_refunded_by_transaction(text) TO service_role;

-- ============================================================
-- 9. Search + detail: featured Pro placement and policy
-- ============================================================
DROP FUNCTION IF EXISTS public.search_spaces(double precision,double precision,double precision,timestamptz,timestamptz,boolean,boolean,boolean,numeric);

CREATE FUNCTION public.search_spaces(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision DEFAULT 10,
  p_starts timestamptz DEFAULT NULL,
  p_ends timestamptz DEFAULT NULL,
  p_covered boolean DEFAULT NULL,
  p_gated boolean DEFAULT NULL,
  p_ev boolean DEFAULT NULL,
  p_max_price numeric DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  address text,
  lat double precision,
  lng double precision,
  price_per_hour numeric,
  price_per_day numeric,
  photos text[],
  is_covered boolean,
  is_gated boolean,
  has_ev_charging boolean,
  has_camera boolean,
  vehicle_types text[],
  live_occupancy_status text,
  distance_km double precision,
  host_id uuid,
  cancellation_policy text,
  is_featured boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.title, s.address,
    ST_Y(s.location::geometry) AS lat,
    ST_X(s.location::geometry) AS lng,
    s.price_per_hour, s.price_per_day, s.photos,
    s.is_covered, s.is_gated, s.has_ev_charging, s.has_camera,
    s.vehicle_types, s.live_occupancy_status,
    ST_Distance(
      s.location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) / 1000.0 AS distance_km,
    s.host_id,
    s.cancellation_policy,
    public.is_host_pro(s.host_id) AS is_featured
  FROM public.parking_spaces s
  WHERE s.is_active = true
    AND ST_DWithin(
      s.location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_km * 1000
    )
    AND (p_covered   IS NULL OR s.is_covered      = p_covered)
    AND (p_gated     IS NULL OR s.is_gated        = p_gated)
    AND (p_ev        IS NULL OR s.has_ev_charging = p_ev)
    AND (p_max_price IS NULL OR s.price_per_hour <= p_max_price)
    AND (
      p_starts IS NULL OR p_ends IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.space_id = s.id
          AND b.status IN ('confirmed','active')
          AND tstzrange(b.start_time, b.end_time, '[)') && tstzrange(p_starts, p_ends, '[)')
      )
    )
  ORDER BY public.is_host_pro(s.host_id) DESC, distance_km ASC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.search_spaces(double precision,double precision,double precision,timestamptz,timestamptz,boolean,boolean,boolean,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_spaces(double precision,double precision,double precision,timestamptz,timestamptz,boolean,boolean,boolean,numeric) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_space_detail(uuid);

CREATE FUNCTION public.get_space_detail(p_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  address text,
  lat double precision,
  lng double precision,
  price_per_hour numeric,
  price_per_day numeric,
  photos text[],
  is_covered boolean,
  is_gated boolean,
  has_ev_charging boolean,
  has_camera boolean,
  has_sensor boolean,
  vehicle_types text[],
  live_occupancy_status text,
  host_id uuid,
  host_name text,
  host_rating numeric,
  host_trust_score integer,
  cancellation_policy text,
  is_featured boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.title, s.description, s.address,
    ST_Y(s.location::geometry), ST_X(s.location::geometry),
    s.price_per_hour, s.price_per_day, s.photos,
    s.is_covered, s.is_gated, s.has_ev_charging, s.has_camera, s.has_sensor,
    s.vehicle_types, s.live_occupancy_status,
    p.id, p.full_name, p.rating, p.trust_score,
    s.cancellation_policy,
    public.is_host_pro(s.host_id)
  FROM public.parking_spaces s
  JOIN public.profiles p ON p.id = s.host_id
  WHERE s.id = p_id AND s.is_active = true;
$$;

REVOKE ALL ON FUNCTION public.get_space_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_space_detail(uuid) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_host_pro(uuid) TO anon;

-- ============================================================
-- 10. Wallet read + payout ledger fix
-- ============================================================
DROP FUNCTION IF EXISTS public.get_my_wallet();

CREATE FUNCTION public.get_my_wallet()
RETURNS TABLE(lifetime_earnings numeric, available_balance numeric, pending_clearance numeric, pending_payout numeric, total_paid_out numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(w.lifetime_earnings,0), COALESCE(w.available_balance,0),
         COALESCE(w.pending_clearance,0), COALESCE(w.pending_payout,0), COALESCE(w.total_paid_out,0)
  FROM (SELECT auth.uid() AS uid) u
  LEFT JOIN public.host_wallets w ON w.host_id = u.uid;
$$;

REVOKE ALL ON FUNCTION public.get_my_wallet() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_wallet() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_process_payout(p_payout_id uuid, p_action text, p_notes text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.payout_requests; v_bal numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO r FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Payout not found'; END IF;
  IF r.status NOT IN ('pending','approved') THEN RAISE EXCEPTION 'Payout already finalised'; END IF;

  IF p_action = 'approve' THEN
    UPDATE public.payout_requests SET status = 'approved', admin_notes = COALESCE(p_notes, admin_notes) WHERE id = r.id;
  ELSIF p_action = 'paid' THEN
    UPDATE public.payout_requests SET status = 'paid', processed_at = now(), admin_notes = COALESCE(p_notes, admin_notes) WHERE id = r.id;
    UPDATE public.host_wallets
      SET pending_payout = GREATEST(0, pending_payout - r.amount),
          total_paid_out = total_paid_out + r.amount, updated_at = now()
      WHERE host_id = r.host_id RETURNING available_balance INTO v_bal;
    INSERT INTO public.wallet_transactions(host_id, payout_id, kind, amount, balance_after, note)
    VALUES (r.host_id, r.id, 'payout_paid', -r.amount, COALESCE(v_bal,0), 'Payout sent to bank account');
    INSERT INTO public.notifications(user_id, kind, title, body, link)
    VALUES (r.host_id, 'payment', 'Payout sent', 'Your payout of ' || to_char(r.amount,'FM999999990.00') || ' has been sent to your bank.', '/host/earnings');
  ELSIF p_action = 'reject' THEN
    UPDATE public.payout_requests SET status = 'rejected', processed_at = now(), admin_notes = COALESCE(p_notes, admin_notes) WHERE id = r.id;
    UPDATE public.host_wallets
      SET pending_payout = GREATEST(0, pending_payout - r.amount),
          available_balance = available_balance + r.amount, updated_at = now()
      WHERE host_id = r.host_id RETURNING available_balance INTO v_bal;
    INSERT INTO public.wallet_transactions(host_id, payout_id, kind, amount, balance_after, note)
    VALUES (r.host_id, r.id, 'payout_reverted', r.amount, COALESCE(v_bal,0), 'Payout rejected — amount returned to available balance');
    INSERT INTO public.notifications(user_id, kind, title, body, link)
    VALUES (r.host_id, 'payment', 'Payout rejected', COALESCE(p_notes, 'Your payout request was rejected and the funds returned to your balance.'), '/host/earnings');
  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.admin_process_payout(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_process_payout(uuid, text, text) TO authenticated;

-- ============================================================
-- 11. Host Pro analytics (Pro-gated)
-- ============================================================
CREATE OR REPLACE FUNCTION public.host_earnings_analytics()
RETURNS TABLE(month date, bookings bigint, gross numeric, net numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT public.is_host_pro(auth.uid()) THEN
    RAISE EXCEPTION 'Host Pro required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
    SELECT date_trunc('month', b.start_time)::date,
           count(*)::bigint,
           round(sum(b.total_price),2),
           round(sum(b.host_earning),2)
    FROM public.bookings b
    WHERE b.host_id = auth.uid()
      AND b.payment_status IN ('paid','refunded','refund_pending')
      AND b.start_time > now() - interval '12 months'
    GROUP BY 1 ORDER BY 1;
END; $$;

REVOKE ALL ON FUNCTION public.host_earnings_analytics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_earnings_analytics() TO authenticated;

-- ============================================================
-- 12. Hourly escrow release cron
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('release-cleared-earnings');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'release-cleared-earnings',
  '7 * * * *',
  $$SELECT public.release_cleared_earnings();$$
);