-- =============================================================================
-- PATCH: publish the transport-dashboard tables to Realtime — 2026-09-25.
-- Idempotent; safe to re-run. Paste into the Supabase SQL editor.
-- =============================================================================
--
-- WHY: /transport/dashboard and /transport/drivers subscribe to postgres_changes
-- on drivers, sos_requests and sos_request_assigned, but `drivers` was never
-- added to the supabase_realtime publication (no migration here ever touched it
-- for these tables; realtime was toggled by hand per table). A driver switching
-- Off Duty -> On Duty in the app is a plain UPDATE of drivers.status, so the
-- subscription received nothing and the badge stayed "Off Duty" until F5.
-- Verified on live 2026-09-25: anon can SELECT drivers (30 rows), yet an UPDATE
-- delivered zero events to an anon subscriber.
--
-- The pages now also poll every 15s while visible, so they are correct without
-- this patch; applying it makes the update land in ~1s instead of up to 15s.

BEGIN;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['drivers','sos_requests','sos_request_assigned']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Verify: expect all three rows.
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
  AND tablename IN ('drivers','sos_requests','sos_request_assigned')
ORDER BY tablename;
