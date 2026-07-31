-- =============================================================================
-- RLS HARDENING — GATED. DO NOT RUN YET.
-- =============================================================================
-- This is the step that actually closes the PII hole: it ENABLEs RLS on the six
-- core tables and REVOKEs anon's SELECT on public.users. It supersedes
-- supabase_auth_rls_hardening.sql, which is the file that caused the 2026-07-29
-- outage when it was run without Phase 1.
--
-- Phase 1 + the supplemental policies are now safe to apply on their own — while
-- RLS is DISABLED every policy is inert, so creating them changes nothing. THIS
-- file is the only one with a blast radius, which is why it is separated.
--
-- -----------------------------------------------------------------------------
-- LIVE STATE, MEASURED 2026-07-31
-- -----------------------------------------------------------------------------
--   public.users rows ................................ 30
--   with auth_user_id set ............................ 30   <- guard below passes
--   distinct users in SOS activity (30d) ............. 13, all linked
--   anon SELECT on users/patients/drivers/
--     emergency_contacts/sos_requests ................ OPEN (the exposure)
--   current_app_user_id() ............................ ABSENT (Phase 1 not applied)
--
-- The user-linkage prerequisite that failed in July is now SATISFIED. The
-- blocker is no longer the data — it is the application code.
--
-- -----------------------------------------------------------------------------
-- WHY THIS IS STILL BLOCKED — 75 anon-key call sites
-- -----------------------------------------------------------------------------
-- src/lib/supabase.ts builds a client from NEXT_PUBLIC_SUPABASE_ANON_KEY with no
-- session attached. 75 files import it. Under RLS those requests run as `anon`
-- and every one of them returns empty:
--
--   42  API routes under src/app/api/**      (server-side, but on the ANON key,
--                                             not the service_role client in
--                                             src/lib/supabase/server.ts)
--    9  dashboard pages under src/app/(dashboard)/**
--   24  hooks / components / other  (incl. src/hooks/useUsersRealtime.ts)
--
-- Files touching each protected table via that anon client:
--   users 25 · drivers 15 · sos_requests 15 · patients 12 · emergency_contacts 5
--
-- Running this file today would blank the admin dashboard and those API routes
-- the same way 2026-07-29 blanked the mobile app — a strictly larger blast
-- radius than the outage it is meant to prevent a repeat of.
--
-- -----------------------------------------------------------------------------
-- PREREQUISITES — all must be true before uncommenting STEP 2/3 below
-- -----------------------------------------------------------------------------
--   [ ] Phase 1 (supabase_auth_migration.sql) applied
--   [ ] RESTORE_2026-07-29_rls_supplemental.sql applied
--   [ ] Every src/app/api/** route that reads a protected table imports the
--       service_role client from '@/lib/supabase/server', NOT '@/lib/supabase'
--   [ ] Every (dashboard) page and hook reads through an authenticated session
--       client (or a server route), never the bare anon client
--   [ ] Mobile verified on-device against Phase 1 policies (patient home, SOS
--       history, contacts, driver queue, EC "I'm a Contact For")
--   [ ] Verified during a low-traffic window with the rollback below to hand
-- =============================================================================


-- -----------------------------------------------------------------------------
-- STEP 1 — GUARD. Safe to run now; it only reports. Refuses to proceed if any
-- active user would be locked out, which is the failure mode that produced the
-- July outage.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_unlinked int;
  v_helper   boolean;
BEGIN
  SELECT count(*) INTO v_unlinked
  FROM public.users
  WHERE is_active AND auth_user_id IS NULL;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_app_user_id'
  ) INTO v_helper;

  IF NOT v_helper THEN
    RAISE EXCEPTION
      'current_app_user_id() is missing — Phase 1 was not applied. Enabling RLS now would deny-all exactly as on 2026-07-29. Apply supabase_auth_migration.sql and RESTORE_2026-07-29_rls_supplemental.sql first.';
  END IF;

  IF v_unlinked > 0 THEN
    RAISE EXCEPTION
      '% active user(s) have a NULL auth_user_id and would be locked out. Relink them before hardening.', v_unlinked;
  END IF;

  RAISE NOTICE 'Guard passed: helper present, 0 active users unlinked.';
END $$;


-- -----------------------------------------------------------------------------
-- STEP 2 — Drop the Clerk-era policies. UNCOMMENT ONLY WHEN THE CHECKLIST IS DONE.
-- -----------------------------------------------------------------------------
-- DROP POLICY IF EXISTS "Users can view own data"                    ON public.users;
-- DROP POLICY IF EXISTS "Users can update own data"                  ON public.users;
-- DROP POLICY IF EXISTS "Patients can view own data"                 ON public.patients;
-- DROP POLICY IF EXISTS "Patients can update own data"               ON public.patients;
-- DROP POLICY IF EXISTS "Drivers can view own data"                  ON public.drivers;
-- DROP POLICY IF EXISTS "Drivers can update own data"                ON public.drivers;
-- DROP POLICY IF EXISTS "Patients can view own emergency contacts"   ON public.emergency_contacts;
-- DROP POLICY IF EXISTS "Patients can insert own emergency contacts" ON public.emergency_contacts;
-- DROP POLICY IF EXISTS "Patients can update own emergency contacts" ON public.emergency_contacts;
-- DROP POLICY IF EXISTS "Patients can delete own emergency contacts" ON public.emergency_contacts;
-- DROP POLICY IF EXISTS "Patients can view own SOS requests"         ON public.sos_requests;
-- DROP POLICY IF EXISTS "Patients can create own SOS requests"       ON public.sos_requests;
-- DROP POLICY IF EXISTS "Patients can update own SOS requests"       ON public.sos_requests;
-- DROP POLICY IF EXISTS "Assigned driver can view SOS request"       ON public.sos_requests;
-- DROP POLICY IF EXISTS "Assigned driver can update SOS request"     ON public.sos_requests;
-- DROP POLICY IF EXISTS notifications_select_own                     ON public.notifications;
-- DROP POLICY IF EXISTS notifications_update_own                     ON public.notifications;
-- DROP POLICY IF EXISTS notifications_delete_own                     ON public.notifications;
--
-- "Service role can insert users" and "notifications_insert_system" are RETAINED:
-- provisioning and system notification inserts run under service_role.


-- -----------------------------------------------------------------------------
-- STEP 3 — Enable RLS and close the anon read. UNCOMMENT WITH STEP 2.
-- -----------------------------------------------------------------------------
-- ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.patients           ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.drivers            ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.sos_requests       ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.notifications      ENABLE ROW LEVEL SECURITY;
--
-- REVOKE SELECT ON public.users FROM anon;


-- =============================================================================
-- ROLLBACK — keep this in a second SQL editor tab before running STEP 2/3.
-- Restores the current (permissive, working) state in one statement block.
-- =============================================================================
-- BEGIN;
--   ALTER TABLE public.users              DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.patients           DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.drivers            DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.emergency_contacts DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.sos_requests       DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.notifications      DISABLE ROW LEVEL SECURITY;
--   GRANT SELECT ON public.users TO anon;
-- COMMIT;


-- =============================================================================
-- VERIFY after STEP 3 — every table must show rls_enabled = true AND a non-zero
-- select_policies count. true with 0 policies is deny-all: roll back immediately.
-- =============================================================================
-- SELECT c.relname                     AS table_name,
--        c.relrowsecurity              AS rls_enabled,
--        count(pol.polname) FILTER (WHERE pol.polcmd IN ('r','*')) AS select_policies
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- LEFT JOIN pg_policy pol ON pol.polrelid = c.oid
-- WHERE n.nspname = 'public'
--   AND c.relname IN ('users','patients','drivers','emergency_contacts',
--                     'sos_requests','notifications')
-- GROUP BY c.relname, c.relrowsecurity
-- ORDER BY c.relname;
