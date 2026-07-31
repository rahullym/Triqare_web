#!/usr/bin/env node
/* TEMP read-only: is the emergency-contact SOS flow testable right now? */
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

const last10 = (p) => (p || '').replace(/\D/g, '').slice(-10)

;(async () => {
  const { data: users } = await sb
    .from('users')
    .select('id,email,phone,full_name,role,account_type,auth_user_id,fcm_token,is_active')
  const { data: ecs } = await sb
    .from('emergency_contacts')
    .select('id,patient_id,name,email,phone,contact_user_id,relationship')
  const { data: tokens, error: tokErr } = await sb
    .from('device_tokens')
    .select('user_id,platform,updated_at,token')
  if (tokErr) console.log('device_tokens ERR:', tokErr.code, tokErr.message)

  const byId = new Map((users || []).map((u) => [u.id, u]))
  const tokensByUser = new Map()
  for (const t of tokens || []) {
    if (!tokensByUser.has(t.user_id)) tokensByUser.set(t.user_id, [])
    tokensByUser.get(t.user_id).push(t)
  }

  console.log(`\n=== EMERGENCY_CONTACT ROWS (${(ecs || []).length}) — who can see whose SOS ===`)
  for (const ec of ecs || []) {
    const patient = byId.get(ec.patient_id)
    // Same match the app uses: email ilike OR phone last-10
    const matched = (users || []).filter(
      (u) =>
        (ec.email && u.email && u.email.toLowerCase() === ec.email.toLowerCase()) ||
        (ec.phone && u.phone && last10(u.phone) && last10(u.phone) === last10(ec.phone))
    )
    const toks = matched.flatMap((m) => tokensByUser.get(m.id) || [])
    const legacy = matched.filter((m) => m.fcm_token).length
    const inactive = matched.filter((m) => m.is_active === false).length
    console.log(
      `- patient=${patient ? patient.full_name || patient.email : ec.patient_id.slice(0, 8)} ` +
        `| contact="${ec.name}" <${ec.email || 'no-email'}> ${ec.phone || ''} ` +
        `| contact_user_id=${ec.contact_user_id ? 'SET' : 'null'} ` +
        `| appAccount=${matched.length ? matched.map((m) => m.email).join(',') : 'NONE'} ` +
        `| deviceTok=${toks.length} legacyTok=${legacy}${inactive ? ` INACTIVE=${inactive}` : ''}`
    )
  }

  console.log(`\n=== USERS WITH DEVICE TOKENS (${tokensByUser.size}) ===`)
  for (const [uid, toks] of tokensByUser) {
    const u = byId.get(uid)
    console.log(
      `- ${u ? `${u.email} (${u.role}${u.account_type ? '/' + u.account_type : ''})` : uid} ` +
        `: ${toks.length} token(s) [${toks.map((t) => t.platform).join(',')}] newest=${
          toks.map((t) => t.updated_at).sort().slice(-1)[0]
        }`
    )
  }

  console.log('\n=== RECENT SOS (8) ===')
  const { data: sos, error: sosErr } = await sb
    .from('sos_requests')
    .select('id,patient_id,status,requested_at,driver_id')
    .order('requested_at', { ascending: false })
    .limit(8)
  if (sosErr) console.log('sos_requests ERR:', sosErr.code, sosErr.message)
  for (const s of sos || []) {
    const p = byId.get(s.patient_id)
    console.log(
      `- ${s.requested_at}  ${String(s.status).padEnd(20)} patient=${p ? p.email : s.patient_id.slice(0, 8)} driver=${s.driver_id ? 'yes' : 'none'} id=${s.id.slice(0, 8)}`
    )
  }

  console.log('\n=== PUSH_DELIVERIES audience=contact (recent 10) ===')
  const { data: pd, error: pdErr } = await sb
    .from('push_deliveries')
    .select('created_at,event,audience,recipients,sent,failed,not_configured')
    .eq('audience', 'contact')
    .order('created_at', { ascending: false })
    .limit(10)
  if (pdErr) console.log('ERR:', pdErr.message, pdErr.code)
  else if (!pd.length) console.log('(no contact pushes ever logged)')
  else pd.forEach((r) =>
    console.log(`${r.created_at}  ${r.event}  recip=${r.recipients} sent=${r.sent} failed=${r.failed} notCfg=${r.not_configured}`)
  )

  console.log('\n=== ALL PUSH_DELIVERIES (recent 10, any audience) ===')
  const { data: pa } = await sb
    .from('push_deliveries')
    .select('created_at,event,audience,recipients,sent,failed')
    .order('created_at', { ascending: false })
    .limit(10)
  ;(pa || []).forEach((r) =>
    console.log(`${r.created_at}  ${String(r.event).padEnd(22)} ${String(r.audience).padEnd(8)} recip=${r.recipients} sent=${r.sent} failed=${r.failed}`)
  )
})()
