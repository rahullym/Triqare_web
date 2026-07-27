-- =============================================================================
-- PUSH DISPATCH — WIRE THE TRIGGER (the missing literal-baked variant)
-- =============================================================================
-- push_notifications.sql defines notify_push_on_sos_change() reading the GUCs
-- app.push_dispatch_url / app.push_dispatch_secret. Managed Supabase BLOCKS
-- `ALTER DATABASE ... SET` for the SQL-editor role (ERROR 42501), so those GUCs
-- can never be set and the trigger stays a silent no-op — no SOS ever produces a
-- background push. That comment promised a "CREATE OR REPLACE variant below" with
-- literals; it was never committed. This IS that variant.
--
-- SECURITY: the function is SECURITY DEFINER and its body is NOT readable by the
-- anon/PostgREST client, so the baked secret is not client-exposed. Do not GRANT
-- EXECUTE on this function to anon/authenticated (it is only invoked by the trigger).
--
-- BEFORE APPLYING, set the SECRET literal below:
--   :DISPATCH_URL    = MUST be https://triqareweb20.netlify.app/api/push/dispatch.
--                      This is the site that runs the CURRENT code (its middleware
--                      whitelists /api/push as a public machine-to-machine route) AND
--                      has FIREBASE_SERVICE_ACCOUNT / RESEND_API_KEY / PUSH_DISPATCH_SECRET.
--                      DO NOT use portal.triqare.com here — verified 2026-07-27 that it
--                      is a SEPARATE, STALE deploy that 307-redirects /api/push/dispatch
--                      to /sign-in (its middleware lacks the /api/push allowance), so the
--                      trigger's POST would never reach the handler and nothing would send.
--   :DISPATCH_SECRET = EXACTLY the value of PUSH_DISPATCH_SECRET in triqareweb20's Netlify
--                      env. A wrong POST bearer already returns 401 there (confirmed the
--                      secret IS set), so a mismatch here → 401 and nothing sends.
--
-- Idempotent: re-running just replaces the function body. Safe to re-apply after
-- rotating the secret or moving the site.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_push_on_sos_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- >>> EDIT THE SECRET BELOW. URL must stay triqareweb20 (see header — portal is a stale deploy). <<<
  dispatch_url    text := 'https://triqareweb20.netlify.app/api/push/dispatch';
  dispatch_secret text := 'REPLACE_WITH_PUSH_DISPATCH_SECRET';

  prev_status    text := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END;
  prev_driver_id uuid := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.driver_id END;
BEGIN
  -- Guard against an unedited deploy: if the secret placeholder is still here,
  -- do nothing rather than fire 401s against the endpoint.
  IF dispatch_url IS NULL OR dispatch_url = ''
     OR dispatch_secret = 'REPLACE_WITH_PUSH_DISPATCH_SECRET' THEN
    RETURN NULL;
  END IF;

  -- Only a real status transition is notifiable. `AFTER UPDATE OF status` also
  -- fires on a same-value rewrite (e.g. hospital re-selection); skip those.
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  -- Non-blocking: pg_net queues and returns immediately, so an unreachable push
  -- endpoint can never slow down or fail the SOS write itself.
  PERFORM net.http_post(
    url     := dispatch_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || dispatch_secret
    ),
    body    := jsonb_build_object(
      'request_id',    NEW.id,
      'old_status',    prev_status,
      'new_status',    NEW.status,
      'old_driver_id', prev_driver_id,
      'new_driver_id', NEW.driver_id
    ),
    timeout_milliseconds := 5000
  );

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- A failure to notify must NEVER roll back an emergency write.
  RAISE WARNING 'notify_push_on_sos_change failed for sos_request %: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$$;

-- Re-assert the trigger (harmless if it already exists).
DROP TRIGGER IF EXISTS trg_notify_push_on_sos_change ON public.sos_requests;
CREATE TRIGGER trg_notify_push_on_sos_change
  AFTER INSERT OR UPDATE OF status ON public.sos_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_push_on_sos_change();

-- -----------------------------------------------------------------------------
-- SMOKE TEST (optional): after applying, trigger one real SOS from the patient
-- app, then re-run push_dispatch_DIAGNOSE.sql CHECK 4. You should see a fresh
-- net._http_response row with status_code 200 and a body like
--   {"success":true,"event":"sos.created","recipients":N,"sent":N,"failed":0}
-- If body shows "notConfigured":true → the DB side is now correct and the
-- remaining fix is FIREBASE_SERVICE_ACCOUNT on Netlify (see notes).
-- =============================================================================
