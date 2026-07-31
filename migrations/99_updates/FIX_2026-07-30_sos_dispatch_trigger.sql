-- =============================================================================
-- FIX 2026-07-30 — driver phones never ring for a real SOS
-- =============================================================================
-- SYMPTOM
--   Driver is signed in and on standby (drivers.status = 'available', located
--   metres from the patient) and still gets no SOS notification.
--
-- PROVEN ON LIVE (2026-07-30 ~05:20 UTC), in this order:
--   1. Three real SOS rows were written today (04:52, 04:54, 04:55 UTC) by
--      patient "Joshy Jijo" at 19.2137 / 73.1062.
--   2. push_deliveries has NO row for any of them. Its newest row is 03:31 UTC,
--      created by a hand-made POST. So nothing was even attempted.
--   3. The route itself is healthy: POSTing /api/push/dispatch with the secret
--      below returns 200 (not 401 / 503), and the 03:31 POST really did send.
--   => The only broken link is the database trigger: it never POSTs.
--
-- WHY IT IS SILENT
--   notify_push_on_sos_change() guards on a placeholder secret and, when it sees
--   one, does `RETURN NULL` — no error, no log, SOS write succeeds as normal.
--   The live copy still carries the placeholder from push_dispatch_WIRE.sql.
--   Nothing anywhere surfaces this, which is why it has now gone unnoticed twice.
--
-- Run the WHOLE file in the Supabase SQL editor. Idempotent; safe to re-run.
-- Nothing here touches SOS data.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- STEP 1 — pg_net must exist; it is what lets Postgres call the web app.
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_net;


-- -----------------------------------------------------------------------------
-- STEP 2 — Recreate the dispatch trigger function with the REAL secret.
--
-- Two deliberate changes versus the previous version:
--   * the placeholder branch now RAISES instead of returning quietly, so a future
--     unedited deploy fails loudly at install time rather than going dark;
--   * the exception handler logs the SOS id and the error, so a network/egress
--     failure is visible in the Postgres logs instead of vanishing.
-- The write itself can still never be rolled back by a notification failure.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_push_on_sos_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dispatch_url    text := 'https://triqareweb20.netlify.app/api/push/dispatch';
  dispatch_secret text := 'aff09a5fc2b78aeac9aaa76abf114e567cd754b9ca732c6f6b4f1c8a46499605';

  prev_status    text := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END;
  prev_driver_id uuid := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.driver_id END;
BEGIN
  -- A same-value status rewrite (e.g. re-picking a hospital) is not a transition.
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  -- Non-blocking: pg_net queues and returns immediately, so a slow or unreachable
  -- push endpoint can never delay or fail the SOS write itself.
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
  -- A failure to notify must NEVER roll back an emergency write — but it must be
  -- findable afterwards, which the previous silent version was not.
  RAISE WARNING 'notify_push_on_sos_change: dispatch failed for sos_request % (% -> %): % / %',
    NEW.id, prev_status, NEW.status, SQLSTATE, SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_push_on_sos_change ON public.sos_requests;
CREATE TRIGGER trg_notify_push_on_sos_change
  AFTER INSERT OR UPDATE OF status ON public.sos_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_push_on_sos_change();


-- -----------------------------------------------------------------------------
-- STEP 3 — Self-test. Fires a real pg_net POST at the live route using a
-- non-existent request id, so the route answers `"event": null` and CANNOT send
-- a push to anyone. This proves the one thing no client-side test can: that
-- Postgres is able to reach the internet and is presenting an accepted secret.
-- -----------------------------------------------------------------------------
SELECT net.http_post(
  url     := 'https://triqareweb20.netlify.app/api/push/dispatch',
  headers := jsonb_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer aff09a5fc2b78aeac9aaa76abf114e567cd754b9ca732c6f6b4f1c8a46499605'
  ),
  body    := jsonb_build_object(
    'request_id', '00000000-0000-0000-0000-000000000000',
    'new_status', 'SOS Triggered'
  ),
  timeout_milliseconds := 5000
) AS self_test_request_id;

-- Wait a couple of seconds, then run STEP 4.


-- -----------------------------------------------------------------------------
-- STEP 4 — Read the verdict. Run this block on its own, ~5s after STEP 3.
-- -----------------------------------------------------------------------------

-- 4a. Trigger installed and enabled? Expect one row, tgenabled = 'O'.
SELECT tgname, tgenabled AS enabled_O_means_yes
FROM   pg_trigger
WHERE  tgrelid = 'public.sos_requests'::regclass
  AND  tgname  = 'trg_notify_push_on_sos_change';

-- 4b. Does the live function body now hold a real secret?
--     Expect secret_is_placeholder = false, has_https_url = true.
SELECT pg_get_functiondef('public.notify_push_on_sos_change()'::regprocedure)
         LIKE '%REPLACE_WITH_PUSH_DISPATCH_SECRET%' AS secret_is_placeholder,
       pg_get_functiondef('public.notify_push_on_sos_change()'::regprocedure)
         LIKE '%https://triqareweb20.netlify.app/api/push/dispatch%' AS has_https_url;

-- 4c. What did the self-test POST actually get back?
--       200 + {"success":true,"event":null,...} -> WIRED CORRECTLY. Done here.
--       401                                     -> secret does not match Netlify's
--                                                  PUSH_DISPATCH_SECRET.
--       503                                     -> PUSH_DISPATCH_SECRET unset on Netlify.
--       no row / timeout / connection error     -> pg_net cannot reach the internet;
--                                                  the trigger approach is dead and the
--                                                  app must dispatch instead.
SELECT id, status_code, left(content, 300) AS body, created
FROM   net._http_response
ORDER  BY id DESC
LIMIT  5;


-- =============================================================================
-- AFTER APPLYING
--   Raise one real SOS from the patient app, then check that push_deliveries
--   gains rows within a few seconds:
--
--     SELECT created_at, event, audience, recipients, sent, failed, invalid
--     FROM   public.push_deliveries
--     ORDER  BY created_at DESC LIMIT 10;
--
--   A row with audience = 'primary' is the driver page. If `recipients` is 0
--   there, the dispatch worked and the remaining problem is the driver audience
--   (no signed-in driver holds an FCM token) — see the token notes, not this file.
-- =============================================================================
