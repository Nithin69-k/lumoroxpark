-- RPC for creating parking spaces with lat/lng (converts to geography)
CREATE OR REPLACE FUNCTION public.create_parking_space(
  p_title text,
  p_description text,
  p_address text,
  p_lat double precision,
  p_lng double precision,
  p_price_per_hour numeric,
  p_price_per_day numeric,
  p_vehicle_types text[],
  p_is_covered boolean,
  p_is_gated boolean,
  p_has_ev_charging boolean,
  p_has_camera boolean,
  p_has_sensor boolean,
  p_photos text[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.parking_spaces (
    host_id, title, description, address, location,
    price_per_hour, price_per_day, vehicle_types,
    is_covered, is_gated, has_ev_charging, has_camera, has_sensor,
    photos, is_active
  ) VALUES (
    auth.uid(), p_title, p_description, p_address,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_price_per_hour, p_price_per_day, p_vehicle_types,
    p_is_covered, p_is_gated, p_has_ev_charging, p_has_camera, p_has_sensor,
    COALESCE(p_photos, ARRAY[]::text[]), true
  ) RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_parking_space(text,text,text,double precision,double precision,numeric,numeric,text[],boolean,boolean,boolean,boolean,boolean,text[]) TO authenticated;

-- RPC to list host's own spaces with lat/lng extracted
CREATE OR REPLACE FUNCTION public.list_my_spaces()
RETURNS TABLE (
  id uuid,
  title text,
  address text,
  lat double precision,
  lng double precision,
  price_per_hour numeric,
  price_per_day numeric,
  is_active boolean,
  live_occupancy_status text,
  photos text[],
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, title, address,
    ST_Y(location::geometry) AS lat,
    ST_X(location::geometry) AS lng,
    price_per_hour, price_per_day, is_active, live_occupancy_status, photos, created_at
  FROM public.parking_spaces
  WHERE host_id = auth.uid()
  ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_spaces() TO authenticated;

-- Storage RLS for space-photos bucket (bucket created via tool)
CREATE POLICY "Space photos are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'space-photos');

CREATE POLICY "Authenticated users can upload space photos to own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'space-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own space photos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'space-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own space photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'space-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);