-- 1) Availability slots: no anonymous exposure of full booking patterns.
DROP POLICY IF EXISTS "Slots viewable by everyone" ON public.availability_slots;

CREATE POLICY "Hosts view own slots"
ON public.availability_slots
FOR SELECT
TO authenticated
USING (
  space_id IN (SELECT id FROM public.parking_spaces WHERE host_id = auth.uid())
);

CREATE POLICY "Signed-in users view slots of active spaces"
ON public.availability_slots
FOR SELECT
TO authenticated
USING (
  space_id IN (SELECT id FROM public.parking_spaces WHERE is_active = true)
);

REVOKE ALL ON public.availability_slots FROM anon;

-- 2) SECURITY DEFINER helpers: not callable by anonymous visitors.
--    They stay executable by authenticated because RLS policies evaluate them
--    as the querying role.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_booking_party(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.users_share_booking(uuid, uuid) FROM anon, PUBLIC;

-- 3) Drop the superseded create_parking_space overload (no longer used by the app).
DROP FUNCTION IF EXISTS public.create_parking_space(
  text, text, text, double precision, double precision, numeric, numeric,
  text[], boolean, boolean, boolean, boolean, boolean, text[]
);

-- 4) Demo-data routines are maintenance-only: service backend / admins via
--    their own internal admin check already; remove blanket EXECUTE grants
--    from PUBLIC so only explicitly granted roles can call them.
REVOKE EXECUTE ON FUNCTION public.seed_demo_data() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_demo_data() FROM PUBLIC;