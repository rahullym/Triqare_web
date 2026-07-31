#!/usr/bin/env node
/*
 * Driver-2 push verification harness.
 *
 * Exists because push token registration was broken fleet-wide: the mobile client
 * registers via upsert(onConflict:'device_id'), and INSERT ... ON CONFLICT DO UPDATE
 * needs SELECT privilege, which push_device_tokens_lock_read.sql revoked from
 * anon/authenticated. Result: 42501, device_tokens empty everywhere, no tokens.
 *
 *   node scripts/_driver2-push-test.js grants  -> confirm the GRANT fix landed (no writes)
 *   node scripts/_driver2-push-test.js token   -> is driver2 registered yet?
 *   node scripts/_driver2-push-test.js send    -> send the data-only SOS push to driver2
 *
 * `grants` probes with the ANON key so it tests the exact privilege path the app
 * uses, and asserts reads are still denied by RLS (the lock-read intent must survive
 * the grant). It cleans up every row it writes.
 */
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

const DRIVER = 'driver2@triqare.in'
const PROBE_DEVICE = 'grantcheck-probe'
const PROBE_TOKEN = 'GRANTCHECK_PROBE_DELETEME'

const env = {}
for (const line of fs.readFileSync('.env.netlify', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })

const cmd = process.argv[2] || 'grants'

async function driverUser() {
  const { data, error } = await svc.from('users').select('id,email,role,fcm_token')
    .ilike('email', DRIVER).single()
  if (error) throw new Error('driver lookup: ' + error.message)
  return data
}

async function cleanup() {
  await svc.from('device_tokens').delete().eq('token', PROBE_TOKEN)
}

;(async () => {
  const u = await driverUser()

  if (cmd === 'grants') {
    // 1. The exact call the app makes. This is the one that was returning 42501.
    const { error: upErr } = await anon.from('device_tokens').upsert(
      { device_id: PROBE_DEVICE, user_id: u.id, token: PROBE_TOKEN, role: 'driver',
        platform: 'android', is_active: true, updated_at: new Date().toISOString() },
      { onConflict: 'device_id' })
    console.log(upErr
      ? `upsert(onConflict) : FAIL  ${upErr.code}: ${upErr.message}`
      : 'upsert(onConflict) : OK    <- app can register again')

    // 2. The grant must NOT have re-opened reads. RLS has no SELECT policy, so anon
    //    should get zero rows back rather than the table contents.
    const { data: readRows, error: readErr } = await anon.from('device_tokens').select('token')
    if (readErr) console.log(`anon read         : DENIED (${readErr.code}) — locked at grant layer`)
    else if (!readRows.length) console.log('anon read         : 0 rows — locked by RLS (no SELECT policy)')
    else console.log(`anon read         : !! LEAK !! ${readRows.length} rows visible — revisit RLS`)

    await cleanup()
    console.log('probe rows cleaned up')
    return
  }

  if (cmd === 'token') {
    const { data: rows } = await svc.from('device_tokens')
      .select('token,platform,role,is_active,updated_at').eq('user_id', u.id)
    console.log(`${DRIVER}`)
    console.log(`  users.fcm_token : ${u.fcm_token ? u.fcm_token.slice(0, 18) + '…' : 'NULL'}`)
    console.log(`  device_tokens   : ${rows.length} row(s)`)
    rows.forEach(r => console.log(
      `    ${r.updated_at}  active=${r.is_active} ${r.platform}/${r.role} ${r.token.slice(0, 18)}…`))
    if (!u.fcm_token && !rows.length) console.log('  -> NOT registered; relaunch the app on the phone')
    return
  }

  if (cmd === 'send') {
    const { data: rows } = await svc.from('device_tokens')
      .select('token').eq('user_id', u.id).eq('is_active', true)
    const tokens = [...new Set([...(rows || []).map(r => r.token), u.fcm_token].filter(Boolean))]
    if (!tokens.length) { console.error('no token for ' + DRIVER + ' — run `token` first'); process.exit(1) }

    const { cert, initializeApp } = require('firebase-admin/app')
    const { getMessaging } = require('firebase-admin/messaging')
    const raw = fs.readFileSync('../firebase-env-value.txt', 'utf8').trim()
    const sa = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'))
    const app = initializeApp({ credential: cert(sa) }, 'driver2test')

    // Data-only, mirroring fcm.ts: the headless handler renders it via notifee with
    // loopSound, which is what makes it ring when the app is killed. A notification
    // block would be drawn by the OS instead and could only chime once.
    for (const t of tokens) {
      const id = await getMessaging(app).send({
        token: t,
        data: {
          type: 'sos_new_request',
          requestId: '00000000-0000-4000-8000-000000000000',
          patientName: 'Test Patient',
          title: '🚨 New SOS request (TEST)',
          body: 'Test Patient needs emergency transport. Tap to view and accept.',
        },
        android: { priority: 'high', ttl: 60 * 1000 },
      })
      console.log(`SENT -> ${t.slice(0, 18)}…  message id: ${id}`)
    }
    process.exit(0)
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })
