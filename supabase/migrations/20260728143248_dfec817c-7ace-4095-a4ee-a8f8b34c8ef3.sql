-- 1. Environment-aware entitlement -------------------------------------------
DROP FUNCTION IF EXISTS public.is_host_pro(uuid);
CREATE OR REPLACE FUNCTION public.is_host_pro(_user_id uuid, _env text DEFAULT 'live')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = _user_id
      AND s.environment = COALESCE(_env, 'live')
      AND (
        (s.status IN ('active','trialing','past_due')
          AND (s.current_period_end IS NULL OR s.current_period_end > now()))
        OR (s.status = 'canceled' AND s.current_period_end > now())
      )
  );
$$;

DROP FUNCTION IF EXISTS public.host_commission_rate(uuid);
CREATE OR REPLACE FUNCTION public.host_commission_rate(_host_id uuid, _env text DEFAULT 'live')
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN public.is_host_pro(_host_id, _env) THEN 0.05 ELSE 0.10 END;
$$;

-- 2. Checkout hold on pending bookings ----------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_bookings_hold ON public.bookings(space_id, hold_expires_at)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.create_pending_booking(p_space_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hours numeric; v_price_per_hour numeric; v_host_id uuid; v_total numeric; v_booking_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_end <= p_start THEN RAISE EXCEPTION 'End must be after start'; END IF;

  SELECT s.price_per_hour, s.host_id INTO v_price_per_hour, v_host_id
  FROM public.parking_spaces s WHERE s.id = p_space_id AND s.is_active = true;

  IF v_host_id IS NULL THEN RAISE EXCEPTION 'Space not found or inactive'; END IF;
  IF v_host_id = v_uid THEN RAISE EXCEPTION 'Cannot book your own space'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.space_id = p_space_id
      AND (
        b.status IN ('confirmed','active')
        OR (b.status = 'pending' AND b.payment_status <> 'paid'
            AND b.hold_expires_at IS NOT NULL AND b.hold_expires_at > now()
            AND b.renter_id <> v_uid)
      )
      AND tstzrange(b.start_time, b.end_time, '[)') && tstzrange(p_start, p_end, '[)')
  ) THEN
    RAISE EXCEPTION 'Time slot no longer available';
  END IF;

  v_hours := EXTRACT(EPOCH FROM (p_end - p_start)) / 3600.0;
  v_total := ROUND(v_hours * v_price_per_hour, 2);

  INSERT INTO public.bookings (
    space_id, renter_id, host_id, start_time, end_time, total_price,
    status, payment_status, qr_checkin_code, hold_expires_at
  ) VALUES (
    p_space_id, v_uid, v_host_id, p_start, p_end, v_total,
    'pending', 'pending', encode(extensions.gen_random_bytes(8), 'hex'), now() + interval '15 minutes'
  ) RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END; $$;

CREATE OR REPLACE FUNCTION public.expire_pending_bookings()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n integer;
BEGIN
  WITH expired AS (
    UPDATE public.bookings
    SET status = 'cancelled', cancelled_at = now(),
        cancellation_reason = 'Checkout not completed in time', updated_at = now()
    WHERE status = 'pending' AND payment_status <> 'paid'
      AND hold_expires_at IS NOT NULL AND hold_expires_at < now() - interval '5 minutes'
    RETURNING id
  )
  SELECT count(*) INTO v_n FROM expired;
  RETURN v_n;
END; $$;

-- 3. Exact-cent pricing --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_booking_charge(p_booking_id uuid, p_env text DEFAULT 'live')
RETURNS TABLE(base_amount numeric, platform_fee numeric, reservation_fee numeric, total numeric, credits integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b public.bookings; v_base numeric; v_fee numeric; v_res numeric := 1; v_rate numeric;
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
  RETURN QUERY SELECT v_base, v_fee, v_res, round(v_base + v_fee + v_res, 2),
    GREATEST(1, round((v_base + v_fee) * 100)::integer);
END; $$;

-- 4. Settlement: conflict detection + env-aware commission ---------------------
DROP FUNCTION IF EXISTS public.settle_booking_payment(uuid, text, numeric);
CREATE OR REPLACE FUNCTION public.settle_booking_payment(
  p_booking_id uuid, p_transaction_id text, p_amount_charged numeric, p_env text DEFAULT 'live')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b public.bookings; v_fee numeric; v_res numeric := 1; v_earn numeric; v_rate numeric;
        v_pending numeric; v_space text; v_expected numeric;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.payment_status IN ('paid','refund_pending','refunded') THEN RETURN 'already_settled'; END IF;

  -- Somebody else confirmed this slot while the driver was paying.
  IF EXISTS (
    SELECT 1 FROM public.bookings o
    WHERE o.space_id = b.space_id AND o.id <> b.id
      AND o.status IN ('confirmed','active')
      AND tstzrange(o.start_time, o.end_time, '[)') && tstzrange(b.start_time, b.end_time, '[)')
  ) THEN
    UPDATE public.bookings SET
      status = 'cancelled', payment_status = 'refund_pending',
      cancelled_at = now(), cancellation_reason = 'Slot was taken before payment completed',
      amount_charged = COALESCE(p_amount_charged, 0),
      refund_amount = COALESCE(p_amount_charged, 0),
      paddle_transaction_id = p_transaction_id, updated_at = now()
    WHERE id = b.id;

    INSERT INTO public.notifications(user_id, kind, title, body, link, booking_id)
    VALUES (b.renter_id, 'payment', 'Reservation unavailable — refund on the way',
      'Another driver confirmed this slot first, so your payment is being refunded in full.',
      '/bookings', b.id);
    RETURN 'conflict';
  END IF;

  v_rate := public.host_commission_rate(b.host_id, p_env);
  v_fee := round(b.total_price * v_rate, 2);
  v_earn := round(b.total_price - v_fee, 2);
  v_expected := round(b.total_price + v_fee + v_res, 2);

  IF p_amount_charged IS NOT NULL AND p_amount_charged < v_expected - 0.05 THEN
    RAISE EXCEPTION 'Underpayment for booking %: charged %, expected %', b.id, p_amount_charged, v_expected;
  END IF;

  UPDATE public.bookings SET
    payment_status = 'paid', status = 'confirmed',
    platform_fee = v_fee, reservation_fee = v_res, host_earning = v_earn,
    amount_charged = COALESCE(p_amount_charged, v_expected),
    paddle_transaction_id = p_transaction_id,
    qr_checkin_code = COALESCE(b.qr_checkin_code, encode(extensions.gen_random_bytes(9), 'hex')),
    earnings_clear_at = b.end_time + interval '24 hours',
    hold_expires_at = NULL,
    updated_at = now()
  WHERE id = b.id;

  INSERT INTO public.host_wallets(host_id) VALUES (b.host_id) ON CONFLICT (host_id) DO NOTHING;
  UPDATE public.host_wallets SET
    pending_clearance = pending_clearance + v_earn, updated_at = now()
  WHERE host_id = b.host_id RETURNING pending_clearance INTO v_pending;

  INSERT INTO public.wallet_transactions(host_id, booking_id, kind, amount, balance_after, note)
  VALUES (b.host_id, b.id, 'earning_pending', v_earn, v_pending,
    'Booking paid — held in clearance until 24h after the stay (net of ' || round(v_rate*100) || '% commission)');

  SELECT title INTO v_space FROM public.parking_spaces WHERE id = b.space_id;

  INSERT INTO public.notifications(user_id, kind, title, body, link, booking_id) VALUES
    (b.renter_id, 'booking_confirmed', 'Booking confirmed',
      'Your payment went through. Your check-in code is ready for ' || COALESCE(v_space,'your space') || '.', '/bookings', b.id),
    (b.host_id, 'payment', 'You earned ' || to_char(v_earn, 'FM999999990.00'),
      'A booking for ' || COALESCE(v_space,'your space') || ' was paid. Funds clear 24h after the stay ends.', '/host/earnings', b.id);

  RETURN 'settled';
END; $$;

-- 5. Env-aware wrappers for the remaining entitlement gates --------------------
DROP FUNCTION IF EXISTS public.host_earnings_analytics();
CREATE OR REPLACE FUNCTION public.host_earnings_analytics(p_env text DEFAULT 'live')
RETURNS TABLE(month date, bookings bigint, gross numeric, net numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT public.is_host_pro(auth.uid(), p_env) THEN
    RAISE EXCEPTION 'Host Pro required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
    SELECT date_trunc('month', b.start_time)::date, count(*)::bigint,
           round(sum(b.total_price),2), round(sum(b.host_earning),2)
    FROM public.bookings b
    WHERE b.host_id = auth.uid()
      AND b.payment_status IN ('paid','refunded','refund_pending')
      AND b.start_time > now() - interval '12 months'
    GROUP BY 1 ORDER BY 1;
END; $$;

CREATE OR REPLACE FUNCTION public.create_parking_space(
  p_title text, p_description text, p_address text, p_lat double precision, p_lng double precision,
  p_price_per_hour numeric, p_price_per_day numeric, p_vehicle_types text[],
  p_is_covered boolean, p_is_gated boolean, p_has_ev_charging boolean, p_has_camera boolean,
  p_has_sensor boolean, p_photos text[], p_cancellation_policy text DEFAULT 'moderate',
  p_env text DEFAULT 'live')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE new_id uuid; v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF COALESCE(p_cancellation_policy,'moderate') NOT IN ('flexible','moderate','strict') THEN
    RAISE EXCEPTION 'Invalid cancellation policy';
  END IF;
  IF NOT public.is_host_pro(auth.uid(), p_env) THEN
    SELECT count(*) INTO v_count FROM public.parking_spaces WHERE host_id = auth.uid();
    IF v_count >= 2 THEN
      RAISE EXCEPTION 'Free hosts can list up to 2 spaces. Upgrade to Host Pro for unlimited listings.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.parking_spaces (
    host_id, title, description, address, location, price_per_hour, price_per_day, vehicle_types,
    is_covered, is_gated, has_ev_charging, has_camera, has_sensor, photos, is_active, cancellation_policy
  ) VALUES (
    auth.uid(), p_title, p_description, p_address,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_price_per_hour, p_price_per_day, p_vehicle_types,
    p_is_covered, p_is_gated, p_has_ev_charging, p_has_camera, p_has_sensor,
    COALESCE(p_photos, ARRAY[]::text[]), true, COALESCE(p_cancellation_policy,'moderate')
  ) RETURNING id INTO new_id;
  RETURN new_id;
END; $$;

-- 6. Billing history -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_billing_history(p_env text DEFAULT 'live')
RETURNS TABLE(kind text, description text, amount numeric, status text, reference text, occurred_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT 'booking'::text,
         'Parking at ' || COALESCE(s.title, 'a space'),
         CASE WHEN b.payment_status = 'refunded' THEN -COALESCE(b.refund_amount,0) ELSE b.amount_charged END,
         b.payment_status, b.paddle_transaction_id, b.updated_at
  FROM public.bookings b
  LEFT JOIN public.parking_spaces s ON s.id = b.space_id
  WHERE b.renter_id = auth.uid() AND b.payment_status IN ('paid','refunded','refund_pending')
  UNION ALL
  SELECT 'subscription'::text,
         'Host Pro (' || sub.price_id || ')',
         NULL::numeric, sub.status, sub.paddle_subscription_id, COALESCE(sub.updated_at, sub.created_at)
  FROM public.subscriptions sub
  WHERE sub.user_id = auth.uid() AND sub.environment = COALESCE(p_env,'live')
  ORDER BY 6 DESC
  LIMIT 100;
$$;

-- 7. Account deletion eligibility ---------------------------------------------
CREATE OR REPLACE FUNCTION public.account_deletion_blockers()
RETURNS TABLE(reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT 'You have an upcoming or in-progress reservation.'::text
  WHERE EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE (b.renter_id = auth.uid() OR b.host_id = auth.uid())
      AND b.status IN ('confirmed','active') AND b.end_time > now())
  UNION ALL
  SELECT 'A refund on one of your bookings is still being processed.'
  WHERE EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.renter_id = auth.uid() AND b.payment_status = 'refund_pending')
  UNION ALL
  SELECT 'You still have money in your host wallet. Withdraw it before deleting your account.'
  WHERE EXISTS (
    SELECT 1 FROM public.host_wallets w
    WHERE w.host_id = auth.uid() AND (w.available_balance > 0 OR w.pending_clearance > 0 OR w.pending_payout > 0))
  UNION ALL
  SELECT 'You have an active Host Pro subscription. Cancel it in the billing portal first.'
  WHERE EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = auth.uid() AND s.status IN ('active','trialing','past_due'));
$$;

-- 8. Grants --------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.is_host_pro(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.host_commission_rate(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.settle_booking_payment(uuid, text, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_pending_bookings() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_booking_charge(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.host_earnings_analytics(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_parking_space(text, text, text, double precision, double precision, numeric, numeric, text[], boolean, boolean, boolean, boolean, boolean, text[], text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_billing_history(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.account_deletion_blockers() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_booking_charge(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.host_earnings_analytics(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_parking_space(text, text, text, double precision, double precision, numeric, numeric, text[], boolean, boolean, boolean, boolean, boolean, text[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_billing_history(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_blockers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_pending_bookings() TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_booking_payment(uuid, text, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_host_pro(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.host_commission_rate(uuid, text) TO authenticated, service_role;