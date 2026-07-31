#!/usr/bin/env node
/**
 * READ-ONLY pre-flight for the RLS fix-forward.
 *
 * The 2026-07-29 outage happened because RLS was ENABLEd while the policies that
 * grant access did not exist. There is a second, quieter way to cause the exact
 * same outage: enable RLS with correct policies, but against users who have no
 * auth_user_id. Every "sb_auth: …" policy resolves identity through
 * current_app_user_id(), which is `SELECT id FROM users WHERE auth_user_id = auth.uid()`.
 * For an unlinked user that returns NULL, every predicate goes NULL -> deny, and
 * they are locked out just as hard as with no policies at all.
 *
 * So this checks the two things that decide go/no-go:
 *   A. do the columns the policies reference actually exist on live?
 *   B. what fraction of real users would still resolve an identity?
 *
 * Writes nothing.
 */
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

const env = {}
for (const line of fs.readFileSync('.env.netlify', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// column -> which policy depends on it
const REQUIRED = {
  users:              ['id', 'auth_user_id', 'email', 'phone', 'role'],
  patients:           ['user_id'],
  drivers:            ['user_id'],
  emergency_contacts: ['patient_id', 'contact_user_id', 'email', 'phone'],
  sos_requests:       ['patient_id', 'driver_id'],
  notifications:      ['user_id'],
}

;(async () => {
  console.log('=== A. Columns the fix-forward policies reference ===\n')
  let schemaOk = true
  for (const [table, cols] of Object.entries(REQUIRED)) {
    const { data, error } = await svc.from(table).select('*').limit(1)
    if (error) { console.log(`  ${table}: UNREADABLE — ${error.message}`); schemaOk = false; continue }
    if (!data.length) { console.log(`  ${table}: empty table, cannot infer columns`); continue }
    const present = Object.keys(data[0])
    const missing = cols.filter(c => !present.includes(c))
    console.log(`  ${table.padEnd(20)} ${missing.length ? `MISSING: ${missing.join(', ')}` : 'all referenced columns present'}`)
    if (missing.length) schemaOk = false
  }

  console.log('\n=== B. Would real users still resolve an identity under RLS? ===\n')
  const { count: total } = await svc.from('users').select('*', { count: 'exact', head: true })
  const { count: linked } = await svc.from('users').select('*', { count: 'exact', head: true }).not('auth_user_id', 'is', null)
  console.log(`  public.users rows            : ${total}`)
  console.log(`  with auth_user_id set        : ${linked}`)
  console.log(`  UNLINKED (locked out by RLS) : ${total - linked}`)

  // Which of the unlinked actually have a Supabase auth identity waiting to be linked?
  const { data: authList, error: aErr } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (aErr) { console.log('  auth.users unreadable:', aErr.message) }
  else {
    const authEmails = new Set(authList.users.map(u => (u.email || '').toLowerCase()).filter(Boolean))
    const { data: unlinked } = await svc.from('users').select('id,email,role').is('auth_user_id', null)
    const matchable = (unlinked || []).filter(u => authEmails.has((u.email || '').toLowerCase()))
    console.log(`  auth.users identities        : ${authList.users.length}`)
    console.log(`  unlinked BUT auth exists     : ${matchable.length}  <- fixable by a backfill`)
    console.log(`  unlinked and NO auth identity: ${(unlinked || []).length - matchable.length}  <- cannot log in at all yet`)

    const byRole = {}
    for (const u of unlinked || []) byRole[u.role] = (byRole[u.role] || 0) + 1
    console.log('  unlinked by role             :', JSON.stringify(byRole))
  }

  console.log('\n=== C. Active users — the ones an outage would actually hit ===\n')
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const { data: recentSos } = await svc.from('sos_requests').select('patient_id,driver_id').gte('requested_at', since)
  const actors = new Set()
  for (const r of recentSos || []) { if (r.patient_id) actors.add(r.patient_id); if (r.driver_id) actors.add(r.driver_id) }
  if (actors.size) {
    const { data: actorRows } = await svc.from('users').select('id,email,role,auth_user_id').in('id', [...actors])
    const unlinkedActors = (actorRows || []).filter(u => !u.auth_user_id)
    console.log(`  distinct users in SOS activity (30d): ${actors.size}`)
    console.log(`  of those, UNLINKED                 : ${unlinkedActors.length}`)
    unlinkedActors.slice(0, 15).forEach(u => console.log(`      ${String(u.role).padEnd(8)} ${u.email}`))
  } else {
    console.log('  no SOS activity in the last 30 days')
  }

  console.log('\n=== VERDICT ===')
  console.log(`  schema matches policies : ${schemaOk ? 'YES' : 'NO — fix before applying'}`)
  console.log(`  safe to ENABLE RLS now  : ${total === linked ? 'YES' : `NO — ${total - linked} user(s) would be locked out`}`)
})().catch(e => console.error('FATAL', e.message))
