-- =============================================================================
-- WEARABLE SOS TRIGGER SOURCE — J2208A emergency band
-- =============================================================================
-- The paired band has a physical SOS button. Pressing it raises a normal SOS
-- through the ordinary client insert, so every downstream mechanism —
-- trg_sos_set_expires_at, trg_notify_push_on_sos_change, driver discovery,
-- acceptance, tracking, completion — applies unchanged and by construction.
--
-- The only thing this patch changes is that such a request can say so.
-- sos_requests_triggered_by_check (see sos_trigger_source.sql) currently allows
-- only PATIENT and EMERGENCY_CONTACT, so a band-raised SOS would be REJECTED
-- outright with 23514. Widening the constraint is therefore a prerequisite for
-- the feature, not a nicety.
--
-- WEARABLE is still the patient's own emergency — triggered_by_user_id remains
-- the patient. It is separated from PATIENT because the operational meaning
-- differs: nobody was looking at a phone, so an unanswered call back is expected
-- rather than a sign the request is stale.
--
-- Idempotent: safe to re-run.
-- =============================================================================

ALTER TABLE public.sos_requests
  DROP CONSTRAINT IF EXISTS sos_requests_triggered_by_check;

ALTER TABLE public.sos_requests
  ADD CONSTRAINT sos_requests_triggered_by_check
  CHECK (triggered_by IN ('PATIENT', 'EMERGENCY_CONTACT', 'WEARABLE'));

COMMENT ON COLUMN public.sos_requests.triggered_by IS
  'Trigger source: PATIENT (in-app SOS tap), EMERGENCY_CONTACT (an authorised contact raised it on the patient''s behalf), or WEARABLE (the SOS button on the patient''s paired band).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verify (read-only)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  count(*)                                                    AS total_requests,
  count(*) FILTER (WHERE triggered_by = 'PATIENT')            AS by_patient,
  count(*) FILTER (WHERE triggered_by = 'EMERGENCY_CONTACT')  AS by_contact,
  count(*) FILTER (WHERE triggered_by = 'WEARABLE')           AS by_band
FROM public.sos_requests;

-- =============================================================================
-- END WEARABLE SOS TRIGGER SOURCE PATCH
-- =============================================================================
