-- =============================================================================
-- SOS TRIGGER SOURCE — emergency-contact-initiated emergencies  (#9)
-- =============================================================================
-- An authorised emergency contact must be able to raise an SOS on behalf of the
-- patient they are linked to, and the backend must record WHO triggered it and
-- FROM WHERE, distinctly from the patient doing it themselves.
--
-- Everything downstream is unchanged on purpose: the row lands in sos_requests
-- like any other, so trg_sos_set_expires_at stamps its deadline and
-- trg_notify_push_on_sos_change fans out driver dispatch + contact alerts. The
-- requirement that "the same driver discovery, alert, acceptance, tracking and
-- completion workflow must apply" is satisfied by construction rather than by a
-- parallel code path that could drift.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sos_requests
  ADD COLUMN IF NOT EXISTS triggered_by         text,
  ADD COLUMN IF NOT EXISTS triggered_by_user_id uuid REFERENCES public.users(id);

-- Backfill BEFORE the NOT NULL/CHECK below, or existing rows fail the constraint.
-- Every pre-existing SOS was patient-initiated: that was the only path that existed.
UPDATE public.sos_requests
   SET triggered_by = 'PATIENT'
 WHERE triggered_by IS NULL;

UPDATE public.sos_requests
   SET triggered_by_user_id = patient_id
 WHERE triggered_by_user_id IS NULL;

ALTER TABLE public.sos_requests
  ALTER COLUMN triggered_by SET DEFAULT 'PATIENT';

-- Set NOT NULL only once every row has a value (the backfill above).
DO $$
BEGIN
  ALTER TABLE public.sos_requests ALTER COLUMN triggered_by SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE WARNING 'could not set triggered_by NOT NULL: %', SQLERRM;
END $$;

ALTER TABLE public.sos_requests
  DROP CONSTRAINT IF EXISTS sos_requests_triggered_by_check;

ALTER TABLE public.sos_requests
  ADD CONSTRAINT sos_requests_triggered_by_check
  CHECK (triggered_by IN ('PATIENT', 'EMERGENCY_CONTACT'));

COMMENT ON COLUMN public.sos_requests.triggered_by IS
  'Trigger source: PATIENT (the patient pressed SOS) or EMERGENCY_CONTACT (an authorised contact raised it on their behalf).';

COMMENT ON COLUMN public.sos_requests.triggered_by_user_id IS
  'users.id of whoever actually triggered this SOS. Equals patient_id for PATIENT-triggered requests; the contact''s own user id for EMERGENCY_CONTACT ones.';

CREATE INDEX IF NOT EXISTS idx_sos_requests_triggered_by
  ON public.sos_requests (triggered_by);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Contact-initiated create
-- ─────────────────────────────────────────────────────────────────────────────
-- Why an RPC rather than a client INSERT:
--
--   a) AUTHORISATION is re-checked server-side. The client already gates the UI on
--      isAllocatedPatient(), but that is a client-side check over permissive RLS —
--      on its own it stops an honest mistake, not a crafted request.
--
--   b) LOCATION is resolved server-side, and this is the safety-critical part. If
--      the caller supplied coordinates, anyone could dispatch an ambulance to an
--      address of their choosing under a real patient's name. The contact is not
--      with the patient, so the only defensible location is the one the patient
--      themselves registered.
--
-- The link test mirrors getIncomingEmergencyContactLinks() in the mobile app
-- (services/emergency-contact-service.ts): a stored contact_user_id, OR an email
-- match, OR the last 10 phone digits. Keeping the two in step matters — if the
-- server were stricter the UI would offer a button that always failed.
--
-- Caller identity prefers the authenticated session and falls back to the passed
-- id for clients predating the Supabase Auth cutover. That fallback is the residual
-- weakness: it trusts a client-supplied id, exactly as every other write in this
-- app currently does. It still cannot raise an SOS for a patient the named contact
-- is not linked to, which is what this requirement asks for. Tighten it to
-- auth.uid()-only once every shipped build authenticates.
CREATE OR REPLACE FUNCTION public.create_sos_by_emergency_contact(
  p_patient_id      uuid,
  p_contact_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id      uuid;
  v_email          text;
  v_phone_last10   text;
  v_linked         boolean := false;
  v_patient_name   text;
  v_patient_phone  text;
  v_lat            numeric;
  v_lon            numeric;
  v_existing       uuid;
  v_new_id         uuid;
BEGIN
  IF p_patient_id IS NULL OR p_contact_user_id IS NULL THEN
    RAISE EXCEPTION 'patient and contact are required' USING ERRCODE = '22023';
  END IF;

  -- Prefer the authenticated caller; fall back to the supplied id (see header).
  BEGIN
    SELECT id INTO v_caller_id FROM public.users WHERE auth_user_id = auth.uid();
  EXCEPTION WHEN others THEN
    v_caller_id := NULL;
  END;
  v_caller_id := COALESCE(v_caller_id, p_contact_user_id);

  SELECT u.email,
         right(regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g'), 10)
    INTO v_email, v_phone_last10
    FROM public.users u
   WHERE u.id = v_caller_id;

  IF v_email IS NULL AND COALESCE(length(v_phone_last10), 0) < 10 THEN
    RAISE EXCEPTION 'not authorised for this patient' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.emergency_contacts ec
     WHERE ec.patient_id = p_patient_id
       AND (
            ec.contact_user_id = v_caller_id
         OR (v_email IS NOT NULL AND ec.email IS NOT NULL
             AND lower(trim(ec.email)) = lower(trim(v_email)))
         OR (length(COALESCE(v_phone_last10, '')) = 10
             AND right(regexp_replace(COALESCE(ec.phone, ''), '\D', '', 'g'), 10)
                 = v_phone_last10)
       )
  ) INTO v_linked;

  IF NOT v_linked THEN
    RAISE EXCEPTION 'not authorised for this patient' USING ERRCODE = '42501';
  END IF;

  -- Never open a second emergency alongside a live one. Returning the existing id
  -- (rather than raising) makes a double-tap idempotent: the contact lands on the
  -- SOS that is already running instead of seeing an error mid-emergency.
  SELECT id INTO v_existing
    FROM public.sos_requests
   WHERE patient_id = p_patient_id
     AND status NOT IN ('Arrived at Hospital', 'Cancelled', 'Timed Out')
   ORDER BY requested_at DESC
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT p.latitude, p.longitude
    INTO v_lat, v_lon
    FROM public.patients p
   WHERE p.user_id = p_patient_id;

  -- No known location → refuse. Dispatching an ambulance to a guess is worse than
  -- not dispatching: the caller is told to phone 108 instead.
  IF v_lat IS NULL OR v_lon IS NULL THEN
    RAISE EXCEPTION 'no known location for this patient' USING ERRCODE = '22004';
  END IF;

  SELECT NULLIF(trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
         u.phone
    INTO v_patient_name, v_patient_phone
    FROM public.users u
   WHERE u.id = p_patient_id;

  INSERT INTO public.sos_requests (
    patient_id, patient_name, patient_phone, status,
    location_lat, location_lon, auto_assigned, requested_at, status_history,
    triggered_by, triggered_by_user_id
  ) VALUES (
    p_patient_id, v_patient_name, v_patient_phone, 'SOS Triggered',
    v_lat, v_lon, true, now(),
    json_build_array(json_build_object(
      'status',    'SOS Triggered',
      'timestamp', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'actor',     'contact',
      'note',      'Triggered by emergency contact'
    ))::text,
    'EMERGENCY_CONTACT', v_caller_id
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.create_sos_by_emergency_contact(uuid, uuid) IS
  'Raise an SOS on behalf of a patient, callable only by one of their linked emergency contacts. Location comes from the patient profile, never the caller. Returns the new sos_requests.id, or the existing live one if an emergency is already running.';

GRANT EXECUTE ON FUNCTION public.create_sos_by_emergency_contact(uuid, uuid) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Verify (read-only)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  count(*)                                                    AS total_requests,
  count(*) FILTER (WHERE triggered_by = 'PATIENT')            AS by_patient,
  count(*) FILTER (WHERE triggered_by = 'EMERGENCY_CONTACT')  AS by_contact,
  count(*) FILTER (WHERE triggered_by IS NULL)                AS unclassified
FROM public.sos_requests;

-- =============================================================================
-- END SOS TRIGGER SOURCE PATCH
-- =============================================================================
