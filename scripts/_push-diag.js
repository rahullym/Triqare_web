#!/usr/bin/env node
/* TEMP read-only: live push delivery log, device tokens, EC audience, recent SOS. */
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
  console.log('=== PUSH_DELIVERIES (recent 15) ===')
  const { data: pd, error: pdErr } = await sb
    .from('push_deliveries')
    .select('created_at,event,audience,recipients,sent,failed,not_configured')
    .order('created_at', { ascending: false })
    .limit(15)
  if (pdErr) console.log('ERR:', pdErr.message, pdErr.code)
  else if (!pd.length) console.log('(no rows)')
  else pd.forEach((r) =>
    console.log(`${r.created_at}  ${String(r.event).padEnd(20)} ${String(r.audience).padEnd(8)} recip=${r.recipients} sent=${r.sent} failed=${r.failed} notCfg=${r.not_configured}`))

  console.log('\n=== DEVICE_TOKENS ===')
  const { data: dt, error: dtErr } = await sb
    .from('device_tokens')
    .select('user_id,role,platform,is_active,updated_at')
    .order('updated_at', { ascending: false })
    .limit(50)
  if (dtErr) console.log('ERR:', dtErr.message, dtErr.code)
  else {
    console.log(`rows=${dt.length} active=${dt.filter((r) => r.is_active).length}`)
    dt.slice(0, 8).forEach((r) =>
      console.log(`  ${r.updated_at}  role=${r.role} platform=${r.platform} active=${r.is_active}`))
  }

  console.log('\n=== RECENT SOS (5) ===')
  const { data: sos, error: sErr } = await sb
    .from('sos_requests')
    .select('id,status,patient_name,driver_id,updated_at')
    .order('updated_at', { ascending: false })
    .limit(5)
  if (sErr) console.log('ERR:', sErr.message, sErr.code)
  else sos.forEach((s) =>
    console.log(`  ${s.updated_at}  ${String(s.status).padEnd(14)} ${s.patient_name} driver=${s.driver_id ? 'yes' : 'no'}`))
})().catch((e) => { console.error('FATAL', e.message); process.exit(1) })
