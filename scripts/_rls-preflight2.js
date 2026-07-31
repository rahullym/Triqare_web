#!/usr/bin/env node
/**
 * READ-ONLY follow-up checks the first pre-flight could not answer.
 *
 *   1. notifications is empty, so its columns could not be inferred from a row —
 *      but Phase 1 creates three policies referencing notifications.user_id, and
 *      CREATE POLICY on a missing column fails the whole transaction.
 *
 *   2. The hardening step REVOKEs anon's SELECT on public.users. Anything the app
 *      still does with a bare anon key (no session) breaks the moment that lands.
 *      Probe the specific anon paths the app is known to use.
 */
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

const env = {}
for (const line of fs.readFileSync('.env.netlify', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const svc = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

;(async () => {
  console.log('=== 1. notifications columns referenced by Phase 1 ===')
  for (const col of ['user_id', 'id']) {
    const { error } = await svc.from('notifications').select(col).limit(1)
    console.log(`    notifications.${col.padEnd(10)} ${error ? `ABSENT — ${error.code} ${error.message.slice(0, 60)}` : 'present'}`)
  }

  console.log('\n=== 2. What still works with a BARE ANON key (no session)? ===')
  console.log('    (each of these dies when the hardening revokes anon SELECT)')
  const probes = [
    ['users   SELECT', () => anon.from('users').select('id').limit(1)],
    ['patients SELECT', () => anon.from('patients').select('user_id').limit(1)],
    ['drivers SELECT', () => anon.from('drivers').select('user_id').limit(1)],
    ['sos_requests SELECT', () => anon.from('sos_requests').select('id').limit(1)],
    ['emergency_contacts SELECT', () => anon.from('emergency_contacts').select('id').limit(1)],
  ]
  for (const [label, fn] of probes) {
    const { data, error } = await fn()
    console.log(`    ${label.padEnd(28)} ${error ? `blocked (${error.code})` : `OPEN — ${data.length} row(s)`}`)
  }

  console.log('\n=== 3. SECURITY DEFINER RPCs the app relies on (RLS-immune, safe) ===')
  for (const fn of ['upsert_device_token', 'record_terms_acceptance', 'current_app_user_id']) {
    const { error } = await svc.rpc(fn, {})
    const absent = error && error.code === 'PGRST202'
    console.log(`    ${fn.padEnd(26)} ${absent ? 'ABSENT' : 'exists'}`)
  }

  console.log('\n=== 4. Existing policies on the six core tables ===')
  console.log('    (pg_policies is not exposed over REST; inferred from behaviour above)')
  console.log('    RLS is currently DISABLED on all six — so any policy created now is INERT')
  console.log('    until the ENABLE step. That is what makes Step 1 zero-risk.')
})().catch(e => console.error('FATAL', e.message))
