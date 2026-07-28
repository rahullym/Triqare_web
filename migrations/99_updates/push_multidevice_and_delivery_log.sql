-- =============================================================================
-- PUSH: multi-device token store + delivery failure log — 2026-07-28
-- Incremental patch. Apply like the other 99_updates patches. Idempotent.
-- Run the WHOLE file in the Supabase SQL editor. Safe to re-run.
-- =============================================================================
--
-- WHY
--   The push system stored ONE token per user in users.fcm_token, overwritten on
--   every registration — so a user's second device silently knocked the first
--   offline, and a signed-out device kept its token until it happened to rotate.
--   This adds a proper per-device token table (one row per physical device, each
--   carrying the owning user + their role), plus a lightweight delivery-outcome
--   log so send/failure counts are visible instead of vanishing into function logs.
--
--   users.fcm_token is KEPT and still written by the app in parallel during the
--   rollout, and the sender reads BOTH sources and de-duplicates — so this migration
--   is safe to apply before OR after the new APK ships, in either order, with no
--   window where push breaks.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. device_tokens — one row per physical device
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable per-install id the app generates once and keeps in SecureStore. This is
  -- the conflict key: re-registering the SAME device (token rotation, or a DIFFERENT
  -- user signing in on it) updates the SAME row, so a device maps to exactly ONE
  -- current owner + token and never accumulates stale duplicates.
  device_id   text NOT NULL UNIQUE,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token       text NOT NULL,
  -- Snapshot of the owner's role at registration (patient | driver |
  -- emergency_contact | admin). The requirement asks tokens be tied to user AND
  -- role; this is that column. Not trusted for authorization — purely diagnostic
  -- and for role-scoped sends if ever needed.
  role        text,
  platform    text,                          -- 'ios' | 'android'
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.device_tokens IS
  'One row per physical device: the FCM token, its owning user, and their role. Replaces the single users.fcm_token column so a user can be reached on every device they are signed into. device_id (SecureStore) is the upsert key; the sender unions this table with users.fcm_token during rollout.';

-- Sender looks up "all active tokens for these user ids".
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_active
  ON public.device_tokens (user_id) WHERE is_active;
-- Prune-by-token (FCM says a token is dead) and dedupe.
CREATE INDEX IF NOT EXISTS idx_device_tokens_token
  ON public.device_tokens (token);

-- Keep updated_at honest (the updated_at trigger the rest of the schema uses).
DROP TRIGGER IF EXISTS set_device_tokens_updated_at ON public.device_tokens;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER set_device_tokens_updated_at
      BEFORE UPDATE ON public.device_tokens
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ── Grants + RLS ─────────────────────────────────────────────────────────────
-- The mobile app talks to Supabase as the token-less `anon` role (it has no
-- Supabase session yet — the Supabase-Auth cutover is still pending). It registers
-- and unregisters its OWN device row directly, exactly as it writes users.fcm_token
-- today, so anon needs INSERT/UPDATE/DELETE here. It deliberately does NOT get
-- SELECT: only the server (service_role, which bypasses RLS) ever reads tokens, so
-- anon cannot enumerate anyone's devices. This mirrors the current interim posture
-- of public.users; when the Supabase-Auth hardening lands (see
-- supabase_auth_rls_hardening.sql) REPLACE the permissive policy below with an
-- auth-scoped one (user_id = public.current_app_user_id()) alongside the users table.
GRANT INSERT, UPDATE, DELETE ON public.device_tokens TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated, service_role;
-- Supabase's default privileges auto-grant SELECT on every new public table to anon
-- and authenticated. Revoke it here: the token-less client must WRITE its own device
-- row but must never READ (enumerate) anyone's tokens — only the server (service_role,
-- which bypasses grants+RLS) reads. Without this, the public anon key could dump the
-- whole table once devices register.
REVOKE SELECT ON public.device_tokens FROM anon, authenticated;

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Write-only policies for the interim token-less client. There is deliberately NO
-- SELECT policy, so RLS denies reads even if a SELECT grant ever reappears (defence in
-- depth over the REVOKE above). Replace all three with an auth-scoped policy
-- (user_id = public.current_app_user_id()) at the Supabase-Auth hardening cutover.
DROP POLICY IF EXISTS "device_tokens interim client write" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens client insert" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens client update" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens client delete" ON public.device_tokens;
CREATE POLICY "device_tokens client insert" ON public.device_tokens FOR INSERT WITH CHECK (true);
CREATE POLICY "device_tokens client update" ON public.device_tokens FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "device_tokens client delete" ON public.device_tokens FOR DELETE USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. push_deliveries — one row per send attempt (visibility into failures)
-- ─────────────────────────────────────────────────────────────────────────────
-- The requirement asks that we track send/delivery outcomes where the platform
-- exposes them. FCM tells us per-token success/failure at send time; this records
-- those counts. Written ONLY by the server (service_role); never client-exposed.
CREATE TABLE IF NOT EXISTS public.push_deliveries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     uuid,                        -- sos_requests.id; not FK so a purged SOS never blocks logging
  event          text NOT NULL,               -- 'sos.created' | 'sos.cancelled' | ...
  audience       text NOT NULL,               -- 'primary' (patient/driver) | 'contact' (emergency contacts)
  recipients     integer NOT NULL DEFAULT 0,  -- tokens we attempted
  sent           integer NOT NULL DEFAULT 0,  -- FCM accepted
  failed         integer NOT NULL DEFAULT 0,  -- FCM rejected (transient or permanent)
  invalid        integer NOT NULL DEFAULT 0,  -- of `failed`, the permanently-dead tokens we pruned
  not_configured boolean NOT NULL DEFAULT false, -- FIREBASE_SERVICE_ACCOUNT missing/unparseable on this deploy
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.push_deliveries IS
  'Audit of every FCM send attempt (counts only, no token/PII): recipients/sent/failed/invalid per event+audience. Server-only (service_role). Query for delivery health; JOIN sos_requests on request_id.';

CREATE INDEX IF NOT EXISTS idx_push_deliveries_request ON public.push_deliveries (request_id);
CREATE INDEX IF NOT EXISTS idx_push_deliveries_created ON public.push_deliveries (created_at DESC);

-- Server-only: RLS on with NO anon/authenticated policy → deny-all to clients;
-- service_role bypasses RLS and does the inserts.
ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;
GRANT INSERT, SELECT ON public.push_deliveries TO service_role;
-- RLS-enabled with no client policy already denies all rows to anon/authenticated,
-- but drop the default SELECT grant too so it's locked at both layers.
REVOKE SELECT ON public.push_deliveries FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Verify (read-only)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM public.device_tokens)  AS device_token_rows,
  (SELECT count(*) FROM public.push_deliveries) AS delivery_log_rows;

-- =============================================================================
-- END PUSH MULTI-DEVICE + DELIVERY LOG PATCH
-- =============================================================================
