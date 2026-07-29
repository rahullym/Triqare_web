-- =============================================================================
-- APPLY THIS IN THE SUPABASE SQL EDITOR (production).  Idempotent, safe to re-run.
--
-- Two live defects, both caused by migrations that exist in this repo but were
-- never applied to the production database. Each was confirmed against live on
-- 2026-07-29, not inferred:
--
--   1. PUSH BLACKOUT. `device_tokens` has no GRANTs, so the mobile client gets
--      "permission denied for table device_tokens" on every token registration.
--      Proof: signed in as a real driver with the anon key and replayed the app's
--      own upsert -> permission denied; `SELECT count(*) FROM device_tokens` = 0
--      rows system-wide. The app's registerFcmToken() then returned early WITHOUT
--      writing the legacy users.fcm_token, so affected users had NO push token in
--      either store and could not be paged at all. (The early-return is fixed in
--      the app too — Triqare-app/services/fcm-service.ts — but that needs an APK;
--      this grant is what actually restores the multi-device table.)
--      Source of truth: 99_updates/push_multidevice_and_delivery_log.sql
--
--   2. SOS EXPIRY USES THE WRONG WINDOW. `configurations.sos_request_timeout_minutes`
--      is '5', but every request is stamped expires_at = requested_at + exactly
--      3 minutes (the fallback). The live sos_set_expires_at() predates the
--      capturing-group fix, so substring() returns the empty decimal group, parses
--      to NULL, and silently falls back to 3. Confirmed on two live inserts.
--      Source of truth: 99_updates/sos_expiry.sql
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. device_tokens — grants + write-only RLS (from push_multidevice_and_delivery_log.sql)
-- ─────────────────────────────────────────────────────────────────────────────
-- The client registers and unregisters its OWN device row. It deliberately gets
-- no SELECT: only the server (service_role, which bypasses grants + RLS) ever
-- reads tokens, so a leaked anon key cannot enumerate anyone's devices.
GRANT INSERT, UPDATE, DELETE ON public.device_tokens TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated, service_role;
-- Supabase auto-grants SELECT on new public tables to anon/authenticated. Revoke
-- it: the client must WRITE its own row but never READ the table.
REVOKE SELECT ON public.device_tokens FROM anon, authenticated;

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "device_tokens interim client write" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens client insert" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens client update" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens client delete" ON public.device_tokens;
CREATE POLICY "device_tokens client insert" ON public.device_tokens FOR INSERT WITH CHECK (true);
CREATE POLICY "device_tokens client update" ON public.device_tokens FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "device_tokens client delete" ON public.device_tokens FOR DELETE USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. sos_set_expires_at() — honour sos_request_timeout_minutes (from sos_expiry.sql)
-- ─────────────────────────────────────────────────────────────────────────────
-- This function can NEVER fail an SOS insert: any error at all falls through to
-- the 3-minute default. A misconfigured `configurations` row must not stop a
-- patient from calling an ambulance.
CREATE OR REPLACE FUNCTION public.sos_set_expires_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  timeout_minutes numeric := 3;
  raw_value       text;
  parsed          text;
BEGIN
  -- An explicit deadline from the caller wins (lets an operator/back-fill set one).
  IF NEW.expires_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT value INTO raw_value
      FROM public.configurations
     WHERE key = 'sos_request_timeout_minutes'
     LIMIT 1;

    IF raw_value IS NOT NULL THEN
      -- NOTE the grouping: substring(x from pattern) returns the FIRST
      -- parenthesized subexpression when the pattern has one, not the whole
      -- match. So the number is wrapped in a capturing group and the optional
      -- decimal tail is made NON-capturing — otherwise "5" parses to NULL
      -- (the empty decimal group) and every request silently gets the fallback.
      -- THIS IS THE BUG CURRENTLY LIVE.
      parsed := substring(raw_value from '(-?[0-9]+(?:\.[0-9]+)?)');
      IF parsed IS NOT NULL AND parsed <> '' THEN
        timeout_minutes := parsed::numeric;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    timeout_minutes := 3;
  END;

  IF timeout_minutes IS NULL OR timeout_minutes <= 0 THEN
    timeout_minutes := 3;
  END IF;

  NEW.expires_at := COALESCE(NEW.requested_at, now())
                    + make_interval(secs => (timeout_minutes * 60)::double precision);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sos_set_expires_at ON public.sos_requests;
CREATE TRIGGER trg_sos_set_expires_at
  BEFORE INSERT ON public.sos_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.sos_set_expires_at();

-- =============================================================================
-- VERIFY
-- =============================================================================

-- (a) device_tokens grants now present for the client roles. Expect rows for
--     anon (INSERT/UPDATE/DELETE) and authenticated (+SELECT revoked).
SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name = 'device_tokens'
   AND grantee IN ('anon', 'authenticated', 'service_role')
 GROUP BY grantee
 ORDER BY grantee;

-- (b) The expiry window now matches the configured timeout. With
--     sos_request_timeout_minutes = '5' this must return 5, not 3.
SELECT (SELECT value FROM public.configurations WHERE key = 'sos_request_timeout_minutes') AS configured_minutes,
       EXTRACT(EPOCH FROM (t.expires_at - t.requested_at)) / 60                            AS trigger_minutes
  FROM (
    SELECT now() AS requested_at,
           now() + make_interval(secs => (
             COALESCE(NULLIF(substring(
               (SELECT value FROM public.configurations WHERE key = 'sos_request_timeout_minutes')
               from '(-?[0-9]+(?:\.[0-9]+)?)'), '')::numeric, 3) * 60)::double precision) AS expires_at
  ) t;
