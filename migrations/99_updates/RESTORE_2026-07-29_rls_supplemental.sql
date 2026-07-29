-- =============================================================================
-- RESTORE 2026-07-29 — supplemental RLS policies (Phase 1 companion)
-- =============================================================================
-- CONTEXT
-- `supabase_auth_rls_hardening.sql` was applied WITHOUT Phase 1
-- (`supabase_auth_migration.sql`). That dropped the Clerk-era policies and
-- ENABLEd RLS on six core tables while creating no replacements, so the tables
-- went deny-all: every authenticated read returns zero rows and only
-- service_role sees data. Symptom in the app: sign-in succeeds, then the client
-- cannot read its own public.users row, never resolves a role, and never routes
-- to the patient/driver home — it sits on "Setting up your account…" and then
-- "Couldn't find your account."
--
-- RUN ORDER — this file is STEP 2. It depends on current_app_user_id() and the
-- "sb_auth: …" policies from Phase 1.
--
--   1. migrations/99_updates/supabase_auth_migration.sql   <-- run this FIRST
--   2. migrations/99_updates/RESTORE_2026-07-29_rls_supplemental.sql  (this file)
--
-- Re-running Phase 1 is safe: its handle_new_auth_user() body is identical to
-- the newer fix_auth_user_provisioning_2026-07-28.sql already live, and every
-- policy is guarded by DROP POLICY IF EXISTS.
--
-- WHY THIS FILE EXISTS
-- Phase 1 covers "my own rows" only. Five real access patterns in the shipped
-- app read rows belonging to SOMEONE ELSE and would still return empty:
--
--   1. a driver listing UNASSIGNED pending SOS requests (dispatch)
--   2. an emergency contact finding the rows that name THEM (reciprocal view)
--   3. an emergency contact opening an allocated patient's SOS
--   4. cross-user identity reads (patient <-> driver, EC -> inviter)
--   5. the assigned driver reading their patient's medical record
--
-- Each helper below is SECURITY DEFINER because a subquery written inline in a
-- policy is itself RLS-filtered — it would evaluate against the deny-all tables
-- and return nothing, silently making the policy useless.
--
-- Everything here is additive: no DROP TABLE, no data change, no RLS toggling.
-- Safe to re-run.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. IDENTITY HELPERS
-- -----------------------------------------------------------------------------

-- Caller's own email, lowercased. NULL when unauthenticated/unlinked, which makes
-- any comparison against it evaluate NULL -> deny. That is the correct default.
CREATE OR REPLACE FUNCTION public.current_app_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(email) FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- Caller's role ('patient' | 'driver' | 'admin' | ...).
CREATE OR REPLACE FUNCTION public.current_app_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- Caller's phone reduced to its last 10 digits, or NULL if they have fewer than
-- 10. Contacts are stored in wildly different formats ("+91 98765 43210" vs
-- "9876543210"); last-10 is the comparison the app itself uses.
CREATE OR REPLACE FUNCTION public.current_app_user_phone_last10()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nullif(right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10), '')
  FROM public.users
  WHERE auth_user_id = auth.uid()
    AND length(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) >= 10
  LIMIT 1;
$$;

-- Does an emergency_contacts row name the CALLER? Mirrors the client's matching
-- rules in services/emergency-contact-service.ts: case-insensitive exact email,
-- or exact last-10-digit phone. contact_user_id is accepted too — it is the
-- stronger relational link added by emergency_contact_user_linking.sql.
CREATE OR REPLACE FUNCTION public.ec_row_names_me(
  p_contact_user_id uuid,
  p_email           text,
  p_phone           text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
       (p_contact_user_id IS NOT NULL AND p_contact_user_id = public.current_app_user_id())
    OR (public.current_app_user_email() IS NOT NULL
        AND lower(coalesce(p_email, '')) = public.current_app_user_email())
    OR (public.current_app_user_phone_last10() IS NOT NULL
        AND right(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 10)
            = public.current_app_user_phone_last10());
$$;

-- Is the caller an emergency contact OF p_patient? The server-side twin of
-- isAllocatedPatient() in the app, which gates the EC SOS screens.
CREATE OR REPLACE FUNCTION public.is_allocated_patient(p_patient uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.emergency_contacts ec
    WHERE ec.patient_id = p_patient
      AND ec.patient_id IS DISTINCT FROM public.current_app_user_id()  -- not self-added
      AND public.ec_row_names_me(ec.contact_user_id, ec.email, ec.phone)
  );
$$;

-- May the caller read p_target's public.users row? Covers every cross-user
-- identity read the app performs.
CREATE OR REPLACE FUNCTION public.can_read_user_profile(p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Counterparty on a shared SOS, in either direction:
    --   patient -> their assigned driver's name/phone
    --   driver  -> their patient's name/phone
    EXISTS (
      SELECT 1 FROM public.sos_requests s
      WHERE (s.patient_id = public.current_app_user_id() AND s.driver_id  = p_target)
         OR (s.driver_id  = public.current_app_user_id() AND s.patient_id = p_target)
    )
    -- Emergency contact -> the inviter (the patient who listed them).
    OR public.is_allocated_patient(p_target)
    -- Emergency contact -> the driver assigned to an allocated patient's SOS
    -- (the EC SOS screen shows and dials the driver).
    OR EXISTS (
      SELECT 1 FROM public.sos_requests s
      WHERE s.driver_id = p_target
        AND public.is_allocated_patient(s.patient_id)
    );
$$;

GRANT EXECUTE ON FUNCTION public.current_app_user_email()        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_app_user_role()         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_app_user_phone_last10() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ec_row_names_me(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_allocated_patient(uuid)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_user_profile(uuid)     TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. DRIVER DISPATCH — see UNASSIGNED pending SOS requests
-- -----------------------------------------------------------------------------
-- Phase 1's "sos select own" is patient_id/driver_id only, so a driver sees an
-- empty queue and dispatch is dead. The driver_id IS NULL clause exists on Phase
-- 1's UPDATE policy but not its SELECT — this supplies the matching SELECT.
-- Restricted to role='driver' so patients cannot enumerate other people's SOS.
DROP POLICY IF EXISTS "sb_auth: sos select unassigned for drivers" ON public.sos_requests;
CREATE POLICY "sb_auth: sos select unassigned for drivers" ON public.sos_requests
  FOR SELECT TO authenticated
  USING (
    driver_id IS NULL
    AND public.current_app_user_role() = 'driver'
  );

-- -----------------------------------------------------------------------------
-- 3. EMERGENCY CONTACT — reciprocal lookup ("I'm a Contact For")
-- -----------------------------------------------------------------------------
-- The EC needs rows where patient_id is SOMEONE ELSE and the email/phone names
-- them. Phase 1's "emergency_contacts select own" (patient_id = me) cannot
-- express this.
DROP POLICY IF EXISTS "sb_auth: emergency_contacts select naming me" ON public.emergency_contacts;
CREATE POLICY "sb_auth: emergency_contacts select naming me" ON public.emergency_contacts
  FOR SELECT TO authenticated
  USING (public.ec_row_names_me(contact_user_id, email, phone));

-- -----------------------------------------------------------------------------
-- 4. EMERGENCY CONTACT — read an allocated patient's SOS requests
-- -----------------------------------------------------------------------------
-- Powers the EC SOS Status & History screens and the push deep-link resolver.
DROP POLICY IF EXISTS "sb_auth: sos select for allocated contact" ON public.sos_requests;
CREATE POLICY "sb_auth: sos select for allocated contact" ON public.sos_requests
  FOR SELECT TO authenticated
  USING (public.is_allocated_patient(patient_id));

-- -----------------------------------------------------------------------------
-- 5. CROSS-USER IDENTITY READS
-- -----------------------------------------------------------------------------
-- Phase 1 restricts public.users to the caller's own row. Additive policy for
-- the legitimate counterparty reads enumerated in can_read_user_profile().
DROP POLICY IF EXISTS "sb_auth: users select counterparty" ON public.users;
CREATE POLICY "sb_auth: users select counterparty" ON public.users
  FOR SELECT TO authenticated
  USING (public.can_read_user_profile(id));

-- -----------------------------------------------------------------------------
-- 6. ASSIGNED DRIVER — read their patient's medical record
-- -----------------------------------------------------------------------------
-- app/(driver)/active-trip/[requestId].tsx calls getPatientProfile(patientId)
-- for blood group / allergies / hospital preference. Deliberately scoped to the
-- ASSIGNED driver: getPatientProfile is never called from the pending-queue
-- screen, so drivers cannot read medical data for requests they have not taken.
DROP POLICY IF EXISTS "sb_auth: patients select for assigned driver" ON public.patients;
CREATE POLICY "sb_auth: patients select for assigned driver" ON public.patients
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sos_requests s
      WHERE s.patient_id = patients.user_id
        AND s.driver_id  = public.current_app_user_id()
    )
  );

COMMIT;

-- =============================================================================
-- VERIFICATION — run AFTER the commit, as the signed-in app user is not possible
-- here, so these check structure. On-device verification notes at the bottom.
-- =============================================================================

-- 1. All six helper functions must exist.
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef                               AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('current_app_user_id', 'current_app_user_email',
                    'current_app_user_role', 'current_app_user_phone_last10',
                    'ec_row_names_me', 'is_allocated_patient',
                    'can_read_user_profile')
ORDER BY p.proname;

-- 2. Every core table must have at least one SELECT policy. A table listed with
--    rls_enabled = true and 0 policies is still deny-all.
SELECT c.relname                                   AS table_name,
       c.relrowsecurity                            AS rls_enabled,
       count(pol.polname) FILTER (WHERE pol.polcmd IN ('r', '*')) AS select_policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy pol ON pol.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relname IN ('users', 'patients', 'drivers', 'emergency_contacts',
                    'sos_requests', 'notifications')
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;

-- 3. Spot-check the policy list.
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE 'sb_auth:%'
ORDER BY tablename, policyname;

-- =============================================================================
-- ON-DEVICE CHECKS AFTER APPLYING (these are what actually prove it)
--   a. Patient signs in            -> lands on the patient home, not "Setting
--                                     up your account…" / "Couldn't find your
--                                     account."
--   b. Patient profile + SOS history + emergency contacts all load.
--   c. Driver signs in, goes online -> pending SOS queue is populated.
--   d. Driver accepts a trip        -> patient name/phone AND medical details show.
--   e. Emergency contact           -> "I'm a Contact For" lists their patients;
--                                     opening one shows live SOS status + driver.
-- =============================================================================
