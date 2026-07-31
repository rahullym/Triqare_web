#!/usr/bin/env node
// Why does driver2 have no push token? Replays the app's two token writes as the
// signed-in driver (anon key = the client's RLS context), which is where a
// silent failure would hide.
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })

;(async () => {
  // Every device_tokens row — is the physical device registered to someone else?
  const { data: all, error: allErr } = await admin.from('device_tokens')
    .select('device_id, user_id, role, platform, is_active, updated_at').order('updated_at', { ascending: false })
  console.log('ALL device_tokens rows:', allErr ? allErr.message : all.length)
  for (const r of (all || []).slice(0, 10)) {
    const { data: u } = await admin.from('users').select('email').eq('id', r.user_id).maybeSingle()
    console.log(`  device=${String(r.device_id).slice(0, 16)} user=${u?.email || r.user_id} role=${r.role} active=${r.is_active} ${r.updated_at}`)
  }

  // Now replay the writes as driver2 under RLS.
  const { data: sess, error: signErr } = await anon.auth.signInWithPassword({
    email: 'driver2@triqare.in', password: process.env.DRIVER_PASSWORD,
  })
  if (signErr) throw new Error('sign-in failed: ' + signErr.message)
  const { data: me } = await anon.from('users').select('id').eq('auth_user_id', sess.user.id).single()
  console.log('\nsigned in as driver2, users.id =', me.id)

  const probeToken = 'RLS-PROBE-TOKEN-not-a-real-fcm-token'
  const { error: devErr } = await anon.from('device_tokens').upsert({
    device_id: 'rls-probe-device', user_id: me.id, token: probeToken,
    role: 'driver', platform: 'android', is_active: true, updated_at: new Date().toISOString(),
  }, { onConflict: 'device_id' })
  console.log('device_tokens upsert as driver2:', devErr ? 'BLOCKED -> ' + devErr.message : 'OK')

  const { data: upd, error: usrErr } = await anon.from('users')
    .update({ fcm_token: probeToken, fcm_token_updated_at: new Date().toISOString() })
    .eq('id', me.id).select('id')
  console.log('users.fcm_token update as driver2:',
    usrErr ? 'BLOCKED -> ' + usrErr.message : (upd && upd.length ? 'OK' : 'SILENTLY WROTE 0 ROWS (RLS hid it)'))

  // Undo the probe so nothing bogus is left behind.
  await admin.from('device_tokens').delete().eq('device_id', 'rls-probe-device')
  await admin.from('users').update({ fcm_token: null, fcm_token_updated_at: null }).eq('id', me.id)
  console.log('\n(probe rows cleaned up)')
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })
