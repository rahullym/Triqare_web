#!/usr/bin/env node
/**
 * READ-ONLY. Answers two questions before anything is applied to live:
 *
 *   1. What is the CURRENT RLS state? (decides whether the 2026-07-29 rollback
 *      is needed at all — the live probe says it is already in effect)
 *   2. Is there ANY path from this machine to execute DDL? (no postgres:// URL
 *      exists in .env*, so the only hope is a SECURITY DEFINER exec RPC)
 *
 * Writes nothing. Sends no push. Touches no SOS data.
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

const TABLES = ['users', 'patients', 'drivers', 'emergency_contacts', 'sos_requests', 'notifications']

;(async () => {
  console.log('project:', URL, '\n')

  console.log('--- 1. Can the PUBLIC anon key read these tables? ---')
  console.log('    (rows visible = RLS off / permissive = the rollback state)')
  for (const t of TABLES) {
    const { data, error } = await anon.from(t).select('*', { count: 'exact', head: false }).limit(1)
    console.log(
      `    ${t.padEnd(20)} ${error ? `BLOCKED ${error.code}: ${error.message.slice(0, 45)}` : `OPEN — ${data.length} row(s) readable`}`
    )
  }

  console.log('\n--- 2. Phase-1 helper present? ---')
  const { error: fnErr } = await svc.rpc('current_app_user_id')
  console.log('    current_app_user_id():', fnErr ? `ABSENT (${fnErr.code})` : 'EXISTS')

  console.log('\n--- 3. Any RPC that can execute DDL from here? ---')
  let execPath = null
  for (const fn of ['exec_sql', 'exec', 'execute_sql', 'run_sql', 'sql', 'query']) {
    const { error } = await svc.rpc(fn, { query: 'SELECT 1' })
    const missing = error && (error.code === 'PGRST202' || /not found|does not exist/i.test(error.message))
    if (!missing) execPath = fn
    console.log(`    ${fn.padEnd(12)} ${missing ? 'absent' : `PRESENT -> ${error ? error.message.slice(0, 50) : 'ok'}`}`)
  }
  console.log('    => DDL path from this machine:', execPath ? execPath : 'NONE (SQL editor required)')

  console.log('\n--- 4. Is the dispatch trigger actually firing? ---')
  const { data: pd, error: pdErr } = await svc
    .from('push_deliveries')
    .select('created_at,event,audience,recipients,sent')
    .order('created_at', { ascending: false })
    .limit(5)
  if (pdErr) console.log('    push_deliveries unreadable:', pdErr.message)
  else if (!pd.length) console.log('    push_deliveries EMPTY — nothing has ever dispatched')
  else pd.forEach(r => console.log(`    ${r.created_at}  ${String(r.event).padEnd(14)} ${String(r.audience).padEnd(9)} recip=${r.recipients} sent=${r.sent}`))

  console.log('\n--- 5. Stale unassigned SOS past expiry (what pg_cron would sweep) ---')
  const { data: stale, error: stErr } = await svc
    .from('sos_requests')
    .select('id,requested_at,expires_at,status')
    .eq('status', 'SOS Triggered')
    .is('driver_id', null)
    .lt('expires_at', new Date().toISOString())
    .order('requested_at', { ascending: false })
  if (stErr) console.log('    error:', stErr.message)
  else {
    console.log(`    ${stale.length} stuck request(s)`)
    stale.slice(0, 8).forEach(r => console.log(`      ${r.id}  raised ${r.requested_at}  expired ${r.expires_at}`))
  }
})().catch(e => console.error('FATAL', e.message))
