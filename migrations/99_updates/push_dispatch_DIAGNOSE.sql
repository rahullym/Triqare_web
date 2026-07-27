-- =============================================================================
-- PUSH DISPATCH — DIAGNOSTIC (read-only)
-- =============================================================================
-- Symptom: driver's phone does NOT alert on a new SOS unless the QSoS app is
-- already open in the foreground. Foreground works because the app's own realtime
-- subscription surfaces the request; background/killed relies on the FCM PUSH,
-- which is not arriving. This script finds WHICH link in the push chain is dead.
--
-- Run the whole file in the Supabase SQL editor. Nothing here writes data.
-- Read the NOTES printed after each block.
--
-- The chain, in order:
--   SOS row written → trg_notify_push_on_sos_change → pg_net POST to
--   /api/push/dispatch → dispatchSOSPush → FCM → driver device.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- CHECK 1 — Is the trigger installed and enabled?
-- Expect one row, tgenabled = 'O' (enabled).
-- ---------------------------------------------------------------------------
SELECT tgname,
       tgenabled,             -- 'O' = enabled, 'D' = disabled
       pg_get_triggerdef(oid) AS definition
FROM   pg_trigger
WHERE  tgrelid = 'public.sos_requests'::regclass
  AND  tgname = 'trg_notify_push_on_sos_change';


-- ---------------------------------------------------------------------------
-- CHECK 2 — Is the dispatch WIRED? (the most likely failure)
-- The committed function reads these GUCs. On managed Supabase they can't be
-- set (ALTER DATABASE is blocked), so if you see NULL/blank here AND the
-- function still reads current_setting(), the trigger is a SILENT NO-OP:
-- it fires, sees no URL, and returns without calling the webhook.
--
-- FIX PATH A (this case): apply push_dispatch_WIRE.sql, which bakes the URL +
-- secret directly into the function body.
-- ---------------------------------------------------------------------------
SELECT current_setting('app.push_dispatch_url', true)    AS dispatch_url_guc,
       current_setting('app.push_dispatch_secret', true) AS dispatch_secret_guc;

-- Also read the actual function source: does it contain a real https literal,
-- or only current_setting()? If you see current_setting and the GUCs above are
-- blank → NO-OP confirmed.
SELECT pg_get_functiondef('public.notify_push_on_sos_change()'::regprocedure) AS function_source;


-- ---------------------------------------------------------------------------
-- CHECK 3 — Do drivers actually have device tokens? (audience)
-- If available_drivers_with_token = 0, there is nobody to push to even when
-- everything else works — the driver app never registered/persisted a token
-- (notification permission denied, or FCM couldn't mint one).
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.drivers WHERE status = 'available')                         AS available_drivers,
  (SELECT count(*) FROM public.drivers d
     JOIN public.users u ON u.id = d.user_id
    WHERE d.status = 'available' AND u.fcm_token IS NOT NULL AND u.is_active)              AS available_drivers_with_token,
  (SELECT count(*) FROM public.users WHERE fcm_token IS NOT NULL)                          AS users_with_any_token;


-- ---------------------------------------------------------------------------
-- CHECK 4 — Did pg_net actually CALL the endpoint, and what came back?
-- This is the decisive check. pg_net records every response here.
--   * NO rows for /api/push/dispatch  → the trigger never fired (see CHECK 2),
--                                        OR pg_net isn't installed.
--   * status_code 200, body has "notConfigured":true
--                                     → endpoint reached but FIREBASE_SERVICE_ACCOUNT
--                                       is missing/mangled on Netlify (FIX PATH B).
--   * status_code 200, "sent":0,"recipients":0
--                                     → reached + configured, but no eligible driver
--                                       token in range (see CHECK 3 / radius / driver
--                                       online + location).
--   * status_code 401                 → the secret baked in the trigger does NOT match
--                                       PUSH_DISPATCH_SECRET on Netlify.
--   * status_code 503                 → PUSH_DISPATCH_SECRET not set on Netlify.
-- ---------------------------------------------------------------------------
SELECT id,
       status_code,
       timed_out,
       error_msg,
       left(content, 400) AS body_preview,
       created
FROM   net._http_response
ORDER  BY created DESC
LIMIT  20;


-- ---------------------------------------------------------------------------
-- CHECK 5 — Is pg_net installed at all? (CHECK 4 errors if not)
-- ---------------------------------------------------------------------------
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_net';

-- =============================================================================
-- END DIAGNOSTIC
-- =============================================================================
