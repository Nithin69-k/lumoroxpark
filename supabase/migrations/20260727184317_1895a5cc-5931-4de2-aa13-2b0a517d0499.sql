CREATE OR REPLACE FUNCTION public.reset_demo_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_spaces uuid[];
  v_bookings uuid[];
  v_removed int := 0;
  v_bookings_removed int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO v_spaces
  FROM public.parking_spaces
  WHERE host_id = v_uid AND title LIKE '[demo]%';

  IF array_length(v_spaces, 1) IS NULL THEN
    RETURN jsonb_build_object('spaces_removed', 0, 'bookings_removed', 0);
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO v_bookings
  FROM public.bookings WHERE space_id = ANY(v_spaces);

  DELETE FROM public.messages WHERE booking_id = ANY(v_bookings);
  DELETE FROM public.dispute_events WHERE dispute_id IN (
    SELECT id FROM public.disputes WHERE booking_id = ANY(v_bookings)
  );
  DELETE FROM public.disputes WHERE booking_id = ANY(v_bookings);
  DELETE FROM public.notifications WHERE booking_id = ANY(v_bookings);
  DELETE FROM public.reviews WHERE booking_id = ANY(v_bookings) OR space_id = ANY(v_spaces);
  DELETE FROM public.wallet_transactions WHERE booking_id = ANY(v_bookings);
  DELETE FROM public.availability_slots WHERE space_id = ANY(v_spaces);

  WITH del AS (DELETE FROM public.bookings WHERE space_id = ANY(v_spaces) RETURNING 1)
  SELECT count(*) INTO v_bookings_removed FROM del;

  WITH del AS (DELETE FROM public.parking_spaces WHERE id = ANY(v_spaces) RETURNING 1)
  SELECT count(*) INTO v_removed FROM del;

  RETURN jsonb_build_object('spaces_removed', v_removed, 'bookings_removed', v_bookings_removed);
END;
$function$;

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  email text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT INSERT ON public.support_tickets TO anon;
GRANT ALL ON public.support_tickets TO service_role;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a support ticket"
  ON public.support_tickets FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Users view own tickets"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update tickets"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();