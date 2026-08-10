
-- 1) Profiles: restrict SELECT to authenticated users (protects phone from anon)
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- 2) SECURITY DEFINER functions: revoke broad EXECUTE and grant only to roles that need it.

-- Trigger functions: never called directly; revoke from all API roles
REVOKE ALL ON FUNCTION public.handle_new_user()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_booking()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_message()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_booking_activity()     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_dispute_event()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_review_activity()      FROM PUBLIC, anon, authenticated;

-- Internal helper used only inside SQL/RLS (still needs to be callable from RLS eval; keep for authenticated)
REVOKE ALL ON FUNCTION public.is_booking_party(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_booking_party(uuid, uuid) TO authenticated;

-- RLS helper: policies reference it; both anon and authenticated may evaluate policies
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;

-- Public-callable RPCs (browse/space detail from unauthenticated pages)
REVOKE ALL ON FUNCTION public.search_spaces(double precision, double precision, double precision, timestamptz, timestamptz, boolean, boolean, boolean, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_spaces(double precision, double precision, double precision, timestamptz, timestamptz, boolean, boolean, boolean, numeric) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_space_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_space_detail(uuid) TO anon, authenticated;

-- Authenticated-only RPCs
REVOKE ALL ON FUNCTION public.admin_list_disputes()                              FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_disputes()                           TO authenticated;

REVOKE ALL ON FUNCTION public.admin_stats()                                      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stats()                                   TO authenticated;

REVOKE ALL ON FUNCTION public.admin_top_demand_areas(integer)                    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_top_demand_areas(integer)                 TO authenticated;

REVOKE ALL ON FUNCTION public.checkin_booking(text)                              FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkin_booking(text)                           TO authenticated;

REVOKE ALL ON FUNCTION public.checkout_booking(uuid)                             FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_booking(uuid)                          TO authenticated;

REVOKE ALL ON FUNCTION public.create_parking_space(text, text, text, double precision, double precision, numeric, numeric, text[], boolean, boolean, boolean, boolean, boolean, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_parking_space(text, text, text, double precision, double precision, numeric, numeric, text[], boolean, boolean, boolean, boolean, boolean, text[]) TO authenticated;

REVOKE ALL ON FUNCTION public.create_pending_booking(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pending_booking(uuid, timestamptz, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.grant_role(uuid, public.app_role)                  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_role(uuid, public.app_role)               TO authenticated;

REVOKE ALL ON FUNCTION public.list_my_spaces()                                   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_spaces()                                TO authenticated;

REVOKE ALL ON FUNCTION public.mark_notifications_read()                          FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read()                       TO authenticated;

REVOKE ALL ON FUNCTION public.raise_dispute(uuid, text)                          FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raise_dispute(uuid, text)                       TO authenticated;

REVOKE ALL ON FUNCTION public.reset_demo_data()                                  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_demo_data()                               TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_dispute(uuid, text, text)                  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_dispute(uuid, text, text)               TO authenticated;

REVOKE ALL ON FUNCTION public.seed_demo_data()                                   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_demo_data()                                TO authenticated;

REVOKE ALL ON FUNCTION public.submit_review(uuid, integer, text)                 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_review(uuid, integer, text)              TO authenticated;

-- 3) spatial_ref_sys (PostGIS system table) — enable RLS to satisfy the linter.
-- We don't add a policy: PostGIS internal functions run as superuser and are unaffected;
-- direct Data API reads of spatial_ref_sys are not needed by this app.
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY';
  EXCEPTION WHEN insufficient_privilege THEN
    -- Fallback: revoke Data API access if we cannot ALTER the PostGIS-owned table
    REVOKE SELECT ON public.spatial_ref_sys FROM anon, authenticated;
  END;
END $$;
