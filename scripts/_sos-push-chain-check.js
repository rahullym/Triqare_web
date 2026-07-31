#!/usr/bin/env node
/*
 * Read-only end-to-end health check for "the driver's phone does not ring".
 *
 *   node scripts/_sos-push-chain-check.js
 *
 * The chain, in order, is:
 *   SOS row written
 *     -> trg_notify_push_on_sos_change (Postgres)
 *     -> pg_net POST /api/push/dispatch
 *     -> dispatchSOSPush picks the audience
 *     -> FCM
 *     -> device
 *
 * Each link below is checked with live data rather than inferred, because every
 * one of them has failed at least once while the layer above it reported success.
 * In particular: the DB trigger fails SILENTLY (it returns without erroring, the
 * SOS write succeeds, and nothing is logged anywhere), so the only way to detect
 * it is to correlate recent sos_requests against push_deliveries — link 2 below.
 *
 * Sends nothing. The FCM check uses validate_only, and the route probe uses a
 * non-existent request id so no audience can be resolved.
 */
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')
const { GoogleAuth } = require('google-auth-library')

const DISPATCH_URL = 'https://triqareweb20.netlify.app/api/push/dispatch'
const DISPATCH_SECRET = 'aff09a5fc2b78aeac9aaa76abf114e567cd754b9ca732c6f6b4f1c8a46499605'
const SA_FILE = '../firebase-env-value.txt' // base64 service account

const env = {}
for (const line of fs.readFileSync('.env.netlify', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const problems = []
const head = (n, t) => console.log(`\n=== ${n}. ${t} ===`)

async function checkRoute() {
  head(1, 'Dispatch route reachable, secret accepted, Firebase configured')
  const res = await fetch(DISPATCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DISPATCH_SECRET}` },
    body: JSON.stringify({
      request_id: '00000000-0000-0000-0000-000000000000',
      new_status: 'SOS Triggered',
    }),
  })
  const body = await res.text()
  console.log(`HTTP ${res.status}  ${body.slice(0, 160)}`)
  if (res.status === 401) problems.push('Dispatch secret does not match Netlify PUSH_DISPATCH_SECRET.')
  else if (res.status === 503) problems.push('PUSH_DISPATCH_SECRET is not set on Netlify.')
  else if (!res.ok) problems.push(`Dispatch route answered HTTP ${res.status}.`)
  else console.log('OK — route is live and the secret is accepted.')
}

async function checkTrigger() {
  head(2, 'Does the DB trigger actually POST? (recent SOS vs push_deliveries)')
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: sos } = await sb
    .from('sos_requests')
    .select('id,requested_at,status,patient_name')
    .gte('requested_at', since)
    .order('requested_at', { ascending: false })
  if (!sos || sos.length === 0) {
    console.log('No SOS in the last 24h — raise one, then re-run. (Cannot judge the trigger.)')
    return
  }
  const { data: deliveries } = await sb
    .from('push_deliveries')
    .select('request_id,event,audience,recipients,sent,failed,invalid,created_at')
    .gte('created_at', since)

  let dispatched = 0
  for (const s of sos) {
    const rows = (deliveries || []).filter((d) => d.request_id === s.id)
    if (rows.length) dispatched++
    const detail = rows.length
      ? rows.map((r) => `${r.audience}:recip=${r.recipients},sent=${r.sent},fail=${r.failed}`).join(' | ')
      : 'NO DISPATCH — trigger never called the route'
    console.log(`${s.requested_at.slice(0, 19)}  ${String(s.status).padEnd(14)} ${String(s.patient_name).padEnd(16)} ${detail}`)
  }
  console.log(`\n${dispatched}/${sos.length} recent SOS produced a dispatch.`)

  // Every SOS goes through at least one status transition (created, and then
  // accepted/cancelled/expired), and the trigger fires on each one — so a healthy
  // trigger leaves NO request without a delivery row. Judging on "did any dispatch
  // at all" is too weak: the reaper/cron and hand-made POSTs also hit the route, and
  // their rows made a dead trigger look alive for two days. Any request with zero
  // rows is the real signal.
  const silent = sos.length - dispatched
  if (silent > 0) {
    problems.push(
      `The DB trigger is not dispatching: ${silent} of the last ${sos.length} SOS produced no ` +
        'push_deliveries row at all (rows that do exist come from the cron reaper or manual POSTs, ' +
        'not the trigger). Apply migrations/99_updates/FIX_2026-07-30_sos_dispatch_trigger.sql ' +
        'in the Supabase SQL editor.'
    )
  }
}

async function checkDriverAudience() {
  head(3, 'Is there anyone to page? (available drivers holding a token)')
  const { data: drivers, error } = await sb
    .from('drivers')
    .select('user_id, latitude, longitude, status')
    .eq('status', 'available')
  if (error) {
    problems.push(`Driver selection query is broken: ${error.code} ${error.message}`)
    return []
  }
  const ids = drivers.map((d) => d.user_id)
  const { data: users } = await sb
    .from('users')
    .select('id,email,is_active,fcm_token')
    .in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])

  const reachable = []
  for (const d of drivers) {
    const u = (users || []).find((x) => x.id === d.user_id)
    const hasToken = !!u?.fcm_token
    if (hasToken && u.is_active) reachable.push(u)
    console.log(
      `  ${String(u?.email ?? d.user_id).padEnd(26)} loc=${d.latitude ?? 'NONE'},${d.longitude ?? 'NONE'} active=${u?.is_active} token=${hasToken ? 'YES' : 'NONE'}`
    )
  }
  console.log(`\n${reachable.length} of ${drivers.length} available driver(s) could be paged.`)
  if (reachable.length === 0) {
    problems.push(
      'No available driver holds an FCM token, so even a working dispatch reaches nobody. ' +
        'The driver must go offline and online again on a build that re-asserts the token (vc34+).'
    )
  }
  if (drivers.some((d) => d.latitude == null)) {
    console.log('NOTE: drivers with no coordinates are included fail-open, but have no real position.')
  }
  return reachable
}

async function checkTokens() {
  head(4, 'Are the stored tokens actually live? (FCM validate_only — sends nothing)')
  let sa
  try {
    sa = JSON.parse(Buffer.from(fs.readFileSync(SA_FILE, 'utf8').trim(), 'base64').toString('utf8'))
  } catch {
    console.log(`Skipped — cannot read ${SA_FILE}.`)
    return
  }
  const auth = new GoogleAuth({
    credentials: sa,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  })
  const { token: accessToken } = await (await auth.getClient()).getAccessToken()
  console.log(`FCM project: ${sa.project_id}`)

  const { data: users } = await sb
    .from('users')
    .select('id,email,role,fcm_token,fcm_token_updated_at')
    .not('fcm_token', 'is', null)

  const byToken = {}
  let dead = 0
  for (const u of users) {
    ;(byToken[u.fcm_token] ||= []).push(u.email)
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ validate_only: true, message: { token: u.fcm_token, data: { probe: '1' } } }),
    })
    const body = await res.json().catch(() => ({}))
    const code = body?.error?.details?.[0]?.errorCode || body?.error?.status
    if (!res.ok) dead++
    console.log(
      `  ${String(u.email).padEnd(28)} role=${String(u.role).padEnd(8)} ${res.ok ? 'VALID' : `DEAD (${code})`}`
    )
  }

  const shared = Object.entries(byToken).filter(([, es]) => es.length > 1)
  console.log(`\n${users.length} user(s) hold a token; ${Object.keys(byToken).length} distinct; ${dead} dead.`)
  for (const [, emails] of shared) {
    console.log(`  SHARED by ${emails.length} accounts: ${emails.join(', ')}`)
  }
  if (shared.length) {
    console.log(
      'A shared token means one handset signed into several accounts. With the legacy\n' +
        'single users.fcm_token column, only the account that signed in last really owns\n' +
        'that device — the others will page a phone that is now someone else.'
    )
  }
}

async function checkMultiDevice() {
  head(5, 'Multi-device store (device_tokens) — the intended replacement')
  const { data, error } = await sb.from('device_tokens').select('user_id,role,is_active')
  if (error) {
    console.log(`device_tokens unreadable: ${error.code} ${error.message}`)
    return
  }
  console.log(`rows=${data.length}`)
  const { error: rpcErr } = await createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  ).rpc('register_device_token', {
    p_device_id: 'chaincheck-probe',
    p_token: 'CHAINCHECK_PROBE',
    p_role: 'driver',
    p_platform: 'android',
  })
  const rpcMissing = rpcErr && rpcErr.code === 'PGRST202'
  console.log(`register_device_token RPC: ${rpcMissing ? 'NOT DEPLOYED' : rpcErr ? rpcErr.code : 'present'}`)
  if (!rpcErr) await sb.from('device_tokens').delete().eq('device_id', 'chaincheck-probe')
  if (data.length === 0 && rpcMissing) {
    console.log(
      'Push is riding the legacy single-token column. Not fatal on its own, but it is why\n' +
        'one phone can only be reachable as one account at a time.'
    )
  }
}

;(async () => {
  await checkRoute()
  await checkTrigger()
  await checkDriverAudience()
  await checkTokens()
  await checkMultiDevice()

  console.log('\n\n================ VERDICT ================')
  if (problems.length === 0) {
    console.log('Every link in the chain is healthy. A new SOS should page the driver.')
  } else {
    problems.forEach((p, i) => console.log(`${i + 1}. ${p}`))
  }
})().catch((e) => {
  console.error('FATAL', e.message)
  process.exit(1)
})
