CREATE OR REPLACE FUNCTION public.resolve_dispute(p_dispute_id uuid, p_status text, p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_caller, 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  IF p_status NOT IN ('open','under_review','resolved','rejected') THEN RAISE EXCEPTION 'Bad status'; END IF;
  UPDATE public.disputes SET status = p_status, admin_notes = coalesce(p_notes, admin_notes), updated_at = now()
    WHERE id = p_dispute_id;
  INSERT INTO public.activity_log(user_id, action, reference_id, metadata)
    VALUES (v_caller, 'dispute_' || p_status, p_dispute_id, jsonb_build_object('notes', p_notes));
  -- Notify the party who raised the dispute
  INSERT INTO public.notifications(user_id, kind, title, body, link, booking_id)
  SELECT d.raised_by, 'dispute_' || p_status,
         'Dispute ' || replace(p_status,'_',' '),
         coalesce(p_notes, 'An admin updated your dispute.'),
         '/bookings', d.booking_id
  FROM public.disputes d WHERE d.id = p_dispute_id;
END; $$;