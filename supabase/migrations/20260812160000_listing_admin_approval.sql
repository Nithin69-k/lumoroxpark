-- 1. Overwrite search_spaces to filter out spaces pending admin approval
CREATE OR REPLACE FUNCTION public.search_spaces(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision DEFAULT 10,
  p_starts timestamptz DEFAULT NULL,
  p_ends timestamptz DEFAULT NULL,
  p_covered boolean DEFAULT NULL,
  p_gated boolean DEFAULT NULL,
  p_ev boolean DEFAULT NULL,
  p_max_price numeric DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  address text,
  lat double precision,
  lng double precision,
  price_per_hour numeric,
  price_per_day numeric,
  photos text[],
  is_covered boolean,
  is_gated boolean,
  has_ev_charging boolean,
  has_camera boolean,
  vehicle_types text[],
  live_occupancy_status text,
  distance_km double precision,
  host_id uuid,
  cancellation_policy text,
  is_featured boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.title, s.address,
    ST_Y(s.location::geometry) AS lat,
    ST_X(s.location::geometry) AS lng,
    s.price_per_hour, s.price_per_day, s.photos,
    s.is_covered, s.is_gated, s.has_ev_charging, s.has_camera,
    s.vehicle_types, s.live_occupancy_status,
    ST_Distance(
      s.location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) / 1000.0 AS distance_km,
    s.host_id,
    s.cancellation_policy,
    public.is_host_pro(s.host_id) AS is_featured
  FROM public.parking_spaces s
  WHERE s.is_active = true
    AND (s.description IS NULL OR s.description NOT LIKE '%[APPROVAL_STATUS] Pending%')
    AND ST_DWithin(
      s.location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_km * 1000
    )
    AND (p_covered   IS NULL OR s.is_covered      = p_covered)
    AND (p_gated     IS NULL OR s.is_gated        = p_gated)
    AND (p_ev        IS NULL OR s.has_ev_charging = p_ev)
    AND (p_max_price IS NULL OR s.price_per_hour <= p_max_price)
    AND (
      p_starts IS NULL OR p_ends IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.space_id = s.id
          AND b.status IN ('confirmed','active')
          AND tstzrange(b.start_time, b.end_time, '[)') && tstzrange(p_starts, p_ends, '[)')
      )
    )
  ORDER BY public.is_host_pro(s.host_id) DESC, distance_km ASC;
$$;

-- 2. Create function to list pending spaces for admin moderation
CREATE OR REPLACE FUNCTION public.admin_list_pending_spaces()
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  address text,
  price_per_hour numeric,
  created_at timestamptz,
  host_id uuid,
  host_name text,
  host_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT 
    s.id,
    s.title,
    s.description,
    s.address,
    s.price_per_hour,
    s.created_at,
    s.host_id,
    COALESCE(p.full_name, 'Unknown Host') AS host_name,
    COALESCE(au.email::text, 'No Email') AS host_email
  FROM public.parking_spaces s
  LEFT JOIN public.profiles p ON p.id = s.host_id
  LEFT JOIN auth.users au ON au.id = s.host_id
  WHERE s.description LIKE '%[APPROVAL_STATUS] Pending%';
END; $$;

-- 3. Create function for admin to approve/reject spaces
CREATE OR REPLACE FUNCTION public.admin_approve_space(p_space_id uuid, p_approve boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_desc text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT description INTO v_desc FROM public.parking_spaces WHERE id = p_space_id;
  
  IF p_approve THEN
    v_desc := replace(v_desc, '[APPROVAL_STATUS] Pending', '[APPROVAL_STATUS] Approved');
    UPDATE public.parking_spaces
    SET description = v_desc, is_active = true
    WHERE id = p_space_id;
  ELSE
    v_desc := replace(v_desc, '[APPROVAL_STATUS] Pending', '[APPROVAL_STATUS] Rejected');
    UPDATE public.parking_spaces
    SET description = v_desc, is_active = false
    WHERE id = p_space_id;
  END IF;
END; $$;

-- 4. Set security execution privileges
REVOKE EXECUTE ON FUNCTION public.admin_list_pending_spaces() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_spaces() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_approve_space(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_space(uuid, boolean) TO authenticated;
