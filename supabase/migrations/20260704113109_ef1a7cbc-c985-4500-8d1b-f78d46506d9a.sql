
-- Phase 5: roles, admin, activity triggers, dispute lifecycle

-- 1. Roles
CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "Admins view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 2. Admin visibility on activity + disputes + bookings + spaces
CREATE POLICY "Admins view all activity" ON public.activity_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins view all disputes" ON public.disputes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins update disputes" ON public.disputes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins view all bookings" ON public.bookings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 3. Activity log trigger for bookings
CREATE OR REPLACE FUNCTION public.log_booking_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_log(user_id, action, reference_id, metadata)
      VALUES (NEW.renter_id, 'booking_created', NEW.id,
        jsonb_build_object('space_id', NEW.space_id, 'total_price', NEW.total_price));
    INSERT INTO public.activity_log(user_id, action, reference_id, metadata)
      VALUES (NEW.host_id, 'booking_received', NEW.id,
        jsonb_build_object('space_id', NEW.space_id, 'renter_id', NEW.renter_id));
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.activity_log(user_id, action, reference_id, metadata)
      VALUES (NEW.renter_id, 'booking_' || NEW.status, NEW.id, jsonb_build_object('space_id', NEW.space_id));
    INSERT INTO public.activity_log(user_id, action, reference_id, metadata)
      VALUES (NEW.host_id, 'booking_' || NEW.status, NEW.id, jsonb_build_object('space_id', NEW.space_id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_activity ON public.bookings;
CREATE TRIGGER booking_activity
AFTER INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.log_booking_activity();

-- 4. Activity log trigger for reviews
CREATE OR REPLACE FUNCTION public.log_review_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.activity_log(user_id, action, reference_id, metadata)
    VALUES (NEW.reviewer_id, 'review_left', NEW.booking_id,
      jsonb_build_object('rating', NEW.rating, 'space_id', NEW.space_id));
  INSERT INTO public.activity_log(user_id, action, reference_id, metadata)
    VALUES (NEW.reviewee_id, 'review_received', NEW.booking_id,
      jsonb_build_object('rating', NEW.rating));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS review_activity ON public.reviews;
CREATE TRIGGER review_activity
AFTER INSERT ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.log_review_activity();

-- 5. Dispute raise RPC (validates the caller is involved in the booking)
CREATE OR REPLACE FUNCTION public.raise_dispute(p_booking_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_dispute_id uuid;
  v_booking record;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF length(coalesce(p_reason,'')) < 5 THEN RAISE EXCEPTION 'Reason too short'; END IF;

  SELECT id, renter_id, host_id INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF v_caller NOT IN (v_booking.renter_id, v_booking.host_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  INSERT INTO public.disputes(booking_id, raised_by, reason, status)
    VALUES (p_booking_id, v_caller, p_reason, 'open')
    RETURNING id INTO v_dispute_id;

  INSERT INTO public.activity_log(user_id, action, reference_id, metadata)
    VALUES (v_caller, 'dispute_raised', v_dispute_id,
      jsonb_build_object('booking_id', p_booking_id, 'reason', p_reason));

  RETURN v_dispute_id;
END;
$$;

-- 6. Admin resolve dispute RPC
CREATE OR REPLACE FUNCTION public.resolve_dispute(p_dispute_id uuid, p_status text, p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_status NOT IN ('resolved','rejected','open') THEN
    RAISE EXCEPTION 'Bad status';
  END IF;

  UPDATE public.disputes
    SET status = p_status, admin_notes = p_notes, updated_at = now()
    WHERE id = p_dispute_id;

  INSERT INTO public.activity_log(user_id, action, reference_id, metadata)
    VALUES (v_caller, 'dispute_' || p_status, p_dispute_id, jsonb_build_object('notes', p_notes));
END;
$$;

-- 7. Admin grant role RPC (bootstrap-safe: only admins can call after first admin exists)
CREATE OR REPLACE FUNCTION public.grant_role(p_user_id uuid, p_role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (p_user_id, p_role)
    ON CONFLICT DO NOTHING;
END;
$$;

-- 8. Admin list disputes with joined info
CREATE OR REPLACE FUNCTION public.admin_list_disputes()
RETURNS TABLE(
  id uuid, booking_id uuid, raised_by uuid, reason text, status text,
  admin_notes text, created_at timestamptz,
  renter_name text, host_name text, space_title text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.booking_id, d.raised_by, d.reason, d.status, d.admin_notes, d.created_at,
    rp.full_name, hp.full_name, s.title
  FROM public.disputes d
  JOIN public.bookings b ON b.id = d.booking_id
  LEFT JOIN public.profiles rp ON rp.id = b.renter_id
  LEFT JOIN public.profiles hp ON hp.id = b.host_id
  LEFT JOIN public.parking_spaces s ON s.id = b.space_id
  WHERE public.has_role(auth.uid(),'admin')
  ORDER BY d.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS TABLE(users bigint, spaces bigint, bookings bigint, open_disputes bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*) FROM public.profiles),
    (SELECT count(*) FROM public.parking_spaces),
    (SELECT count(*) FROM public.bookings),
    (SELECT count(*) FROM public.disputes WHERE status = 'open')
  WHERE public.has_role(auth.uid(),'admin');
$$;
