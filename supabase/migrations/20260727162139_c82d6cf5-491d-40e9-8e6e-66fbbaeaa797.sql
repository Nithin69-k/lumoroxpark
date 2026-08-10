-- ============ booking fee columns ============
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS platform_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reservation_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS host_earning numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_charged numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paddle_transaction_id text;

-- ============ host wallets ============
CREATE TABLE IF NOT EXISTS public.host_wallets (
  host_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  lifetime_earnings numeric NOT NULL DEFAULT 0,
  available_balance numeric NOT NULL DEFAULT 0,
  pending_payout numeric NOT NULL DEFAULT 0,
  total_paid_out numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.host_wallets TO authenticated;
GRANT ALL ON public.host_wallets TO service_role;
ALTER TABLE public.host_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Hosts view own wallet" ON public.host_wallets
  FOR SELECT TO authenticated USING (auth.uid() = host_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- ============ wallet ledger ============
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  payout_id uuid,
  kind text NOT NULL, -- earning | payout_hold | payout_paid | payout_reverted | adjustment
  amount numeric NOT NULL,
  balance_after numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_transactions_host_idx ON public.wallet_transactions(host_id, created_at DESC);
GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Hosts view own ledger" ON public.wallet_transactions
  FOR SELECT TO authenticated USING (auth.uid() = host_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- ============ payout requests ============
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending', -- pending | approved | paid | rejected
  method text NOT NULL DEFAULT 'bank',
  account_holder text,
  account_number text,
  bank_code text,
  bank_name text,
  is_automatic boolean NOT NULL DEFAULT false,
  admin_notes text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payout_requests_host_idx ON public.payout_requests(host_id, created_at DESC);
GRANT SELECT ON public.payout_requests TO authenticated;
GRANT ALL ON public.payout_requests TO service_role;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Hosts view own payouts" ON public.payout_requests
  FOR SELECT TO authenticated USING (auth.uid() = host_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER payout_requests_updated_at BEFORE UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER host_wallets_updated_at BEFORE UPDATE ON public.host_wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ subscriptions ============
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paddle_subscription_id text NOT NULL UNIQUE,
  paddle_customer_id text NOT NULL,
  product_id text NOT NULL,
  price_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own subscription" ON public.subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_active_subscription(user_uuid uuid, check_env text DEFAULT 'live')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = user_uuid AND environment = check_env
      AND ((status IN ('active','trialing') AND (current_period_end IS NULL OR current_period_end > now()))
        OR (status = 'canceled' AND current_period_end > now()))
  );
$$;

-- ============ quote helper ============
CREATE OR REPLACE FUNCTION public.get_booking_charge(p_booking_id uuid)
RETURNS TABLE(base_amount numeric, platform_fee numeric, reservation_fee numeric, total numeric, credits integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.bookings; v_base numeric; v_fee numeric; v_res numeric := 1;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.renter_id <> auth.uid() THEN RAISE EXCEPTION 'Not your booking'; END IF;
  v_base := round(b.total_price::numeric, 2);
  v_fee := round(v_base * 0.10, 2);
  RETURN QUERY SELECT v_base, v_fee, v_res, round(v_base + v_fee + v_res, 2),
    GREATEST(1, ceil(v_base + v_fee)::integer);
END; $$;
REVOKE ALL ON FUNCTION public.get_booking_charge(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_booking_charge(uuid) TO authenticated;

-- ============ settlement (service role only) ============
CREATE OR REPLACE FUNCTION public.settle_booking_payment(
  p_booking_id uuid, p_transaction_id text, p_amount_charged numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.bookings; v_fee numeric; v_res numeric := 1; v_earn numeric; v_bal numeric; v_space text;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.payment_status = 'paid' THEN RETURN; END IF;

  v_fee := round(b.total_price * 0.10, 2);
  v_earn := round(b.total_price - v_fee, 2);

  UPDATE public.bookings SET
    payment_status = 'paid',
    status = 'confirmed',
    platform_fee = v_fee,
    reservation_fee = v_res,
    host_earning = v_earn,
    amount_charged = COALESCE(p_amount_charged, b.total_price + v_fee + v_res),
    paddle_transaction_id = p_transaction_id,
    qr_checkin_code = COALESCE(b.qr_checkin_code, encode(extensions.gen_random_bytes(9), 'hex')),
    updated_at = now()
  WHERE id = b.id;

  INSERT INTO public.host_wallets(host_id) VALUES (b.host_id) ON CONFLICT (host_id) DO NOTHING;
  UPDATE public.host_wallets SET
    lifetime_earnings = lifetime_earnings + v_earn,
    available_balance = available_balance + v_earn,
    updated_at = now()
  WHERE host_id = b.host_id
  RETURNING available_balance INTO v_bal;

  INSERT INTO public.wallet_transactions(host_id, booking_id, kind, amount, balance_after, note)
  VALUES (b.host_id, b.id, 'earning', v_earn, v_bal, 'Booking payment received (net of 10% platform commission)');

  SELECT title INTO v_space FROM public.parking_spaces WHERE id = b.space_id;

  INSERT INTO public.notifications(user_id, kind, title, body, link, booking_id) VALUES
    (b.renter_id, 'booking_confirmed', 'Booking confirmed',
      'Your payment went through. Your check-in code is ready for ' || COALESCE(v_space,'your space') || '.', '/bookings', b.id),
    (b.host_id, 'payment', 'You earned ' || to_char(v_earn, 'FM999999990.00'),
      'A booking for ' || COALESCE(v_space,'your space') || ' was paid. Funds added to your wallet.', '/host/earnings', b.id);
END; $$;
REVOKE ALL ON FUNCTION public.settle_booking_payment(uuid, text, numeric) FROM PUBLIC, anon, authenticated;

-- ============ host wallet read ============
CREATE OR REPLACE FUNCTION public.get_my_wallet()
RETURNS TABLE(lifetime_earnings numeric, available_balance numeric, pending_payout numeric, total_paid_out numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT COALESCE(w.lifetime_earnings,0), COALESCE(w.available_balance,0),
         COALESCE(w.pending_payout,0), COALESCE(w.total_paid_out,0)
  FROM (SELECT auth.uid() AS uid) u
  LEFT JOIN public.host_wallets w ON w.host_id = u.uid;
END; $$;
REVOKE ALL ON FUNCTION public.get_my_wallet() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_wallet() TO authenticated;

-- ============ payout request ============
CREATE OR REPLACE FUNCTION public.request_payout(
  p_amount numeric, p_account_holder text, p_account_number text, p_bank_code text, p_bank_name text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_bal numeric; v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount IS NULL OR p_amount < 20 THEN RAISE EXCEPTION 'Minimum payout amount is 20'; END IF;
  IF coalesce(trim(p_account_holder),'') = '' OR coalesce(trim(p_account_number),'') = '' THEN
    RAISE EXCEPTION 'Bank account details are required';
  END IF;

  SELECT available_balance INTO v_bal FROM public.host_wallets WHERE host_id = v_uid FOR UPDATE;
  IF v_bal IS NULL OR v_bal < p_amount THEN RAISE EXCEPTION 'Insufficient available balance'; END IF;

  INSERT INTO public.payout_requests(host_id, amount, account_holder, account_number, bank_code, bank_name)
  VALUES (v_uid, round(p_amount,2), trim(p_account_holder), trim(p_account_number), nullif(trim(p_bank_code),''), nullif(trim(p_bank_name),''))
  RETURNING id INTO v_id;

  UPDATE public.host_wallets
  SET available_balance = available_balance - round(p_amount,2),
      pending_payout = pending_payout + round(p_amount,2), updated_at = now()
  WHERE host_id = v_uid RETURNING available_balance INTO v_bal;

  INSERT INTO public.wallet_transactions(host_id, payout_id, kind, amount, balance_after, note)
  VALUES (v_uid, v_id, 'payout_hold', -round(p_amount,2), v_bal, 'Payout requested — awaiting admin approval');

  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.request_payout(numeric, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout(numeric, text, text, text, text) TO authenticated;

-- ============ list payouts ============
CREATE OR REPLACE FUNCTION public.list_my_payouts()
RETURNS TABLE(id uuid, amount numeric, status text, bank_name text, account_number text,
              is_automatic boolean, admin_notes text, requested_at timestamptz, processed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.amount, p.status, p.bank_name,
         CASE WHEN p.account_number IS NULL THEN NULL
              ELSE repeat('•', GREATEST(0, length(p.account_number) - 4)) || right(p.account_number, 4) END,
         p.is_automatic, p.admin_notes, p.requested_at, p.processed_at
  FROM public.payout_requests p
  WHERE p.host_id = auth.uid()
  ORDER BY p.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.list_my_payouts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_payouts() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_my_wallet_transactions(p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid, kind text, amount numeric, balance_after numeric, note text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.kind, t.amount, t.balance_after, t.note, t.created_at
  FROM public.wallet_transactions t
  WHERE t.host_id = auth.uid()
  ORDER BY t.created_at DESC
  LIMIT LEAST(COALESCE(p_limit,50), 200);
$$;
REVOKE ALL ON FUNCTION public.list_my_wallet_transactions(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_wallet_transactions(integer) TO authenticated;

-- ============ admin payout queue ============
CREATE OR REPLACE FUNCTION public.admin_list_payouts()
RETURNS TABLE(id uuid, host_id uuid, host_name text, amount numeric, status text,
              account_holder text, account_number text, bank_code text, bank_name text,
              is_automatic boolean, admin_notes text, requested_at timestamptz, processed_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY
  SELECT p.id, p.host_id, pr.full_name, p.amount, p.status, p.account_holder, p.account_number,
         p.bank_code, p.bank_name, p.is_automatic, p.admin_notes, p.requested_at, p.processed_at
  FROM public.payout_requests p
  LEFT JOIN public.profiles pr ON pr.id = p.host_id
  ORDER BY (p.status = 'pending') DESC, p.created_at DESC;
END; $$;
REVOKE ALL ON FUNCTION public.admin_list_payouts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_payouts() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_process_payout(p_payout_id uuid, p_action text, p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    VALUES (r.host_id, r.id, 'payout_paid', 0, COALESCE(v_bal,0), 'Payout sent to bank account');
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

-- ============ monthly automatic payouts ============
CREATE OR REPLACE FUNCTION public.run_monthly_payouts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w record; v_id uuid; v_bal numeric; v_count integer := 0; v_last record;
BEGIN
  FOR w IN SELECT * FROM public.host_wallets WHERE available_balance >= 20 LOOP
    SELECT * INTO v_last FROM public.payout_requests
      WHERE host_id = w.host_id AND account_number IS NOT NULL
      ORDER BY created_at DESC LIMIT 1;

    INSERT INTO public.payout_requests(host_id, amount, is_automatic, account_holder, account_number, bank_code, bank_name)
    VALUES (w.host_id, w.available_balance, true, v_last.account_holder, v_last.account_number, v_last.bank_code, v_last.bank_name)
    RETURNING id INTO v_id;

    UPDATE public.host_wallets
      SET pending_payout = pending_payout + w.available_balance,
          available_balance = 0, updated_at = now()
      WHERE host_id = w.host_id RETURNING available_balance INTO v_bal;

    INSERT INTO public.wallet_transactions(host_id, payout_id, kind, amount, balance_after, note)
    VALUES (w.host_id, v_id, 'payout_hold', -w.available_balance, v_bal, 'Automatic monthly payout scheduled');

    INSERT INTO public.notifications(user_id, kind, title, body, link)
    VALUES (w.host_id, 'payment', 'Monthly payout scheduled',
      'Your balance of ' || to_char(w.available_balance,'FM999999990.00') || ' is queued for payout.', '/host/earnings');

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.run_monthly_payouts() FROM PUBLIC, anon, authenticated;