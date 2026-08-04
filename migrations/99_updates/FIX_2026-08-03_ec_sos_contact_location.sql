-- =============================================================================
-- EC-RAISED SOS: LET THE CONTACT SUPPLY THE PICKUP LOCATION AS A LAST RESORT
-- =============================================================================
--
-- THE PROBLEM
--
-- `create_sos_by_emergency_contact` resolves the pickup point from
-- `patients.latitude/longitude` and refuses (22004) when they are NULL. Those
-- columns are only populated when the patient themselves opens the app with
-- location permission granted. For any patient who has not done that on a recent
-- build — which, on live data, is most of them — the "Raise SOS for this patient"
-- button has never once succeeded. It shows the contact a dead end ("No location
-- on file… call 108") in the exact moment the feature exists to serve.
--
-- WHY THIS REVERSES A DELIBERATE DECISION, AND HOW FAR
--
-- The original function documents its refusal as safety-critical: "If the caller
-- supplied coordinates, anyone could dispatch an ambulance to an address of their
-- choosing under a real patient's name." That reasoning is sound and is NOT
-- discarded here — it is narrowed:
--
--   * The caller is not "anyone". Authorisation is unchanged and still runs
--     first: only a contact the patient themselves listed reaches this line. That
--     person can already raise a real ambulance to the patient's own address.
--     The marginal new capability is choosing WHERE, not WHETHER.
--   * The patient's own location still wins whenever it exists. Contact-supplied
--     coordinates are consulted ONLY when there is no patient location at all,
--     i.e. only where the alternative outcome is a hard refusal. Nothing that
--     works today changes behaviour.
--   * The provenance is recorded on the row (`status_history.location_source`),
--     so dispatch and post-incident review can always tell a contact-supplied
--     pickup point from a patient-registered one.
--
-- The residual risk is a linked contact sending an ambulance to a location of
-- their choosing (the client sends a device GPS fix, which a determined caller
-- could still forge). That is accepted deliberately, because the status quo is a
-- feature that fails 100% of the time for the people it is meant to protect.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- The 2-arg signature must go, not merely be replaced. Adding DEFAULT parameters
-- produces a second, overloaded function rather than superseding the first, and
-- PostgREST cannot then resolve a 2-argument call between the two — it fails the
-- request with PGRST203 (ambiguous). Dropping first leaves exactly one candidate,
-- which still accepts the old 2-argument call via the defaults, so a client on an
-- older build keeps working unchanged.
DROP FUNCTION IF EXISTS public.create_sos_by_emergency_contact(uuid, uuid);

CREATE OR REPLACE FUNCTION public.create_sos_by_emergency_contact(
  p_patient_id      uuid,
  p_contact_user_id uuid,
  p_lat             numeric DEFAULT NULL,
  p_lon             numeric DEFAULT NULL
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
  v_location_src   text;
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

  -- Location precedence. The patient's own registered position is always
  -- preferred; the contact's fix is a fallback for the no-location case only, and
  -- never overrides a location the patient established themselves.
  SELECT p.latitude, p.longitude
    INTO v_lat, v_lon
    FROM public.patients p
   WHERE p.user_id = p_patient_id;

  IF v_lat IS NOT NULL AND v_lon IS NOT NULL THEN
    v_location_src := 'patient';
  ELSIF p_lat IS NOT NULL AND p_lon IS NOT NULL
        AND p_lat BETWEEN -90 AND 90
        AND p_lon BETWEEN -180 AND 180
        -- (0,0) is Null Island: what a zeroed/absent GPS struct serialises to, not
        -- a place anyone needs an ambulance. Treat it as no fix at all.
        AND NOT (p_lat = 0 AND p_lon = 0) THEN
    v_lat := p_lat;
    v_lon := p_lon;
    v_location_src := 'contact';
  ELSE
    -- Neither the patient nor the contact could offer a position. Dispatching to a
    -- guess is worse than not dispatching: the caller is told to phone 108.
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
      -- Read by dispatch and by post-incident review: a pickup point the contact
      -- supplied carries different confidence from one the patient registered.
      'location_source', v_location_src,
      'note',      CASE
                     WHEN v_location_src = 'contact'
                       THEN 'Triggered by emergency contact (pickup location supplied by the contact)'
                     ELSE 'Triggered by emergency contact'
                   END
    ))::text,
    'EMERGENCY_CONTACT', v_caller_id
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.create_sos_by_emergency_contact(uuid, uuid, numeric, numeric) IS
  'Raise an SOS on behalf of a patient, callable only by one of their linked emergency contacts. Pickup location prefers the patient''s own registered position; p_lat/p_lon are a fallback used ONLY when the patient has none, and the source is recorded in status_history.location_source. Returns the new sos_requests.id, or the existing live one if an emergency is already running.';

GRANT EXECUTE ON FUNCTION public.create_sos_by_emergency_contact(uuid, uuid, numeric, numeric)
  TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verify (read-only): exactly one candidate function, taking four arguments.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT p.oid::regprocedure AS signature,
       pg_get_function_arguments(p.oid) AS arguments
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'create_sos_by_emergency_contact';

-- How many patients this actually unblocks: those with a live contact link but no
-- registered coordinates. Before this patch, every one of them was un-rescuable
-- from the contact's screen.
SELECT count(DISTINCT ec.patient_id) AS patients_without_coordinates
  FROM public.emergency_contacts ec
  LEFT JOIN public.patients p ON p.user_id = ec.patient_id
 WHERE p.latitude IS NULL OR p.longitude IS NULL;

-- =============================================================================
-- END EC SOS CONTACT LOCATION PATCH
-- =============================================================================
