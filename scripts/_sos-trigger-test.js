#!/usr/bin/env node
/**
 * SOS trigger test harness. Writes the SAME row the patient app's
 * createSOSRequest() writes (Triqare-app/services/sos-service.ts), so the real
 * dispatch pipeline fires.
 *
 *   node scripts/_sos-trigger-test.js check       -> driver + patient readiness, no writes
 *   node scripts/_sos-trigger-test.js fire        -> create an SOS at the driver's location
 *   node scripts/_sos-trigger-test.js watch <id>  -> status + push_deliveries for a request
 *   node scripts/_sos-trigger-test.js clean <id>  -> cancel a test SOS
 *
 * Uses qsospatient@gmail.com (Triqare test pool) so no real person is alerted:
 * its only emergency contact is qsosalpha@gmail.com, also a test account.
 */
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })

const PATIENT_EMAIL = 'qsospatient@gmail.com'
const cmd = process.argv[2] || 'check'
const arg = process.argv[3]

async function driverState(email) {
  const { data: u } = await s.from('users').select('id, email, fcm_token').ilike('email', email).single()
  const { data: d } = await s.from('drivers')
    .select('status, is_available, latitude, longitude, current_request_id').eq('user_id', u.id).single()
  return { ...u, ...d }
}

;(async () => {
  if (cmd === 'check') {
    for (const e of ['driver2@triqare.in', 'driver1@triqare.in']) {
      const d = await driverState(e)
      console.log(`${d.email}: status=${d.status} avail=${d.is_available} loc=${d.latitude},${d.longitude} token=${d.fcm_token ? 'YES' : 'NO'}`)
    }
    const { data: p } = await s.from('users').select('id').ilike('email', PATIENT_EMAIL).single()
    const { data: prow } = await s.from('patients').select('user_id').eq('user_id', p.id).maybeSingle()
    console.log(`patient ${PATIENT_EMAIL}: id=${p.id} patients_row=${prow ? 'yes' : 'MISSING'}`)
    return
  }

  if (cmd === 'fire') {
    const { data: p } = await s.from('users').select('id, full_name, phone').ilike('email', PATIENT_EMAIL).single()
    const d2 = await driverState('driver2@triqare.in')
    const lat = d2.latitude ?? 11.044154
    const lon = d2.longitude ?? 76.0676846
    const now = new Date().toISOString()
    const requestData = {
      patient_id: p.id,
      patient_name: p.full_name || 'Test Patient',
      patient_phone: p.phone || '+919999999999',
      status: 'SOS Triggered',
      location_lat: lat,
      location_lon: lon,
      auto_assigned: true,
      requested_at: now,
      triggered_by: 'PATIENT',
      triggered_by_user_id: p.id,
      status_history: JSON.stringify([{ status: 'SOS Triggered', timestamp: now, actor: 'patient' }]),
    }
    let { data, error } = await s.from('sos_requests').insert(requestData).select().single()
    // Same fallback the app performs when sos_trigger_source.sql has not been applied.
    if (error && (error.code === 'PGRST204' || error.code === '42703')) {
      console.log('(trigger-source columns absent on live — retrying without them, as the app does)')
      const { triggered_by, triggered_by_user_id, ...legacy } = requestData
      ;({ data, error } = await s.from('sos_requests').insert(legacy).select().single())
    }
    if (error) throw new Error('insert failed: ' + error.message)
    console.log('SOS CREATED id=' + data.id)
    console.log('  at', lat, lon, '| status:', data.status)
    return
  }

  if (cmd === 'watch') {
    const { data: r } = await s.from('sos_requests').select('*').eq('id', arg).single()
    console.log(`status=${r.status} driver=${r.driver_name || '-'} driver_id=${r.driver_id || '-'}`)
    const { data: dl } = await s.from('push_deliveries')
      .select('event, audience, recipients, sent, failed').eq('request_id', arg).order('created_at')
    for (const x of dl || []) {
      console.log(`  ${String(x.event).padEnd(24)} ${String(x.audience).padEnd(10)} recipients=${x.recipients} sent=${x.sent} failed=${x.failed}`)
    }
    return
  }

  if (cmd === 'clean') {
    const now = new Date().toISOString()
    const { error } = await s.from('sos_requests').update({ status: 'Cancelled', updated_at: now }).eq('id', arg)
    if (error) throw new Error(error.message)
    console.log('test SOS cancelled:', arg)
    return
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })
