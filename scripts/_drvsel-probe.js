#!/usr/bin/env node
/* TEMP read-only: does the CORRECTED driver-selection query work, and who is reachable? */
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

;(async () => {
  const { data, error } = await sb
    .from('drivers')
    .select('user_id, latitude, longitude, status')
    .eq('status', 'available')
  console.log(error ? `STILL BROKEN ${error.code}: ${error.message}` : `QUERY OK — ${data.length} available driver(s)`)
  if (error) return

  const ids = data.map((d) => d.user_id)
  const { data: users } = await sb
    .from('users')
    .select('id,email,is_active,fcm_token')
    .in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])

  let reachable = 0
  for (const d of data) {
    const u = (users || []).find((x) => x.id === d.user_id)
    const ok = u?.is_active && !!u?.fcm_token
    if (ok) reachable++
    console.log(`  ${u?.email ?? d.user_id}  lat=${d.latitude} lon=${d.longitude} active=${u?.is_active} token=${u?.fcm_token ? 'YES' : 'NONE'}`)
  }
  console.log(`\nWould be paged on the next SOS: ${reachable} driver(s)`)
  if (reachable === 0) {
    console.log('NOTE: query is fixed, but no AVAILABLE driver holds a token — a real')
    console.log('      dispatch still reaches nobody until a tokened driver goes online.')
  }
})().catch((e) => { console.error('FATAL', e.message); process.exit(1) })
