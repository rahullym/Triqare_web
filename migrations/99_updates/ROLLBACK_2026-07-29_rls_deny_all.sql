-- ROLLBACK: undo supabase_auth_rls_hardening.sql on the live project
-- (uwuwpfdhpoimvibunffz). Restores the permissive-but-working state the app
-- ran in before the hardening was applied on 2026-07-29.
--
-- WHY THIS IS NEEDED
-- The hardening dropped the Clerk-era policies, ENABLEd RLS on the six core
-- tables and REVOKEd anon's SELECT on public.users. The Phase-1 policies that
-- were supposed to replace them (supabase_auth_migration.sql) were never
-- applied: public.current_app_user_id() does not exist (PGRST202). The result
-- is RLS enabled with ZERO applicable policies, which PostgreSQL treats as
-- deny-all for every role except service_role.
--
-- PROVEN ON DEVICE 2026-07-29 21:51 IST, build vc29:
--   * Google OAuth completes and a Supabase session IS created
--     (kprahul1992@gmail.com, last_sign_in_at 16:21:56Z).
--   * The matching public.users row exists and is correctly linked
--     (id 4f893d99…, role 'patient', auth_user_id d84653a7… == the auth uid).
--   * Reading that exact row over REST returns 42501 permission denied.
--   * The app therefore never resolves appUser and hangs forever on
--     "Setting up your account…".
--
-- THIS IS A ROLLBACK, NOT A FIX. It reopens the PII exposure that the
-- hardening was written to close: with RLS disabled and anon holding SELECT,
-- anyone with the public anon key can read every user, patient and SOS row.
-- Apply it to get UAT moving, then fix forward with Phase 1 + the three
-- missing policies (driver-sees-unassigned-SOS, emergency-contact reciprocal
-- lookup, cross-user reads) before go-live.

BEGIN;

-- 1. Disable RLS on the tables the hardening enabled it for.
ALTER TABLE public.users              DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_contacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_requests       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications      DISABLE ROW LEVEL SECURITY;

-- 2. Restore the grant the hardening revoked. Without this, public.users stays
--    42501 for anon even with RLS off — the grant and the policy are separate
--    gates and the hardening closed both.
GRANT SELECT ON public.users TO anon;

-- 3. The app also writes these during sign-in/registration and token refresh.
GRANT SELECT, INSERT, UPDATE ON public.users              TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.patients           TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.drivers            TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.emergency_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sos_requests       TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notifications      TO authenticated;

COMMIT;

-- VERIFY (expect rowsecurity = false for all six):
--   SELECT relname, relrowsecurity
--   FROM pg_class
--   WHERE relnamespace = 'public'::regnamespace
--     AND relname IN ('users','patients','drivers',
--                     'emergency_contacts','sos_requests','notifications');
--
-- Then re-run the on-device check: the app should move past
-- "Setting up your account…" into the patient home screen.
