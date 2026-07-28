-- =============================================================================
-- FIX: Supabase-auth user provisioning (trigger + backfill)
-- Run in the Supabase SQL Editor (SQL Editor runs as a role that CAN create
-- triggers on auth.users). Idempotent + safe to re-run.
--
-- Symptom: OAuth / email signups land on "Account Setup Required" (no role),
-- even though a public.users row with role='patient' exists. Root cause: the
-- on_auth_user_created trigger is NOT active on the live DB, so the new
-- auth.users row is never linked to public.users (auth_user_id stays NULL).
-- RLS ("sb_auth: users select own" USING auth_user_id = auth.uid()) then hides
-- the row from the signed-in user, so the app sees no role.
-- =============================================================================

-- 1. (Re)create the provisioning function (same logic as supabase_auth_migration.sql).
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

  SELECT id INTO v_existing_id
  FROM public.users
  WHERE lower(email) = lower(NEW.email)
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.users
       SET auth_user_id    = NEW.id,
           last_sign_in_at = now(),
           updated_at      = now()
     WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.users (id, auth_user_id, email, first_name, last_name, full_name, role, is_active)
    VALUES (NEW.id, NEW.id, NEW.email, v_first, v_last, v_full, v_role, true);
  END IF;

  RETURN NEW;
END;
$$;

-- 2. (Re)create the trigger — THIS is the piece that was missing on live.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 3. Backfill: link every already-existing public.users row to its auth user by
--    email (case-insensitive). Fixes accounts (like kprahul1992@gmail.com) that
--    signed in before the trigger worked.
UPDATE public.users u
   SET auth_user_id = au.id,
       updated_at   = now()
  FROM auth.users au
 WHERE u.auth_user_id IS NULL
   AND lower(u.email) = lower(au.email);

-- 4. Backfill: create a patient row for any auth user that has NO public.users
--    row at all (brand-new emails that signed up while the trigger was inactive).
INSERT INTO public.users (id, auth_user_id, email, full_name, role, is_active)
SELECT au.id, au.id, au.email,
       coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name'),
       'patient', true
  FROM auth.users au
 WHERE NOT EXISTS (
   SELECT 1 FROM public.users u
    WHERE u.auth_user_id = au.id
       OR lower(u.email) = lower(au.email)
 );

-- 5. Verify the reported account is now linked with role = patient.
SELECT id, email, role, auth_user_id
  FROM public.users
 WHERE lower(email) = 'kprahul1992@gmail.com';

-- 6. Verify no auth user is left unlinked (should return 0 rows).
SELECT au.id, au.email
  FROM auth.users au
  LEFT JOIN public.users u ON u.auth_user_id = au.id
 WHERE u.id IS NULL;
