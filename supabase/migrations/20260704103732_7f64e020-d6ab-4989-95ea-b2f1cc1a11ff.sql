
-- Public read of active parking spaces so anon can browse before signing in
CREATE POLICY "Anyone can view active spaces"
  ON public.parking_spaces FOR SELECT
  USING (is_active = true);

GRANT SELECT ON public.parking_spaces TO anon;

-- Public host info view (safe columns only)
CREATE OR REPLACE VIEW public.hosts_public
WITH (security_invoker = on) AS
SELECT id, full_name, avatar_url, rating, trust_score, total_bookings
FROM public.profiles;

GRANT SELECT ON public.hosts_public TO anon, authenticated;

-- Allow anon to read profile rows via the view (RLS: allow reading any profile's public fields)
CREATE POLICY "Public can view profile basics"
  ON public.profiles FOR SELECT
  USING (true);

GRANT SELECT ON public.profiles TO anon;

-- Search spaces with distance + availability filter
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
  host_id uuid
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
    s.host_id
  FROM public.parking_spaces s
  WHERE s.is_active = true
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
  ORDER BY distance_km ASC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.search_spaces(double precision,double precision,double precision,timestamptz,timestamptz,boolean,boolean,boolean,numeric) TO anon, authenticated;

-- Detail
CREATE OR REPLACE FUNCTION public.get_space_detail(p_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
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
  has_sensor boolean,
  vehicle_types text[],
  live_occupancy_status text,
  host_id uuid,
  host_name text,
  host_rating numeric,
  host_trust_score integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.title, s.description, s.address,
    ST_Y(s.location::geometry), ST_X(s.location::geometry),
    s.price_per_hour, s.price_per_day, s.photos,
    s.is_covered, s.is_gated, s.has_ev_charging, s.has_camera, s.has_sensor,
    s.vehicle_types, s.live_occupancy_status,
    p.id, p.full_name, p.rating, p.trust_score
  FROM public.parking_spaces s
  JOIN public.profiles p ON p.id = s.host_id
  WHERE s.id = p_id AND s.is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_space_detail(uuid) TO anon, authenticated;

-- Create a pending booking (payment happens after)
CREATE OR REPLACE FUNCTION public.create_pending_booking(
  p_space_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hours numeric;
  v_price_per_hour numeric;
  v_host_id uuid;
  v_total numeric;
  v_booking_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_end <= p_start THEN
    RAISE EXCEPTION 'End must be after start';
  END IF;

  SELECT s.price_per_hour, s.host_id
    INTO v_price_per_hour, v_host_id
  FROM public.parking_spaces s
  WHERE s.id = p_space_id AND s.is_active = true;

  IF v_host_id IS NULL THEN
    RAISE EXCEPTION 'Space not found or inactive';
  END IF;
  IF v_host_id = v_uid THEN
    RAISE EXCEPTION 'Cannot book your own space';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.space_id = p_space_id
      AND b.status IN ('confirmed','active')
      AND tstzrange(b.start_time, b.end_time, '[)') && tstzrange(p_start, p_end, '[)')
  ) THEN
    RAISE EXCEPTION 'Time slot no longer available';
  END IF;

  v_hours := EXTRACT(EPOCH FROM (p_end - p_start)) / 3600.0;
  v_total := ROUND(v_hours * v_price_per_hour, 2);

  INSERT INTO public.bookings (
    space_id, renter_id, host_id, start_time, end_time, total_price,
    status, payment_status, qr_checkin_code
  ) VALUES (
    p_space_id, v_uid, v_host_id, p_start, p_end, v_total,
    'pending', 'pending', encode(extensions.gen_random_bytes(8), 'hex')
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_pending_booking(uuid,timestamptz,timestamptz) TO authenticated;
