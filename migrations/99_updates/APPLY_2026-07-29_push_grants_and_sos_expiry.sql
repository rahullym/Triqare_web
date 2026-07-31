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
--      the app as of commit 7afe18c / APK vc32 — Triqare-app/services/fcm-service.ts
--      — which is what currently keeps push alive via the legacy column.)
--      Source of truth: 99_updates/push_multidevice_and_delivery_log.sql
--
--      !! CORRECTED 2026-07-29. The GRANT-based fix this file originally carried
--      DID NOT WORK, and would have been applied believing push was restored.
--      `GRANT INSERT, UPDATE, DELETE` + `REVOKE SELECT` cannot satisfy the app's
--      upsert: in PostgreSQL *any* ON CONFLICT clause requires SELECT privilege on
--      the table — verified on a throwaway PG16 cluster, where even
--      `ON CONFLICT DO NOTHING` fails 42501 with INSERT/UPDATE/DELETE granted and
--      SELECT revoked. Granting SELECT is not a fix either: with RLS on, the upsert
--      then fails the row-level check unless a permissive SELECT *policy* also
--      exists, and that policy would let anyone holding the public anon key read
--      every device token in the fleet. A column-level `GRANT SELECT (device_id)`
--      was tested too and is likewise insufficient.
--      So registration moves behind a SECURITY DEFINER RPC: the client gets EXECUTE
--      and nothing else, the function does the upsert as owner, and the table stays
--      completely unreadable and unwritable from the anon key. Same PG16 harness
--      confirms register (fresh + rotation + hand-over to a different user) and
--      unregister all succeed while direct reads and writes still fail 42501.
--
--   2. SOS EXPIRY USES THE WRONG WINDOW. `configurations.sos_request_timeout_minutes`
--      is '5', but every request is stamped expires_at = requested_at + exactly
--      3 minutes (the fallback). The live sos_set_expires_at() predates the
--      capturing-group fix, so substring() returns the empty decimal group, parses
--      to NULL, and silently falls back to 3. Confirmed on two live inserts.
--      Source of truth: 99_updates/sos_expiry.sql
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. device_tokens — registration via SECURITY DEFINER RPC
-- ─────────────────────────────────────────────────────────────────────────────
-- The client holds NO privilege on the table at all — not even INSERT. It calls
-- these two functions, which run as the owner and therefore bypass both the grant
-- layer and RLS. That is what lets the table stay completely unreadable to the
-- public anon key while the app can still register the device it is running on.
--
-- This replaces the GRANT-based approach; see the header for why that cannot work.
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- No policies are defined on purpose: with RLS on and no policy, every non-owner
-- role sees and writes nothing, and only these SECURITY DEFINER functions get in.
DROP POLICY IF EXISTS "device_tokens interim client write" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens client insert" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens client update" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens client delete" ON public.device_tokens;

REVOKE ALL ON public.device_tokens FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.register_device_token(
  p_device_id text,
  p_user_id   uuid,
  p_token     text,
  p_role      text DEFAULT NULL,
  p_platform  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_device_id IS NULL OR p_user_id IS NULL OR p_token IS NULL THEN
    RAISE EXCEPTION 'device_id, user_id and token are required' USING ERRCODE = '22023';
  END IF;

  -- Conflict on device_id, not on user: re-registering the SAME handset (token
  -- rotation, or a different account signing in on it) must UPDATE the one row,
  -- so a device always maps to exactly one current owner and never accumulates
  -- stale rows that would page a user who has since signed out.
  INSERT INTO public.device_tokens (device_id, user_id, token, role, platform, is_active, updated_at)
  VALUES (p_device_id, p_user_id, p_token, p_role, p_platform, true, now())
  ON CONFLICT (device_id) DO UPDATE SET
    user_id    = EXCLUDED.user_id,
    token      = EXCLUDED.token,
    role       = EXCLUDED.role,
    platform   = EXCLUDED.platform,
    is_active  = true,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.unregister_device_token(p_device_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Scoped to this device only; other devices the user is signed into keep working.
  DELETE FROM public.device_tokens WHERE device_id = p_device_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_device_token(text, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unregister_device_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_device_token(text, uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_device_token(text) TO anon, authenticated;

COMMENT ON FUNCTION public.register_device_token(text, uuid, text, text, text) IS
  'Register/refresh THIS device''s FCM token. SECURITY DEFINER so the client needs no privilege on device_tokens — the table stays unreadable to the anon key.';

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

-- (a) The client can EXECUTE the registration functions and holds NO table
--     privilege. Expect exactly two rows (register/unregister) for anon and
--     authenticated, and NO device_tokens rows for those roles.
SELECT p.proname AS function_name, r.rolname AS grantee
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN pg_roles r
 WHERE n.nspname = 'public'
   AND p.proname IN ('register_device_token', 'unregister_device_token')
   AND r.rolname IN ('anon', 'authenticated')
   AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
 ORDER BY 1, 2;

--     Must return ZERO rows: the client must hold no privilege on the table.
SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name = 'device_tokens'
   AND grantee IN ('anon', 'authenticated');

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
