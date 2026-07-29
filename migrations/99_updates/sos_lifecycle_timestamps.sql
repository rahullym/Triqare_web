-- =============================================================================
-- SOS LIFECYCLE — distinct expiry status + response-time timestamps
-- =============================================================================
-- Covers two gaps found auditing the emergency workflow spec:
--
--   #11  Expiry had no terminal state of its own. A no-driver timeout was written
--        as 'Cancelled' and was only distinguishable from a deliberate user cancel
--        by sniffing status_history[last].actor === 'system' — a string heuristic
--        holding up reporting, push copy, and the "never redistribute a terminal
--        request" rule.
--
--   #10  Only created / assigned / completed were timestamped. There was no way to
--        answer "how long from the patient pressing SOS to a driver's phone actually
--        ringing", which is the number that matters for emergency response analysis.
--
-- Idempotent: safe to re-run.
--
-- APPLY THIS BEFORE shipping the app build that stops down-mapping 'Timed Out'.
-- Until the constraint below is live, writing 'Timed Out' raises a 23514
-- check_violation. The client keeps a 23514 fallback for exactly that window, but
-- the fallback logs loudly and should never be the steady state.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Make 'Timed Out' a persistable terminal status  (#11)
-- ─────────────────────────────────────────────────────────────────────────────
-- migrations/99_updates/update_sos_status_workflow.sql already lists 'Timed Out',
-- but the mobile client carries a comment recorded against a LIVE 23514 stating the
-- production constraint permits only six values — i.e. that migration's current
-- form was never applied to prod. Re-asserting it here is cheap and makes the
-- constraint's contents certain rather than assumed.
--
-- Adding a value to a CHECK IN-list can never invalidate existing rows, so this
-- needs no data migration.
ALTER TABLE public.sos_requests
  DROP CONSTRAINT IF EXISTS sos_requests_status_check;

ALTER TABLE public.sos_requests
  ADD CONSTRAINT sos_requests_status_check
  CHECK (status IN (
    'SOS Triggered',
    'Driver En Route',
    'Transport Arrived',
    'User Picked Up',
    'Arrived at Hospital',
    'Cancelled',
    'Timed Out'
  ));

COMMENT ON COLUMN public.sos_requests.status IS
  'Current status. Workflow: SOS Triggered → Driver En Route → Transport Arrived → User Picked Up → Arrived at Hospital. Terminal: Arrived at Hospital (success), Cancelled (deliberate cancel by patient/contact), Timed Out (expired with no driver found). A terminal request is never redistributed.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Response-time timestamps  (#10)
-- ─────────────────────────────────────────────────────────────────────────────
-- Deliberately separate columns rather than more status_history entries: these are
-- measurements, not state transitions, and they need to be queryable/aggregatable
-- without parsing a JSON string in every row.
--
-- The remaining spec timestamps already exist and are NOT duplicated here:
--   SOS created            → requested_at
--   Driver accepted        → assigned_at
--   En route / arrived     → status_history entries (with per-transition timestamps)
--   Completed              → completed_at
--   Cancelled / expired    → status_history terminal entry + status
ALTER TABLE public.sos_requests
  ADD COLUMN IF NOT EXISTS dispatch_started_at    timestamptz,
  ADD COLUMN IF NOT EXISTS notified_at            timestamptz,
  ADD COLUMN IF NOT EXISTS first_acknowledged_at  timestamptz;

COMMENT ON COLUMN public.sos_requests.dispatch_started_at IS
  'When the push dispatcher began resolving the nearby-driver audience. Distinct from requested_at: the gap between them is DB trigger + pg_net queue latency, i.e. how long the backend sat on the emergency before it started looking for anyone.';

COMMENT ON COLUMN public.sos_requests.notified_at IS
  'When the dispatch push was handed to FCM. requested_at → notified_at is the full server-side time-to-alert.';

COMMENT ON COLUMN public.sos_requests.first_acknowledged_at IS
  'When the FIRST driver device confirmed the dispatch push actually arrived (reported by the app''s headless handler). notified_at → first_acknowledged_at is real-world delivery latency. NULL means no device ever confirmed — the strongest available signal that a dispatch silently failed to land.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Device-side delivery acknowledgement  (#10)
-- ─────────────────────────────────────────────────────────────────────────────
-- Called by the mobile app the moment the data-only SOS push reaches its headless
-- handler. Only possible at all because that push is data-only — an OS-rendered
-- notification runs no JS and can never be acknowledged.
--
-- SECURITY DEFINER + first-writer-wins. It records a delivery fact and nothing else:
-- it cannot change status, cannot assign a driver, exposes no row data, and is a
-- no-op once set. Safe to expose to anon (the app may ack from a cold headless task
-- before any auth session has been restored).
CREATE OR REPLACE FUNCTION public.sos_ack_notification(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sos_requests
     SET first_acknowledged_at = now()
   WHERE id = p_request_id
     AND first_acknowledged_at IS NULL;
END;
$$;

COMMENT ON FUNCTION public.sos_ack_notification(uuid) IS
  'Stamp first_acknowledged_at for an SOS the first time any driver device confirms the dispatch push arrived. Idempotent, write-once, no data returned.';

GRANT EXECUTE ON FUNCTION public.sos_ack_notification(uuid) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Verify (read-only)
-- ─────────────────────────────────────────────────────────────────────────────
-- Expect timed_out_allowed = true. The latency columns read NULL for every row
-- created before this migration — only new dispatches are measured.
SELECT
  EXISTS (
    SELECT 1
      FROM information_schema.check_constraints
     WHERE constraint_name = 'sos_requests_status_check'
       AND check_clause LIKE '%Timed Out%'
  ) AS timed_out_allowed,
  count(*) FILTER (WHERE dispatch_started_at   IS NOT NULL) AS with_dispatch_started,
  count(*) FILTER (WHERE notified_at           IS NOT NULL) AS with_notified,
  count(*) FILTER (WHERE first_acknowledged_at IS NOT NULL) AS with_ack,
  count(*) FILTER (WHERE status = 'Timed Out')              AS timed_out_rows
FROM public.sos_requests;

-- =============================================================================
-- END SOS LIFECYCLE PATCH
-- =============================================================================
