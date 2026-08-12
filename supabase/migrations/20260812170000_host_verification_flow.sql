-- Create host_verifications table
CREATE TABLE IF NOT EXISTS public.host_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text NOT NULL,
  address text NOT NULL,
  verification_type text NOT NULL,
  document_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.host_verifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to prevent errors
DROP POLICY IF EXISTS "Users can insert their own host application" ON public.host_verifications;
DROP POLICY IF EXISTS "Users can view their own host applications" ON public.host_verifications;
DROP POLICY IF EXISTS "Admins can select all applications" ON public.host_verifications;
DROP POLICY IF EXISTS "Admins can update applications" ON public.host_verifications;

-- Create Policies
CREATE POLICY "Users can insert their own host application" ON public.host_verifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own host applications" ON public.host_verifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can select all applications" ON public.host_verifications
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update applications" ON public.host_verifications
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Trigger to prevent direct escalation of is_host on profiles table
CREATE OR REPLACE FUNCTION public.check_profile_is_host_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_host = true AND OLD.is_host = false THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.host_verifications
      WHERE user_id = NEW.id AND status = 'approved'
    ) AND NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'Host status can only be updated via approved verification requests.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trigger_check_profile_is_host_update ON public.profiles;

CREATE TRIGGER trigger_check_profile_is_host_update
BEFORE UPDATE OF is_host ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.check_profile_is_host_update();

-- Create RPC function to review host applications
CREATE OR REPLACE FUNCTION public.review_host_application(
  p_verification_id uuid,
  p_status text,
  p_rejection_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT user_id INTO v_user_id FROM public.host_verifications WHERE id = p_verification_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Host verification request not found';
  END IF;

  UPDATE public.host_verifications
  SET status = p_status,
      rejection_reason = p_rejection_reason,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_verification_id;

  IF p_status = 'approved' THEN
    UPDATE public.profiles
    SET is_host = true,
        updated_at = now()
    WHERE id = v_user_id;
  ELSE
    UPDATE public.profiles
    SET is_host = false,
        updated_at = now()
    WHERE id = v_user_id;
  END IF;
END; $$;

REVOKE EXECUTE ON FUNCTION public.review_host_application(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_host_application(uuid, text, text) TO authenticated;

-- Create host-verification-documents storage bucket if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('host-verification-documents', 'host-verification-documents', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for host-verification-documents
DROP POLICY IF EXISTS "Users can upload their own verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read all verification documents" ON storage.objects;

CREATE POLICY "Users can upload their own verification documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'host-verification-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read their own verification documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'host-verification-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Admins can read all verification documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'host-verification-documents' AND EXISTS (
  SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
));
