-- ============================================================
-- Move payments from Paddle to Razorpay: rename provider columns
-- and recreate the functions that reference them.
-- ============================================================

-- 1. Column renames -----------------------------------------------------------
ALTER TABLE public.bookings
  RENAME COLUMN paddle_transaction_id TO razorpay_transaction_id;

ALTER TABLE public.bookings
  RENAME COLUMN paddle_refund_id TO razorpay_refund_id;

ALTER TABLE public.subscriptions
  RENAME COLUMN paddle_subscription_id TO razorpay_subscription_id;

ALTER TABLE public.subscriptions
  RENAME COLUMN paddle_customer_id TO razorpay_customer_id;

ALTER TABLE public.subscriptions
  RENAME CONSTRAINT subscriptions_paddle_subscription_id_key
  TO subscriptions_razorpay_subscription_id_key;

-- 2. Settlement (env-aware) ----------------------------------------------------
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
      razorpay_transaction_id = p_transaction_id, updated_at = now()
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
    razorpay_transaction_id = p_transaction_id,
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

REVOKE EXECUTE ON FUNCTION public.settle_booking_payment(uuid, text, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_booking_payment(uuid, text, numeric, text) TO service_role;

-- 3. Refund helpers -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_refund_job(p_booking_id uuid)
RETURNS TABLE(transaction_id text, refund_amount numeric, payment_status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT razorpay_transaction_id, refund_amount, payment_status
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
      razorpay_refund_id = COALESCE(p_refund_id, razorpay_refund_id),
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
  SELECT id INTO v_id FROM public.bookings WHERE razorpay_transaction_id = p_transaction_id LIMIT 1;
  IF v_id IS NOT NULL THEN PERFORM public.mark_booking_refunded(v_id, NULL); END IF;
END; $$;

REVOKE ALL ON FUNCTION public.mark_booking_refunded_by_transaction(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_booking_refunded_by_transaction(text) TO service_role;

-- 4. Billing history -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_billing_history(p_env text DEFAULT 'live')
RETURNS TABLE(kind text, description text, amount numeric, status text, reference text, occurred_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT 'booking'::text,
         'Parking at ' || COALESCE(s.title, 'a space'),
         CASE WHEN b.payment_status = 'refunded' THEN -COALESCE(b.refund_amount,0) ELSE b.amount_charged END,
         b.payment_status, b.razorpay_transaction_id, b.updated_at
  FROM public.bookings b
  LEFT JOIN public.parking_spaces s ON s.id = b.space_id
  WHERE b.renter_id = auth.uid() AND b.payment_status IN ('paid','refunded','refund_pending')
  UNION ALL
  SELECT 'subscription'::text,
         'Host Pro (' || sub.price_id || ')',
         NULL::numeric, sub.status, sub.razorpay_subscription_id, COALESCE(sub.updated_at, sub.created_at)
  FROM public.subscriptions sub
  WHERE sub.user_id = auth.uid() AND sub.environment = COALESCE(p_env,'live')
  ORDER BY 6 DESC
  LIMIT 100;
$$;

REVOKE EXECUTE ON FUNCTION public.my_billing_history(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_billing_history(text) TO authenticated;
