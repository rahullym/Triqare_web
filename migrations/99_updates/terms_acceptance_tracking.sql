-- =============================================================================
-- TERMS & CONDITIONS ACCEPTANCE TRACKING
-- Incremental patch to the live database. Apply like the other 99_updates
-- patches (Supabase SQL editor or psql). Idempotent: safe to re-run.
-- =============================================================================
--
-- Goal: for EVERY user, know (a) whether they have accepted the T&C, (b) which
-- exact version, and (c) when — plus keep a permanent, append-only audit record
-- of every version each user ever accepted. Never rely on a lone boolean flag.
--
-- Design:
--   1. Denormalised columns on `users` (terms_accepted / terms_version /
--      terms_accepted_at) — the fast read the Admin Dashboard listing & profile
--      render from. They always mirror the user's MOST RECENT acceptance.
--   2. `terms_acceptances` — append-only history/audit table. One row per
--      acceptance event. NEVER updated or deleted, so a version bump can never
--      erase evidence of a prior acceptance.
--   3. `configurations.current_terms_version` — the single source of truth for
--      "what is the current version". The dashboard derives status by comparing
--      each user's accepted `terms_version` against this:
--          NULL accepted          -> Not Accepted
--          accepted == current    -> Accepted
--          accepted != current    -> Outdated
--   4. `record_terms_acceptance(user_id, version)` — a SECURITY DEFINER RPC that
--      writes the history row AND refreshes the denormalised columns atomically.
--      Being SECURITY DEFINER it works from the mobile app (anon/authenticated
--      Supabase client) and the web, independent of the live RLS posture, so
--      neither surface needs direct write access to these tables.
--
-- Bumping the version later: ship the new T&C text in the app with a new version
-- string AND run:
--   UPDATE public.configurations SET value = 'v2.0', updated_at = now()
--    WHERE key = 'current_terms_version';
-- Every user who accepted an older version then reads as "Outdated" until they
-- re-accept (the mobile app prompts them on next launch). No rows are deleted.
-- =============================================================================

-- 1. Denormalised "most recent acceptance" columns on users -------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS terms_accepted    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_version     text,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

COMMENT ON COLUMN public.users.terms_accepted IS
  'True once the user has accepted ANY T&C version. Whether it is the CURRENT version is derived by comparing terms_version to configurations.current_terms_version.';
COMMENT ON COLUMN public.users.terms_version IS
  'The exact T&C version string the user most recently accepted (e.g. v1.0). NULL = never accepted.';
COMMENT ON COLUMN public.users.terms_accepted_at IS
  'Timestamp of the user''s most recent T&C acceptance. NULL = never accepted.';

-- 2. Append-only acceptance history / audit -----------------------------------
CREATE TABLE IF NOT EXISTS public.terms_acceptances (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  terms_version text NOT NULL,
  accepted_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.terms_acceptances IS
  'Append-only audit log: one row per T&C acceptance event. Never updated or deleted — legal evidence of every version each user accepted.';

CREATE INDEX IF NOT EXISTS idx_terms_acceptances_user
  ON public.terms_acceptances(user_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_terms_acceptances_version
  ON public.terms_acceptances(terms_version);

-- RLS: no client touches this table directly. The dashboard reads it via the
-- service-role client (bypasses RLS); the mobile app writes it only through the
-- SECURITY DEFINER RPC below. We still enable RLS and add a read-own policy for
-- authenticated (web) sessions so a future "view my acceptance history" screen
-- works without loosening anything. Direct writes stay closed.
ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sb_auth: terms_acceptances select own" ON public.terms_acceptances;
CREATE POLICY "sb_auth: terms_acceptances select own" ON public.terms_acceptances
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = terms_acceptances.user_id
         AND u.auth_user_id = auth.uid()
    )
  );

-- 3. Current version — source of truth ----------------------------------------
-- Seed the current version. ON CONFLICT DO NOTHING so re-running never clobbers
-- a value an admin has since bumped.
INSERT INTO public.configurations (key, value)
VALUES ('current_terms_version', 'v1.0')
ON CONFLICT (key) DO NOTHING;

-- 4. Atomic recording RPC ------------------------------------------------------
-- Returns void (the caller doesn't need the row, and returning a table-row type
-- to the anon role can trip PostgREST RLS-on-return handling).
CREATE OR REPLACE FUNCTION public.record_terms_acceptance(
  p_user_id uuid,
  p_version text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now     timestamptz := now();
  v_version text        := btrim(p_version);
BEGIN
  IF p_user_id IS NULL OR v_version IS NULL OR v_version = '' THEN
    RAISE EXCEPTION 'record_terms_acceptance requires a non-null user id and version';
  END IF;

  -- Never write an orphan audit row for a user that does not exist.
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'record_terms_acceptance: no user with id %', p_user_id;
  END IF;

  -- (a) Append the permanent audit record.
  INSERT INTO public.terms_acceptances (user_id, terms_version, accepted_at)
  VALUES (p_user_id, v_version, v_now);

  -- (b) Refresh the denormalised "latest acceptance" columns.
  UPDATE public.users
     SET terms_accepted    = true,
         terms_version     = v_version,
         terms_accepted_at = v_now,
         updated_at        = v_now
   WHERE id = p_user_id;
END;
$$;

-- Lock down then grant execute to the roles the app clients run as. Being
-- SECURITY DEFINER, execution bypasses RLS on the affected tables.
REVOKE ALL ON FUNCTION public.record_terms_acceptance(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_terms_acceptance(uuid, text)
  TO anon, authenticated, service_role;

-- Verify (optional):
--   SELECT terms_accepted, terms_version, terms_accepted_at
--     FROM public.users WHERE id = '<uuid>';
--   SELECT * FROM public.terms_acceptances WHERE user_id = '<uuid>' ORDER BY accepted_at DESC;
--
-- Rollback, if ever needed:
--   DROP FUNCTION IF EXISTS public.record_terms_acceptance(uuid, text);
--   DROP TABLE IF EXISTS public.terms_acceptances;
--   ALTER TABLE public.users
--     DROP COLUMN IF EXISTS terms_accepted,
--     DROP COLUMN IF EXISTS terms_version,
--     DROP COLUMN IF EXISTS terms_accepted_at;
--   DELETE FROM public.configurations WHERE key = 'current_terms_version';
