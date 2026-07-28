-- =============================================================================
-- PATCH: lock device_tokens / push_deliveries against anon READS — 2026-07-28
-- Run AFTER push_multidevice_and_delivery_log.sql. Idempotent; safe to re-run.
-- =============================================================================
--
-- WHY: Supabase auto-grants SELECT on new public tables to anon/authenticated via
-- default privileges. Combined with device_tokens' original FOR ALL policy, that
-- made token rows readable with the public anon key once devices registered. This
-- revokes the read grant and replaces the FOR ALL policy with write-only policies
-- (no SELECT policy → RLS denies reads at both layers). The token-less mobile client
-- keeps INSERT/UPDATE/DELETE on its own device row; only the server reads tokens.

-- device_tokens: write-only for clients, no read ------------------------------
REVOKE SELECT ON public.device_tokens FROM anon, authenticated;

DROP POLICY IF EXISTS "device_tokens interim client write" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens client insert" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens client update" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens client delete" ON public.device_tokens;
CREATE POLICY "device_tokens client insert" ON public.device_tokens FOR INSERT WITH CHECK (true);
CREATE POLICY "device_tokens client update" ON public.device_tokens FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "device_tokens client delete" ON public.device_tokens FOR DELETE USING (true);

-- push_deliveries: already RLS-denied to clients; drop the default grant too -----
REVOKE SELECT ON public.push_deliveries FROM anon, authenticated;

-- Verify (read-only): both should now be inaccessible to the anon role.
-- After running, an anon REST GET on either table returns 401 "permission denied".
SELECT has_table_privilege('anon', 'public.device_tokens',  'SELECT') AS anon_can_read_device_tokens,
       has_table_privilege('anon', 'public.device_tokens',  'INSERT') AS anon_can_write_device_tokens,
       has_table_privilege('anon', 'public.push_deliveries', 'SELECT') AS anon_can_read_push_deliveries;
-- Expect: false, true, false
