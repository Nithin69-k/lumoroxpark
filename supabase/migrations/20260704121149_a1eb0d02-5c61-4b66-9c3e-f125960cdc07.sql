-- Notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_created_idx ON public.notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications read"   ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own notifications update" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own notifications delete" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Messages (booking-scoped threads)
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_booking_created_idx ON public.messages(booking_id, created_at);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Helper: is user party to booking?
CREATE OR REPLACE FUNCTION public.is_booking_party(_booking_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.parking_spaces s ON s.id = b.space_id
    WHERE b.id = _booking_id AND (b.renter_id = _user_id OR s.host_id = _user_id)
  );
$$;

CREATE POLICY "messages read parties" ON public.messages FOR SELECT TO authenticated
  USING (public.is_booking_party(booking_id, auth.uid()));
CREATE POLICY "messages insert parties" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_booking_party(booking_id, auth.uid()));
CREATE POLICY "messages mark read" ON public.messages FOR UPDATE TO authenticated
  USING (public.is_booking_party(booking_id, auth.uid()))
  WITH CHECK (public.is_booking_party(booking_id, auth.uid()));

-- Notify counterparty on new message
CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_host uuid; v_renter uuid; v_recipient uuid; v_title text;
BEGIN
  SELECT b.renter_id, s.host_id INTO v_renter, v_host
  FROM public.bookings b JOIN public.parking_spaces s ON s.id = b.space_id
  WHERE b.id = NEW.booking_id;
  v_recipient := CASE WHEN NEW.sender_id = v_renter THEN v_host ELSE v_renter END;
  INSERT INTO public.notifications (user_id, kind, title, body, link, booking_id)
  VALUES (v_recipient, 'message', 'New message',
          left(NEW.body, 140),
          '/messages/' || NEW.booking_id::text,
          NEW.booking_id);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_on_message AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_message();

-- Notify on booking lifecycle changes
CREATE OR REPLACE FUNCTION public.notify_on_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_host uuid;
BEGIN
  SELECT host_id INTO v_host FROM public.parking_spaces WHERE id = NEW.space_id;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link, booking_id)
    VALUES (v_host, 'booking_new', 'New booking request',
            'A renter reserved your space.', '/host', NEW.id);
  ELSIF TG_OP = 'UPDATE' AND NEW.status <> OLD.status THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link, booking_id)
    VALUES (NEW.renter_id, 'booking_status',
            'Booking ' || NEW.status,
            'Your booking is now ' || NEW.status || '.',
            '/bookings', NEW.id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_booking_insert AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_booking();
CREATE TRIGGER trg_notify_booking_update AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_booking();

-- Mark all notifications read
CREATE OR REPLACE FUNCTION public.mark_notifications_read()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.notifications SET read_at = now()
  WHERE user_id = auth.uid() AND read_at IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read() TO authenticated;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;