-- =============================================================================
-- SUPABASE AUTH MIGRATION — RLS HARDENING (CUTOVER-ONLY, DESTRUCTIVE)
-- =============================================================================
-- DO NOT apply until BOTH the web app AND the mobile app authenticate via Supabase
-- and send a Supabase access token on every request. Applying this while any client
-- still uses the anon/token-less Supabase client will lock that client out (its
-- requests run as `anon`, which these policies do not admit).
--
-- Prerequisite: supabase_auth_migration.sql (Phase 1) has been applied and every
-- active user row has a non-NULL auth_user_id (verify before running — see the
-- guard query at the bottom).
--
-- WHAT THIS DOES
--   1. Drops the Clerk-era `auth.uid()::text = clerk_user_id` policies now that the
--      additive `sb_auth: *` policies (Phase 1) are the sole access path.
--   2. Guarantees RLS is ENABLED on the per-user tables.
--   3. Revokes the anon SELECT grant on public.users (only the token-less mobile app
--      needed it; after cutover nothing anonymous should read user rows).
--
-- Idempotent / safe to re-run. This file is intentionally NOT wired into deploy.sql
-- until the cutover is complete.
-- =============================================================================

-- 1. Drop Clerk-era policies (the new sb_auth policies remain in force) ---------
DROP POLICY IF EXISTS "Users can view own data"                      ON public.users;
DROP POLICY IF EXISTS "Users can update own data"                    ON public.users;
DROP POLICY IF EXISTS "Patients can view own data"                   ON public.patients;
DROP POLICY IF EXISTS "Patients can update own data"                 ON public.patients;
DROP POLICY IF EXISTS "Drivers can view own data"                    ON public.drivers;
DROP POLICY IF EXISTS "Drivers can update own data"                  ON public.drivers;
DROP POLICY IF EXISTS "Patients can view own emergency contacts"     ON public.emergency_contacts;
DROP POLICY IF EXISTS "Patients can insert own emergency contacts"   ON public.emergency_contacts;
DROP POLICY IF EXISTS "Patients can update own emergency contacts"   ON public.emergency_contacts;
DROP POLICY IF EXISTS "Patients can delete own emergency contacts"   ON public.emergency_contacts;
DROP POLICY IF EXISTS "Patients can view own SOS requests"           ON public.sos_requests;
DROP POLICY IF EXISTS "Patients can create own SOS requests"         ON public.sos_requests;
DROP POLICY IF EXISTS "Patients can update own SOS requests"         ON public.sos_requests;
DROP POLICY IF EXISTS "Assigned driver can view SOS request"         ON public.sos_requests;
DROP POLICY IF EXISTS "Assigned driver can update SOS request"       ON public.sos_requests;
DROP POLICY IF EXISTS notifications_select_own                       ON public.notifications;
DROP POLICY IF EXISTS notifications_update_own                       ON public.notifications;
DROP POLICY IF EXISTS notifications_delete_own                       ON public.notifications;
-- The "Service role can insert users" (WITH CHECK true) and
-- "notifications_insert_system" (WITH CHECK true) policies are RETAINED —
-- provisioning + system notification inserts run under service_role.

-- 2. Guarantee RLS is enabled --------------------------------------------------
ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications      ENABLE ROW LEVEL SECURITY;

-- 3. Revoke the legacy anon read on users -------------------------------------
REVOKE SELECT ON public.users FROM anon;

-- Optional final cleanup, only after a stable period with no rollback need:
--   ALTER TABLE public.users DROP COLUMN clerk_user_id;
-- (Keep it for now as the rollback/backfill key.)

-- Guard query — run BEFORE this file and confirm it returns 0:
--   SELECT count(*) FROM public.users WHERE is_active AND auth_user_id IS NULL;
-- Any active user with a NULL auth_user_id has not yet logged in via Supabase and
-- WILL be locked out by this hardening. Invite/relink them first.
