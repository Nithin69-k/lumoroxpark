-- spatial_ref_sys is owned by the PostGIS extension, so RLS cannot be enabled on it.
-- Remove all write access instead; only read access is needed by the app.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.spatial_ref_sys FROM anon, authenticated, PUBLIC;

GRANT SELECT ON TABLE public.spatial_ref_sys TO anon, authenticated, service_role;