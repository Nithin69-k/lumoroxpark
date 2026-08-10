
-- 1. Table
CREATE TABLE IF NOT EXISTS public.dispute_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id),
  from_status text,
  to_status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispute_events_dispute ON public.dispute_events(dispute_id, created_at);

GRANT SELECT ON public.dispute_events TO authenticated;
GRANT ALL ON public.dispute_events TO service_role;

ALTER TABLE public.dispute_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all dispute events"
  ON public.dispute_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Involved parties view dispute events"
  ON public.dispute_events FOR SELECT TO authenticated
  USING (
    dispute_id IN (
      SELECT d.id FROM public.disputes d
      JOIN public.bookings b ON b.id = d.booking_id
      WHERE b.renter_id = auth.uid() OR b.host_id = auth.uid()
    )
  );

-- 2. Trigger to auto-log events
CREATE OR REPLACE FUNCTION public.log_dispute_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.dispute_events(dispute_id, actor_id, from_status, to_status, note)
    VALUES (NEW.id, NEW.raised_by, NULL, NEW.status, NEW.reason);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.status IS DISTINCT FROM OLD.status
    OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
  ) THEN
    INSERT INTO public.dispute_events(dispute_id, actor_id, from_status, to_status, note)
    VALUES (NEW.id, auth.uid(), OLD.status, NEW.status, NEW.admin_notes);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_dispute_event ON public.disputes;
CREATE TRIGGER trg_log_dispute_event
AFTER INSERT OR UPDATE ON public.disputes
FOR EACH ROW EXECUTE FUNCTION public.log_dispute_event();

-- 3. Backfill: seed one event per existing dispute (created) if the table is empty for it
INSERT INTO public.dispute_events(dispute_id, actor_id, from_status, to_status, note, created_at)
SELECT d.id, d.raised_by, NULL, 'open', d.reason, d.created_at
FROM public.disputes d
WHERE NOT EXISTS (SELECT 1 FROM public.dispute_events e WHERE e.dispute_id = d.id);

-- Also backfill a resolution/review event for disputes not currently 'open'
INSERT INTO public.dispute_events(dispute_id, actor_id, from_status, to_status, note, created_at)
SELECT d.id, NULL, 'open', d.status, d.admin_notes, d.updated_at
FROM public.disputes d
WHERE d.status <> 'open'
  AND NOT EXISTS (
    SELECT 1 FROM public.dispute_events e
    WHERE e.dispute_id = d.id AND e.to_status = d.status
  );

-- 4. Fetch helper (uses caller's RLS)
CREATE OR REPLACE FUNCTION public.list_dispute_events(p_dispute_id uuid)
RETURNS TABLE(
  id uuid,
  actor_id uuid,
  actor_name text,
  from_status text,
  to_status text,
  note text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT e.id, e.actor_id, p.full_name, e.from_status, e.to_status, e.note, e.created_at
  FROM public.dispute_events e
  LEFT JOIN public.profiles p ON p.id = e.actor_id
  WHERE e.dispute_id = p_dispute_id
  ORDER BY e.created_at ASC;
$$;
