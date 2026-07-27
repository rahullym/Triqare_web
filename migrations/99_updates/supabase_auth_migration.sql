-- =============================================================================
-- SUPABASE AUTH MIGRATION — PHASE 1 (ADDITIVE / NON-BREAKING)
-- =============================================================================
-- Moves identity from Clerk to Supabase Auth (GoTrue) WITHOUT breaking anything
-- that is still on the old path. Safe to apply on staging AND production before any
-- app code ships, and safe to re-run (idempotent).
--
-- WHAT THIS DOES
--   1. Adds public.users.auth_user_id (uuid) -> auth.users.id. This is the new
--      identity link. public.users.id (the uuid every child table already FKs to)
--      is UNTOUCHED, so the whole relational graph migrates with zero FK changes.
--   2. Relaxes users.clerk_user_id to NULLable (Supabase-provisioned users have no
--      Clerk id). The UNIQUE index stays (Postgres allows many NULLs).
--   3. Adds handle_new_auth_user(): a trigger on auth.users that, on every new
--      Supabase auth user, LINKS an existing public.users row by email (preserving
--      its id/role/children — this is the "auto link-by-email" migration of
--      existing accounts) or INSERTS a fresh row (default role 'patient').
--   4. Adds current_app_user_id(): resolves the caller's public.users.id from their
--      Supabase session (auth.uid()), for use in RLS.
--   5. ADDS new permissive RLS policies keyed on auth_user_id, scoped TO
--      authenticated. These run ALONGSIDE the existing Clerk-era policies; nothing
--      is dropped and RLS ENABLE state is not toggled, so the still-anon mobile app
--      is completely unaffected. Once a user authenticates via Supabase, their
--      authenticated-role session matches these new policies.
--
-- WHAT THIS DELIBERATELY DOES NOT DO (deferred to the joint web+mobile cutover,
-- see supabase_auth_rls_hardening.sql):
--   * drop the old `auth.uid()::text = clerk_user_id` policies
--   * ENABLE/force RLS or change grants (would risk the still-anon mobile client)
--   * drop the clerk_user_id column (kept for rollback + backfill)
--
-- SECURITY NOTE on role assignment: new self-signups are ALWAYS created as
-- 'patient'. The trigger only honors a non-patient role when it is supplied in the
-- auth user's APP metadata (raw_app_meta_data), which is settable only by the
-- service-role Admin API — never by a self-service signup. So a user cannot escalate
-- their own role by passing user_metadata at sign-up.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. IDENTITY COLUMN
-- -----------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

-- FK to auth.users; ON DELETE SET NULL so deleting a Supabase auth user does NOT
-- cascade-delete the app row (deletion of app data is done explicitly by the app /
-- admin tools, matching the current Clerk delete flow).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_auth_user_id_fkey'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_auth_user_id_fkey
      FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- One Supabase auth user maps to at most one app user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_user_id
  ON public.users (auth_user_id);

-- Supabase-provisioned users have no Clerk id.
ALTER TABLE public.users ALTER COLUMN clerk_user_id DROP NOT NULL;

COMMENT ON COLUMN public.users.auth_user_id IS
  'Supabase Auth user id (auth.users.id). New identity link, replacing clerk_user_id. Set on first Supabase login by handle_new_auth_user().';

-- -----------------------------------------------------------------------------
-- 2. IDENTITY HELPER — caller''s public.users.id from their Supabase session
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER so it can read public.users regardless of RLS (no recursion:
-- the function owner bypasses RLS on users). STABLE so the planner caches it per
-- statement. Returns NULL when unauthenticated or unlinked -> RLS predicates that
-- compare against it then evaluate to NULL (deny), which is correct.
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. PROVISIONING TRIGGER — link-by-email OR insert, on every new auth user
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_user_meta   jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  v_app_meta    jsonb := coalesce(NEW.raw_app_meta_data,  '{}'::jsonb);
  -- Trusted role source: app_metadata (service-role only). Self-signups can never
  -- set this, so they always fall through to 'patient'.
  v_role        text  := coalesce(v_app_meta->>'role', 'patient');
  v_first       text  := coalesce(v_user_meta->>'first_name', v_user_meta->>'firstName');
  v_last        text  := coalesce(v_user_meta->>'last_name',  v_user_meta->>'lastName');
  v_full        text  := coalesce(
                           v_user_meta->>'full_name',
                           v_user_meta->>'name',
                           nullif(trim(coalesce(v_user_meta->>'first_name','') || ' ' ||
                                       coalesce(v_user_meta->>'last_name','')), '')
                         );
BEGIN
  IF v_role NOT IN ('admin','ert','transport_company','patient','driver') THEN
    v_role := 'patient';
  END IF;

  -- Link an existing (Clerk-era or admin-provisioned) row by email. Case-insensitive
  -- because GoTrue lowercases emails while legacy rows may be mixed-case. Oldest row
  -- wins if there is ever a duplicate.
  SELECT id INTO v_existing_id
  FROM public.users
  WHERE lower(email) = lower(NEW.email)
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Preserve the existing row's role/children; just attach the auth identity.
    UPDATE public.users
       SET auth_user_id    = NEW.id,
           last_sign_in_at = now(),
           updated_at      = now()
     WHERE id = v_existing_id;
  ELSE
    -- Brand-new user: id == auth.users.id so id == auth.uid() for fresh accounts.
    INSERT INTO public.users (id, auth_user_id, email, first_name, last_name, full_name, role, is_active)
    VALUES (NEW.id, NEW.id, NEW.email, v_first, v_last, v_full, v_role, true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- 4. ADDITIVE RLS POLICIES (keyed on Supabase auth, scoped TO authenticated)
-- -----------------------------------------------------------------------------
-- These are added alongside the existing Clerk-era policies. They do NOT drop
-- anything and do NOT toggle RLS enablement, so anon (mobile, still token-less)
-- behavior is unchanged. Distinct names prevent collisions with the old policies.

-- USERS: own row by auth link.
DROP POLICY IF EXISTS "sb_auth: users select own" ON public.users;
CREATE POLICY "sb_auth: users select own" ON public.users
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "sb_auth: users update own" ON public.users;
CREATE POLICY "sb_auth: users update own" ON public.users
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- PATIENTS (user_id -> users.id)
DROP POLICY IF EXISTS "sb_auth: patients select own" ON public.patients;
CREATE POLICY "sb_auth: patients select own" ON public.patients
  FOR SELECT TO authenticated
  USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "sb_auth: patients insert own" ON public.patients;
CREATE POLICY "sb_auth: patients insert own" ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "sb_auth: patients update own" ON public.patients;
CREATE POLICY "sb_auth: patients update own" ON public.patients
  FOR UPDATE TO authenticated
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

-- DRIVERS (user_id -> users.id)
DROP POLICY IF EXISTS "sb_auth: drivers select own" ON public.drivers;
CREATE POLICY "sb_auth: drivers select own" ON public.drivers
  FOR SELECT TO authenticated
  USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "sb_auth: drivers insert own" ON public.drivers;
CREATE POLICY "sb_auth: drivers insert own" ON public.drivers
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "sb_auth: drivers update own" ON public.drivers;
CREATE POLICY "sb_auth: drivers update own" ON public.drivers
  FOR UPDATE TO authenticated
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

-- EMERGENCY_CONTACTS (patient_id -> patients.user_id -> users.id)
DROP POLICY IF EXISTS "sb_auth: emergency_contacts select own" ON public.emergency_contacts;
CREATE POLICY "sb_auth: emergency_contacts select own" ON public.emergency_contacts
  FOR SELECT TO authenticated
  USING (patient_id = public.current_app_user_id());

DROP POLICY IF EXISTS "sb_auth: emergency_contacts insert own" ON public.emergency_contacts;
CREATE POLICY "sb_auth: emergency_contacts insert own" ON public.emergency_contacts
  FOR INSERT TO authenticated
  WITH CHECK (patient_id = public.current_app_user_id());

DROP POLICY IF EXISTS "sb_auth: emergency_contacts update own" ON public.emergency_contacts;
CREATE POLICY "sb_auth: emergency_contacts update own" ON public.emergency_contacts
  FOR UPDATE TO authenticated
  USING (patient_id = public.current_app_user_id())
  WITH CHECK (patient_id = public.current_app_user_id());

DROP POLICY IF EXISTS "sb_auth: emergency_contacts delete own" ON public.emergency_contacts;
CREATE POLICY "sb_auth: emergency_contacts delete own" ON public.emergency_contacts
  FOR DELETE TO authenticated
  USING (patient_id = public.current_app_user_id());

-- SOS_REQUESTS — patient owner (patient_id -> users.id) and assigned driver
-- (driver_id -> users.id). Mirrors the split ownership from the Clerk-era policies.
DROP POLICY IF EXISTS "sb_auth: sos select own" ON public.sos_requests;
CREATE POLICY "sb_auth: sos select own" ON public.sos_requests
  FOR SELECT TO authenticated
  USING (
    patient_id = public.current_app_user_id()
    OR (driver_id IS NOT NULL AND driver_id = public.current_app_user_id())
  );

DROP POLICY IF EXISTS "sb_auth: sos insert own" ON public.sos_requests;
CREATE POLICY "sb_auth: sos insert own" ON public.sos_requests
  FOR INSERT TO authenticated
  WITH CHECK (patient_id = public.current_app_user_id());

-- USING admits an unassigned request (any driver may claim) or the patient's/driver's
-- own row; WITH CHECK forbids assigning the row to anyone but the acting driver (or
-- the patient updating their own request). Server-side service_role dispatch bypasses
-- RLS and is unaffected.
DROP POLICY IF EXISTS "sb_auth: sos update own" ON public.sos_requests;
CREATE POLICY "sb_auth: sos update own" ON public.sos_requests
  FOR UPDATE TO authenticated
  USING (
    patient_id = public.current_app_user_id()
    OR driver_id IS NULL
    OR driver_id = public.current_app_user_id()
  )
  WITH CHECK (
    patient_id = public.current_app_user_id()
    OR (driver_id IS NOT NULL AND driver_id = public.current_app_user_id())
  );

-- NOTIFICATIONS (user_id -> users.id)
DROP POLICY IF EXISTS "sb_auth: notifications select own" ON public.notifications;
CREATE POLICY "sb_auth: notifications select own" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "sb_auth: notifications update own" ON public.notifications;
CREATE POLICY "sb_auth: notifications update own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = public.current_app_user_id());

DROP POLICY IF EXISTS "sb_auth: notifications delete own" ON public.notifications;
CREATE POLICY "sb_auth: notifications delete own" ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = public.current_app_user_id());

-- =============================================================================
-- END PHASE 1. After both web AND mobile send Supabase tokens, apply
-- supabase_auth_rls_hardening.sql to drop the Clerk-era policies, guarantee RLS is
-- ENABLED, and revoke the anon SELECT on users.
-- =============================================================================
