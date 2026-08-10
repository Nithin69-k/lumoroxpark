DO $$
DECLARE
  f record;
  public_fns text[] := ARRAY['search_spaces','get_space_detail'];
  internal_fns text[] := ARRAY[
    'has_role','is_booking_party','is_host_pro','users_share_booking','host_commission_rate',
    'has_active_subscription','handle_new_user','log_booking_activity','log_dispute_event',
    'log_review_activity','notify_on_booking','notify_on_message','release_cleared_earnings',
    'run_monthly_payouts','settle_booking_payment','mark_booking_refunded',
    'mark_booking_refunded_by_transaction','get_refund_job','cancellation_cutoff_hours',
    'update_updated_at_column'
  ];
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);

    IF f.proname = ANY(public_fns) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.sig);
    ELSIF NOT (f.proname = ANY(internal_fns)) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;