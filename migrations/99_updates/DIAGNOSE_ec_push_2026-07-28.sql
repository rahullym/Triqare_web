-- =============================================================================
-- PUSH PIPELINE — FULL CHAIN DIAGNOSTIC (read-only, 2026-07-28, rev 2)
-- =============================================================================
-- Question: push is shipped end-to-end but no notification has ever been
-- observed arriving. Which link is dead?
--
-- The chain, in order:
--   1. SOS row written / status changed
--   2. trg_notify_push_on_sos_change  fires
--   3. pg_net POSTs to https://triqareweb20.netlify.app/api/push/dispatch
--   4. dispatchSOSPush resolves the audience
--        emergency_contacts.contact_user_id -> users.id -> device_tokens/fcm_token
--   5. firebase-admin sends to FCM        (needs Netlify FIREBASE_SERVICE_ACCOUNT)
--   6. device renders on channel sos-emergency-v2
--
-- ALREADY VERIFIED OUTSIDE THIS SCRIPT:
--   * The service-account blob in firebase-env-value.txt is VALID — FCM
--     authenticated it on a dry-run and rejected only the dummy token. So if
--     step 5 fails, the value on Netlify differs from that file (truncated /
--     re-wrapped / unset), not the credential itself.
--   * POST /api/push/dispatch with a wrong bearer returns 401 (not 503), so
--     the route is deployed and PUSH_DISPATCH_SECRET IS set on Netlify.
--
-- rev 2 fixes two flaws in rev 1:
--   * it referenced sos_requests.created_at, which does NOT exist on the live
--     table (the repo migrations are stale) — one 42703 aborted the whole batch;
--   * it was 12 separate SELECTs, but the Supabase editor only renders the LAST
--     statement's output, so 11 checks were invisible anyway.
--   QUERY A below is now ONE statement returning ONE table of verdicts, and it
--   touches no column that isn't guaranteed to exist.
--
-- Nothing here writes data.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- QUERY A — THE VERDICT TABLE. Select this whole block and run it.
-- Read the `result` column top to bottom; the first FAIL is the dead link.
-- ---------------------------------------------------------------------------
WITH fn AS (
  -- NULL (not an error) if the function was never created.
  SELECT (SELECT pg_get_functiondef(p.oid)
          FROM   pg_proc p
          WHERE  p.proname = 'notify_push_on_sos_change'
            AND  p.pronamespace = 'public'::regnamespace
          LIMIT  1) AS body
)
SELECT ord, check_name, result FROM (

  -- ── Step 2/3: can the database call out at all? ───────────────────────────
  SELECT 1 AS ord, 'pg_net installed' AS check_name,
         COALESCE((SELECT 'OK   - v' || extversion FROM pg_extension WHERE extname = 'pg_net'),
                  'FAIL - not installed; the trigger can never make an HTTP call') AS result

  UNION ALL SELECT 2, 'dispatch trigger on sos_requests',
    COALESCE((SELECT CASE WHEN tgenabled = 'O' THEN 'OK   - present and enabled'
                          ELSE 'FAIL - present but DISABLED (tgenabled=' || tgenabled::text || ')' END
              FROM pg_trigger
              WHERE tgrelid = 'public.sos_requests'::regclass
                AND tgname  = 'trg_notify_push_on_sos_change'),
             'FAIL - trigger MISSING; nothing fires on SOS create/status change')

  -- ── MASTER SWITCH: the function self-disables if the secret is a placeholder.
  --    This is the single most common reason nothing has ever fired.
  --
  --    Read the ASSIGNED value, not the whole body. The placeholder string also
  --    appears in the guard condition (`dispatch_secret = 'REPLACE_WITH_...'`),
  --    so a plain `body LIKE '%REPLACE_WITH_...%'` matches even on a CORRECTLY
  --    wired function and reports a false FAIL. Extract the DECLARE assignment.
  UNION ALL SELECT 3, 'dispatch secret baked into function',
    COALESCE((SELECT CASE
        WHEN body IS NULL THEN 'FAIL - function notify_push_on_sos_change() does not exist'
        WHEN sec IS NULL THEN 'CHECK - could not parse the dispatch_secret assignment; see QUERY C'
        WHEN sec = 'REPLACE_WITH_PUSH_DISPATCH_SECRET'
          THEN 'FAIL - placeholder ASSIGNED; function RETURNs before POSTing, silently, on every SOS'
        ELSE 'OK   - real secret assigned (' || length(sec) || ' chars; 64 expected)' END
      FROM (SELECT body,
                   substring(body from 'dispatch_secret[ \t]+text[ \t]*:=[ \t]*''([^'']*)''') AS sec
            FROM fn) f3), 'FAIL - could not read function')

  UNION ALL SELECT 4, 'dispatch URL baked into function',
    COALESCE((SELECT CASE
        WHEN body IS NULL THEN 'n/a  - function does not exist'
        WHEN body LIKE '%triqareweb20.netlify.app/api/push/dispatch%'
          THEN 'OK   - targets triqareweb20 (current code)'
        WHEN body LIKE '%portal.triqare.com%'
          THEN 'FAIL - targets portal.* which 307-redirects and DROPS the auth header + body'
        WHEN body LIKE '%current_setting%'
          THEN 'FAIL - reads GUCs; managed Supabase blocks ALTER DATABASE SET so the URL is NULL'
        ELSE 'CHECK - unrecognised dispatch URL; see QUERY C' END FROM fn), 'FAIL - could not read function')

  UNION ALL SELECT 5, 'function actually calls net.http_post',
    COALESCE((SELECT CASE WHEN body IS NULL THEN 'n/a  - function does not exist'
                          WHEN body LIKE '%net.http_post%' THEN 'OK   - calls net.http_post'
                          ELSE 'FAIL - no net.http_post call in the body' END FROM fn),
             'FAIL - could not read function')

  -- ── Step 4: is there anyone to send TO? ───────────────────────────────────
  UNION ALL SELECT 6, 'emergency-contact auto-link triggers',
    (SELECT CASE WHEN count(*) = 2 THEN 'OK   - both present'
                 ELSE 'WARN - only ' || count(*) || ' of 2 present; contacts may never link to accounts' END
     FROM pg_trigger
     WHERE tgname IN ('trg_resolve_emergency_contact_user', 'trg_backfill_emergency_contact_links'))

  UNION ALL SELECT 7, 'emergency_contacts rows',
    (SELECT 'total=' || count(*)
          || '  with_email=' || count(*) FILTER (WHERE email IS NOT NULL AND btrim(email) <> '')
          || '  LINKED_to_account=' || count(*) FILTER (WHERE contact_user_id IS NOT NULL)
     FROM public.emergency_contacts)

  UNION ALL SELECT 8, 'contacts REACHABLE by push right now',
    (SELECT CASE WHEN count(DISTINCT u.id) FILTER (
                        WHERE u.is_active AND (u.fcm_token IS NOT NULL OR dt.id IS NOT NULL)) = 0
                 THEN 'FAIL - 0 reachable; EC push audience is empty for EVERY SOS'
                 ELSE 'OK   - ' || count(DISTINCT u.id) FILTER (
                        WHERE u.is_active AND (u.fcm_token IS NOT NULL OR dt.id IS NOT NULL))
                      || ' of ' || count(DISTINCT ec.contact_user_id) || ' linked contacts' END
     FROM public.emergency_contacts ec
     JOIN public.users u ON u.id = ec.contact_user_id
     LEFT JOIN public.device_tokens dt ON dt.user_id = u.id AND dt.is_active)

  UNION ALL SELECT 9, 'device_tokens (new multi-device store)',
    (SELECT CASE WHEN count(*) = 0 THEN 'FAIL - EMPTY; no app install has ever registered a device'
                 ELSE 'OK   - ' || count(*) || ' rows, ' || count(*) FILTER (WHERE is_active) || ' active'
                      || COALESCE(' | last seen ' || max(updated_at)::text, '') END
     FROM public.device_tokens)

  UNION ALL SELECT 10, 'device_tokens by role (active)',
    COALESCE((SELECT string_agg(role || '=' || n, '  ' ORDER BY role)
              FROM (SELECT COALESCE(role, '(null)') AS role, count(*) AS n
                    FROM public.device_tokens WHERE is_active GROUP BY 1) x), '(none)')

  UNION ALL SELECT 11, 'legacy users.fcm_token',
    (SELECT count(*) || ' users hold a legacy token (' || count(*) FILTER (WHERE is_active) || ' active)'
     FROM public.users WHERE fcm_token IS NOT NULL)

  -- ── Step 5: what did the server believe it did? ───────────────────────────
  UNION ALL SELECT 12, 'push_deliveries — any attempt EVER?',
    (SELECT CASE WHEN count(*) = 0
                 THEN 'FAIL - ZERO send attempts logged; the dispatch route has never run its send path'
                 ELSE 'OK   - ' || count(*) || ' attempts, last ' || max(created_at)::text END
     FROM public.push_deliveries)

  UNION ALL SELECT 13, 'push_deliveries — FIREBASE_SERVICE_ACCOUNT gap',
    (SELECT CASE WHEN count(*) = 0 THEN 'n/a  - no attempts logged'
                 WHEN bool_or(not_configured)
                   THEN 'FAIL - at least one attempt hit not_configured -> Netlify FIREBASE_SERVICE_ACCOUNT missing/mangled'
                 ELSE 'OK   - sender was configured on every attempt' END
     FROM public.push_deliveries)

  UNION ALL SELECT 14, 'push_deliveries — rollup by audience',
    COALESCE((SELECT string_agg(audience || ': attempts=' || a || ' recipients=' || r || ' sent=' || s || ' failed=' || f,
                                '   ' ORDER BY audience)
              FROM (SELECT audience, count(*) a, sum(recipients) r, sum(sent) s, sum(failed) f
                    FROM public.push_deliveries GROUP BY audience) y), '(no attempts)')

  UNION ALL SELECT 15, 'has ANY push ever been ACCEPTED by FCM?',
    (SELECT CASE WHEN COALESCE(sum(sent), 0) > 0
                 THEN 'OK   - ' || sum(sent) || ' accepted; chain works, any failure is device-side'
                 ELSE 'FAIL - 0 sends ever accepted by FCM' END
     FROM public.push_deliveries)

  UNION ALL SELECT 16, 'pg_net response log reachable',
    CASE WHEN to_regclass('net._http_response') IS NULL
         THEN 'n/a  - net._http_response not present (skip QUERY B)'
         ELSE 'OK   - run QUERY B for the decisive HTTP outcomes' END

  UNION ALL SELECT 17, 'recent SOS activity (was there anything to notify about?)',
    (SELECT CASE WHEN count(*) = 0 THEN 'WARN - no SOS rows at all'
                 ELSE count(*) || ' rows, last updated ' || max(updated_at)::text END
     FROM public.sos_requests)

) checks ORDER BY ord;


-- ---------------------------------------------------------------------------
-- QUERY B — DECISIVE: did the POST actually leave the database, and what came
-- back? pg_net records every response; the body is the DispatchResult JSON, so
-- it names the failure directly. Run this SEPARATELY (select just this query).
--
-- to_jsonb(r) is used deliberately: pg_net's column names vary by version, and
-- a guessed name would abort the batch. This dumps whatever is actually there.
--
-- How to read the body:
--   no rows at all         -> the trigger never fired (see QUERY A rows 2-5)
--   "notConfigured":true   -> Netlify FIREBASE_SERVICE_ACCOUNT missing/mangled.
--                             configReason says which; configLen should be 3196
--   "event":null           -> POST arrived but classify() matched no event for
--                             that transition (no send, by design)
--   "recipients":0,"sent":0-> reached + configured, but NO audience
--   "sent":N (N>0)         -> FCM ACCEPTED it; the chain works. Remaining failure
--                             is device-side (channel / permission / signed out)
--   status_code 401        -> trigger's secret != Netlify PUSH_DISPATCH_SECRET
--   status_code 307        -> wrong host (see QUERY A row 4)
--   status_code 503        -> PUSH_DISPATCH_SECRET not set on Netlify
-- ---------------------------------------------------------------------------
-- SELECT to_jsonb(r) AS response FROM net._http_response r ORDER BY 1 DESC LIMIT 25;


-- ---------------------------------------------------------------------------
-- QUERY C — the trigger function's full source, if a verdict above needs eyes.
-- ---------------------------------------------------------------------------
-- SELECT pg_get_functiondef(p.oid)
-- FROM   pg_proc p
-- WHERE  p.proname = 'notify_push_on_sos_change'
--   AND  p.pronamespace = 'public'::regnamespace;


-- ---------------------------------------------------------------------------
-- QUERY D — per-contact detail: exactly who would receive a push right now.
-- ---------------------------------------------------------------------------
-- SELECT ec.name AS contact_name,
--        ec.email AS contact_email,
--        (ec.contact_user_id IS NOT NULL)         AS linked,
--        u.is_active                              AS account_active,
--        (u.fcm_token IS NOT NULL)                AS has_legacy_token,
--        count(dt.id) FILTER (WHERE dt.is_active) AS active_devices,
--        max(dt.updated_at)                       AS newest_device_seen
-- FROM       public.emergency_contacts ec
-- LEFT JOIN  public.users u          ON u.id = ec.contact_user_id
-- LEFT JOIN  public.device_tokens dt ON dt.user_id = u.id
-- GROUP BY   ec.name, ec.email, ec.contact_user_id, u.is_active, u.fcm_token
-- ORDER BY   linked DESC, contact_name
-- LIMIT      50;

-- =============================================================================
-- END DIAGNOSTIC — paste back the QUERY A table, then QUERY B's rows.
-- =============================================================================
