-- =============================================================================
-- EMERGENCY-CONTACT → USER ACCOUNT LINKING
-- =============================================================================
-- Problem (verified 2026-07-27): adding an emergency contact only stored
-- name/email/phone under the OWNER (emergency_contacts.patient_id). When the
-- contact's email matched an EXISTING user account, NOTHING linked the record to
-- that account — so the contact PUSH (which targeted users.invited_by_user_id)
-- never reached them; only the email did. invited_by_user_id was set solely at a
-- brand-new account's signup, never for an account that already existed.
--
-- Fix: a real relational link. emergency_contacts.contact_user_id points at the
-- matched users.id, resolved automatically by email (case-insensitive) from BOTH
-- directions, plus a one-time backfill:
--   * contact inserted/email-edited        -> resolve from users   (trg on emergency_contacts)
--   * user created / changes their email    -> backfill matching contacts (trg on users)
--
-- The contact-push audience then joins emergency_contacts.contact_user_id ->
-- users.fcm_token (see src/lib/push/sosPush.ts). Email alerts are unaffected —
-- they key off emergency_contacts.email directly and never needed a link.
--
-- No app / APK change is required: resolution is entirely DB-side, so it works
-- for contacts added from the mobile app, the web app, or the admin tools.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- 1. The link column (nullable; distinct from patient_id, which is the OWNER).
ALTER TABLE public.emergency_contacts
  ADD COLUMN IF NOT EXISTS contact_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_emergency_contacts_contact_user_id
  ON public.emergency_contacts(contact_user_id);

COMMENT ON COLUMN public.emergency_contacts.contact_user_id IS
  'users.id of the account whose email matches this contact (auto-resolved by trigger). NULL if the contact has no account yet. Distinct from patient_id (the OWNER of the contact list).';

-- 2. Contact side: on insert or an email change, point contact_user_id at the
--    matching user account (or NULL when no account has that email yet).
CREATE OR REPLACE FUNCTION public.resolve_emergency_contact_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    NEW.contact_user_id := NULL;
  ELSE
    SELECT u.id
      INTO NEW.contact_user_id
      FROM public.users u
     WHERE lower(u.email) = lower(btrim(NEW.email))
     LIMIT 1;   -- users.email is UNIQUE, so at most one match
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolve_emergency_contact_user ON public.emergency_contacts;
CREATE TRIGGER trg_resolve_emergency_contact_user
  BEFORE INSERT OR UPDATE OF email ON public.emergency_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_emergency_contact_user();

-- 3. User side: when an account is created (or its email changes), backfill any
--    contact rows that already name that email. Handles the "added before they
--    signed up" ordering. Updates only contact_user_id, so it never re-fires the
--    email trigger above (no cascade).
CREATE OR REPLACE FUNCTION public.backfill_emergency_contact_links()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL AND btrim(NEW.email) <> '' THEN
    UPDATE public.emergency_contacts ec
       SET contact_user_id = NEW.id
     WHERE lower(ec.email) = lower(btrim(NEW.email))
       AND ec.contact_user_id IS DISTINCT FROM NEW.id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_backfill_emergency_contact_links ON public.users;
CREATE TRIGGER trg_backfill_emergency_contact_links
  AFTER INSERT OR UPDATE OF email ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.backfill_emergency_contact_links();

-- 4. One-time backfill of every EXISTING contact row against current accounts.
UPDATE public.emergency_contacts ec
   SET contact_user_id = u.id
  FROM public.users u
 WHERE ec.email IS NOT NULL
   AND lower(u.email) = lower(btrim(ec.email))
   AND ec.contact_user_id IS DISTINCT FROM u.id;

-- Verify (optional): how many contacts are now linked to a real account?
--   SELECT count(*) FILTER (WHERE contact_user_id IS NOT NULL) AS linked,
--          count(*) AS total
--   FROM public.emergency_contacts;
