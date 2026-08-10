
-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================
-- PROFILES
-- ============================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  phone text,
  is_host boolean NOT NULL DEFAULT false,
  rating numeric(2,1) NOT NULL DEFAULT 5.0,
  total_bookings int NOT NULL DEFAULT 0,
  trust_score int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- ============================================
-- PARKING SPACES
-- ============================================
CREATE TABLE public.parking_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  address text NOT NULL,
  location geography(Point, 4326),
  price_per_hour numeric(10,2) NOT NULL,
  price_per_day numeric(10,2),
  has_camera boolean NOT NULL DEFAULT false,
  has_sensor boolean NOT NULL DEFAULT false,
  is_gated boolean NOT NULL DEFAULT false,
  is_covered boolean NOT NULL DEFAULT false,
  has_ev_charging boolean NOT NULL DEFAULT false,
  vehicle_types text[] NOT NULL DEFAULT ARRAY['car']::text[],
  photos text[] NOT NULL DEFAULT ARRAY[]::text[],
  is_active boolean NOT NULL DEFAULT true,
  live_occupancy_status text NOT NULL DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_parking_location ON public.parking_spaces USING gist (location);
CREATE INDEX idx_parking_host ON public.parking_spaces (host_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parking_spaces TO authenticated;
GRANT SELECT ON public.parking_spaces TO anon;
GRANT ALL ON public.parking_spaces TO service_role;

ALTER TABLE public.parking_spaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active spaces are viewable by everyone"
  ON public.parking_spaces FOR SELECT USING (is_active = true OR host_id = auth.uid());
CREATE POLICY "Hosts insert own spaces"
  ON public.parking_spaces FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Hosts update own spaces"
  ON public.parking_spaces FOR UPDATE USING (auth.uid() = host_id);
CREATE POLICY "Hosts delete own spaces"
  ON public.parking_spaces FOR DELETE USING (auth.uid() = host_id);

-- ============================================
-- AVAILABILITY SLOTS
-- ============================================
CREATE TABLE public.availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.parking_spaces(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  is_booked boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_slots_space ON public.availability_slots (space_id, start_time);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_slots TO authenticated;
GRANT SELECT ON public.availability_slots TO anon;
GRANT ALL ON public.availability_slots TO service_role;

ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Slots viewable by everyone"
  ON public.availability_slots FOR SELECT USING (true);
CREATE POLICY "Hosts manage own slots"
  ON public.availability_slots FOR ALL USING (
    space_id IN (SELECT id FROM public.parking_spaces WHERE host_id = auth.uid())
  );

-- ============================================
-- BOOKINGS
-- ============================================
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.parking_spaces(id),
  renter_id uuid NOT NULL REFERENCES public.profiles(id),
  host_id uuid NOT NULL REFERENCES public.profiles(id),
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  total_price numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payment_status text NOT NULL DEFAULT 'unpaid',
  stripe_session_id text,
  qr_checkin_code text UNIQUE,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bookings_renter ON public.bookings (renter_id);
CREATE INDEX idx_bookings_host ON public.bookings (host_id);
CREATE INDEX idx_bookings_space ON public.bookings (space_id);

GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own bookings"
  ON public.bookings FOR SELECT USING (auth.uid() = renter_id OR auth.uid() = host_id);
CREATE POLICY "Renters create bookings"
  ON public.bookings FOR INSERT WITH CHECK (auth.uid() = renter_id);
CREATE POLICY "Involved parties update bookings"
  ON public.bookings FOR UPDATE USING (auth.uid() = renter_id OR auth.uid() = host_id);

-- ============================================
-- ACTIVITY LOG
-- ============================================
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  reference_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_user ON public.activity_log (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own activity"
  ON public.activity_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own activity"
  ON public.activity_log FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- REVIEWS
-- ============================================
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id),
  reviewee_id uuid NOT NULL REFERENCES public.profiles(id),
  space_id uuid REFERENCES public.parking_spaces(id) ON DELETE SET NULL,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reviews_reviewee ON public.reviews (reviewee_id);
CREATE INDEX idx_reviews_space ON public.reviews (space_id);

GRANT SELECT, INSERT ON public.reviews TO authenticated;
GRANT SELECT ON public.reviews TO anon;
GRANT ALL ON public.reviews TO service_role;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews viewable by everyone"
  ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Reviewers insert own reviews"
  ON public.reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

-- ============================================
-- DISPUTES
-- ============================================
CREATE TABLE public.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  raised_by uuid NOT NULL REFERENCES public.profiles(id),
  reason text,
  status text NOT NULL DEFAULT 'open',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.disputes TO authenticated;
GRANT ALL ON public.disputes TO service_role;

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Involved parties view disputes"
  ON public.disputes FOR SELECT USING (
    booking_id IN (SELECT id FROM public.bookings WHERE renter_id = auth.uid() OR host_id = auth.uid())
  );
CREATE POLICY "Users raise disputes on own bookings"
  ON public.disputes FOR INSERT WITH CHECK (
    auth.uid() = raised_by AND
    booking_id IN (SELECT id FROM public.bookings WHERE renter_id = auth.uid() OR host_id = auth.uid())
  );

-- ============================================
-- FUNCTION: nearby_spaces
-- ============================================
CREATE OR REPLACE FUNCTION public.nearby_spaces(lat float, lng float, radius_km float)
RETURNS SETOF public.parking_spaces
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT *
  FROM public.parking_spaces
  WHERE is_active = true
    AND location IS NOT NULL
    AND ST_DWithin(
      location,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
      radius_km * 1000
    )
  ORDER BY location <-> ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography;
$$;

GRANT EXECUTE ON FUNCTION public.nearby_spaces(float, float, float) TO anon, authenticated;

-- ============================================
-- TRIGGER: auto-create profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- TRIGGER: updated_at maintenance
-- ============================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_spaces_updated_at BEFORE UPDATE ON public.parking_spaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_bookings_updated_at BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_disputes_updated_at BEFORE UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
