-- =============================================================================
-- SOS EXPIRY — give every emergency an explicit, queryable deadline
-- =============================================================================
-- WHY
--
-- An SOS is only a real emergency for a few minutes. Until now the ONLY thing
-- that ended an unanswered one was the reaper (SOSRequestService.expireStaleRequests
-- + the every-2-minutes Netlify scheduled function), which flips it to 'Cancelled'.
-- Nothing on the row said when it *should* stop being dispatchable, so:
--
--   • no client could tell a fresh SOS from a stale one without recomputing the
--     timeout window itself,
--   • the push dispatcher had no way to decide "this is too old to siren",
--   • if the reaper ever stopped running, a request stayed 'SOS Triggered' — and
--     therefore ringing on every nearby driver's phone — indefinitely.
--
-- This adds `expires_at`, populated by a BEFORE INSERT trigger so it is set for
-- EVERY writer (patient app, ER-team dashboard, admin API, seed scripts) without
-- any of them changing — which matters because mobile has no OTA and old APKs
-- keep inserting for months.
--
-- The window is the admin-configurable `sos_request_timeout_minutes` (default 3),
-- the same value the reaper and the patient app's assignment timeout already use.
--
-- Idempotent: safe to re-run. Applying this does NOT change any existing
-- behaviour on its own — it is what the app/dispatcher code reads to enforce
-- freshness.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Column
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.sos_requests
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN public.sos_requests.expires_at IS
  'Deadline after which this SOS must no longer be dispatched, displayed as active, or alerted on. Set on INSERT from configurations.sos_request_timeout_minutes (default 3). Never extended — a rolled-back driver claim keeps the ORIGINAL deadline, because the emergency started when the patient pressed the button.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Populate on insert
-- ─────────────────────────────────────────────────────────────────────────────
-- Tolerant config parse ("3", "3 min", " 3.5 ") mirroring getSosTimeoutMinutes()
-- in src/services/sosRequestService.ts, so the DB and the app can never disagree
-- about the window. A zero/negative/garbage value is an operator typo and must
-- never disable the safety net, so it falls back to 3.
--
-- This function can NEVER fail an SOS insert: any error at all falls through to
-- the 3-minute default. A misconfigured `configurations` row must not stop a
-- patient from calling an ambulance.
CREATE OR REPLACE FUNCTION public.sos_set_expires_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  timeout_minutes numeric := 3;
  raw_value       text;
  parsed          text;
BEGIN
  -- An explicit deadline from the caller wins (lets an operator/back-fill set one).
  IF NEW.expires_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT value INTO raw_value
      FROM public.configurations
     WHERE key = 'sos_request_timeout_minutes'
     LIMIT 1;

    IF raw_value IS NOT NULL THEN
      -- NOTE the grouping: substring(x from pattern) returns the FIRST
      -- parenthesized subexpression when the pattern has one, not the whole
      -- match. So the number is wrapped in a capturing group and the optional
      -- decimal tail is made NON-capturing — otherwise "3" parses to NULL
      -- (the empty decimal group) and every request silently gets the fallback.
      parsed := substring(raw_value from '(-?[0-9]+(?:\.[0-9]+)?)');
      IF parsed IS NOT NULL AND parsed <> '' THEN
        timeout_minutes := parsed::numeric;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    timeout_minutes := 3;
  END;

  IF timeout_minutes IS NULL OR timeout_minutes <= 0 THEN
    timeout_minutes := 3;
  END IF;

  NEW.expires_at := COALESCE(NEW.requested_at, now())
                    + make_interval(secs => (timeout_minutes * 60)::double precision);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sos_set_expires_at ON public.sos_requests;
CREATE TRIGGER trg_sos_set_expires_at
  BEFORE INSERT ON public.sos_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.sos_set_expires_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Backfill existing rows
-- ─────────────────────────────────────────────────────────────────────────────
-- Historical rows get a deadline derived from their own requested_at, so a
-- freshness check never has to special-case "no expiry recorded". Rows already
-- terminal are included: expires_at describes the dispatch window, not the
-- outcome, and a consistent column is easier to reason about than a sparse one.
DO $$
DECLARE
  timeout_minutes numeric := 3;
  raw_value       text;
  parsed          text;
BEGIN
  SELECT value INTO raw_value
    FROM public.configurations
   WHERE key = 'sos_request_timeout_minutes'
   LIMIT 1;

  IF raw_value IS NOT NULL THEN
    -- Capturing/non-capturing grouping matters here — see the note in
    -- sos_set_expires_at() above.
    parsed := substring(raw_value from '(-?[0-9]+(?:\.[0-9]+)?)');
    IF parsed IS NOT NULL AND parsed <> '' THEN
      timeout_minutes := parsed::numeric;
    END IF;
  END IF;

  IF timeout_minutes IS NULL OR timeout_minutes <= 0 THEN
    timeout_minutes := 3;
  END IF;

  UPDATE public.sos_requests
     SET expires_at = requested_at
                      + make_interval(secs => (timeout_minutes * 60)::double precision)
   WHERE expires_at IS NULL
     AND requested_at IS NOT NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Index
-- ─────────────────────────────────────────────────────────────────────────────
-- The hot query is the reaper / driver feed: "still-pending requests, by deadline".
-- Partial on the only status that can be dispatched keeps it tiny.
CREATE INDEX IF NOT EXISTS idx_sos_requests_pending_expiry
  ON public.sos_requests (expires_at)
  WHERE status = 'SOS Triggered';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Verify (read-only)
-- ─────────────────────────────────────────────────────────────────────────────
-- Expect: missing_expiry = 0, and pending_expired = the number of live requests
-- the reaper still owes a cancel (should be ~0 while the scheduled function runs).
SELECT
  count(*)                                                              AS total_requests,
  count(*) FILTER (WHERE expires_at IS NULL)                            AS missing_expiry,
  count(*) FILTER (WHERE status = 'SOS Triggered' AND expires_at > now()) AS pending_live,
  count(*) FILTER (WHERE status = 'SOS Triggered' AND expires_at <= now()) AS pending_expired
FROM public.sos_requests;

-- =============================================================================
-- END SOS EXPIRY PATCH
-- =============================================================================
