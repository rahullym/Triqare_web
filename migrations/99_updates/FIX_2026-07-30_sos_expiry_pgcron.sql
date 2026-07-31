-- =============================================================================
-- FIX 2026-07-30 — stale no-driver SOS requests never expire on live
-- =============================================================================
-- SYMPTOM
--   An unassigned SOS sits at status 'SOS Triggered' indefinitely. Every driver
--   who has not declined it keeps seeing a live emergency, and the patient's app
--   keeps showing "searching" long after everyone has given up on it.
--
-- PROVEN ON LIVE (2026-07-30, during the driver UAT run):
--   1. SOS aa4e52db-eb45-4f5e-859e-33f49a14bb2c was raised at 08:12:23Z with
--      expires_at 08:17:23Z.
--   2. At 10:30Z — 2h13m past expiry — it was STILL 'SOS Triggered', with
--      updated_at unchanged from creation. The */2 schedule had missed ~66 runs.
--   3. POSTing the route by hand returned 200 and expired 2 requests on the spot,
--      including that one. So the route and the sweep logic are both healthy.
--   4. POST /.netlify/functions/expire-sos-requests on the deployed site 307s to
--      /sign-in — it falls through to the Next.js middleware, exactly the symptom
--      netlify.toml's [functions] comment describes. The function is not running.
--   => The route works. Netlify's scheduler is the broken link.
--
-- WHY NOT JUST FIX NETLIFY
--   The scheduled function AND the netlify.toml [functions] directory declaration
--   are both already committed and deployed on the branch Netlify builds, and the
--   schedule still does not fire. Rather than keep guessing at the platform, this
--   moves the cadence onto pg_cron — the same Postgres that already reaches this
--   app successfully on every SOS status change (notify_push_on_sos_change via
--   pg_net). One proven egress path instead of two, and verifiable from SQL.
--   The Netlify function can stay in place as a harmless second belt.
--
-- Run the WHOLE file in the Supabase SQL editor. Idempotent; safe to re-run.
-- Nothing here touches SOS data directly — it only schedules the existing sweep.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- STEP 0 — Paste the real CRON_SECRET below (Netlify → Site configuration →
-- Environment variables → CRON_SECRET). It is the same value the /api/cron
-- routes check.
--
-- Leaving the placeholder in place does NOT fail quietly: STEP 2 raises on it.
-- That is deliberate. The push dispatch trigger shipped with an unedited
-- placeholder and a `RETURN NULL`, and the result was drivers silently never
-- being paged for weeks — twice. A backstop that pretends to work is worse than
-- no backstop, because nobody goes looking for it.
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- STEP 1 — Extensions. pg_net is what lets Postgres call the web app (already
-- installed for the push dispatch trigger); pg_cron provides the cadence.
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;


-- -----------------------------------------------------------------------------
-- STEP 2 — The sweep call, wrapped so the URL and secret live in exactly one
-- place and the schedule below stays readable.
--
-- Deliberately fire-and-forget: net.http_post queues and returns immediately, so
-- a slow or unreachable endpoint can never hold a Postgres worker. The route is
-- idempotent and already guarded by CRON_SECRET, so a duplicate run is a no-op.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_sos_expiry_sweep()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sweep_url    text := 'https://triqareweb20.netlify.app/api/cron/expire-sos-requests';
  sweep_secret text := 'PASTE_CRON_SECRET_HERE';
BEGIN
  IF sweep_secret = 'PASTE_CRON_SECRET_HERE' THEN
    RAISE EXCEPTION
      'run_sos_expiry_sweep: CRON_SECRET placeholder was never replaced — edit STEP 2 and re-run this file. Refusing to install a backstop that would 401 on every run.';
  END IF;

  PERFORM net.http_post(
    url     := sweep_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || sweep_secret
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
EXCEPTION
  WHEN raise_exception THEN
    RAISE;
  WHEN OTHERS THEN
    -- A network/egress failure must be findable in the Postgres log rather than
    -- vanishing, but must not take the cron worker down with it.
    RAISE WARNING 'run_sos_expiry_sweep: POST failed: % / %', SQLSTATE, SQLERRM;
END;
$$;


-- -----------------------------------------------------------------------------
-- STEP 3 — Schedule it every 2 minutes, the cadence the Netlify function was
-- supposed to run at. Unschedule first so re-running this file never leaves two
-- jobs racing each other.
-- -----------------------------------------------------------------------------
SELECT cron.unschedule('sos-expiry-sweep')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sos-expiry-sweep');

SELECT cron.schedule(
  'sos-expiry-sweep',
  '*/2 * * * *',
  $cron$SELECT public.run_sos_expiry_sweep();$cron$
);


-- -----------------------------------------------------------------------------
-- STEP 4 — Prove it. Run this block on its own ~4 minutes after STEP 3.
-- -----------------------------------------------------------------------------

-- (a) the job exists and is active
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'sos-expiry-sweep';

-- (b) its recent runs succeeded. 'failed' here with a raise_exception message
--     means STEP 0 was skipped.
SELECT status, return_message, start_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sos-expiry-sweep')
ORDER BY start_time DESC
LIMIT 5;

-- (c) Should return 0 rows once a sweep has run. Any row is a live SOS that no
--     driver was ever assigned to and that is already past its own expires_at —
--     i.e. the exact leak this file closes.
SELECT id, requested_at, expires_at, status
FROM public.sos_requests
WHERE status = 'SOS Triggered'
  AND driver_id IS NULL
  AND expires_at < now()
ORDER BY requested_at DESC;


-- -----------------------------------------------------------------------------
-- STEP 5 (optional, recommended) — the sweep has to down-map its terminal status
-- today. It tries 'Timed Out' first and falls back to 'Cancelled' when the status
-- CHECK constraint rejects it, which is what live is doing: aa4e52db came out
-- 'Cancelled' with an actor='system' history entry rather than 'Timed Out'.
-- Applying migrations/99_updates/sos_lifecycle_timestamps.sql makes a timeout
-- distinguishable from a real patient cancel in reporting.
-- -----------------------------------------------------------------------------
