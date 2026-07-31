#!/usr/bin/env node
/* TEMP read-only: did anything at all react to the two SOS created after 16:30Z? */
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

const env = {}
for (const line of fs.readFileSync('.env.netlify', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const SINCE = '2026-07-29T16:00:00Z'

;(async () => {
  for (const [table, tsCol, cols] of [
    ['notifications', 'created_at', 'id,user_id,type,title,created_at'],
    ['sos_request_status_history', 'created_at', 'id,request_id,status,created_at'],
    ['push_deliveries', 'created_at', 'id,event,audience,recipients,sent,created_at'],
  ]) {
    const { data, error } = await sb
      .from(table)
      .select(cols)
      .gte(tsCol, SINCE)
      .order(tsCol, { ascending: false })
      .limit(10)
    console.log(`\n=== ${table} since ${SINCE} ===`)
    if (error) console.log('ERR', error.code, error.message)
    else if (!data.length) console.log('(none)')
    else data.forEach((r) => console.log(JSON.stringify(r)))
  }

  console.log('\n=== the pending SOS 3a2f4324 in full ===')
  const { data: one, error: oneErr } = await sb
    .from('sos_requests')
    .select('*')
    .eq('id', '3a2f4324-0000-0000-0000-000000000000')
    .limit(1)
  if (oneErr) console.log('ERR', oneErr.message)
  const { data: recent } = await sb
    .from('sos_requests')
    .select('*')
    .gte('requested_at', SINCE)
    .order('requested_at', { ascending: false })
  ;(recent || []).forEach((r) => {
    const keep = {}
    for (const k of Object.keys(r)) if (r[k] !== null && k !== 'address') keep[k] = r[k]
    console.log(JSON.stringify(keep))
  })
})()
