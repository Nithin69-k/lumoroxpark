REVOKE ALL ON TABLE public.spatial_ref_sys FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text, boolean) FROM PUBLIC;