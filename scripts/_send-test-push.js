#!/usr/bin/env node
/*
 * TEMP: send ONE push to a single user's device, in exactly the shape the server
 * now sends for sos.created — DATA-ONLY, no notification block.
 *
 * That is the whole point: a data-only message is delivered to the app's headless
 * FCM handler even when the app is killed, which then displays it via notifee with
 * loopSound. A notification-block message would be rendered by the OS instead and
 * could only chime once.
 *
 * Usage: node scripts/_send-test-push.js <email>
 */
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')
const { cert, initializeApp } = require('firebase-admin/app')
const { getMessaging } = require('firebase-admin/messaging')

const TARGET = process.argv[2]
if (!TARGET) { console.error('usage: node scripts/_send-test-push.js <email>'); process.exit(1) }

const env = {}
for (const line of fs.readFileSync('.env.netlify', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

;(async () => {
  const { data: users, error } = await sb.from('users').select('id,email,role,fcm_token')
  if (error) { console.error('users ERR:', error.message); process.exit(1) }

  const target = users.find((u) => u.email === TARGET)
  if (!target?.fcm_token) { console.error(`${TARGET}: no token`); process.exit(1) }
  console.log(`target: ${target.email} (${target.role})  token ${target.fcm_token.slice(0, 10)}…`)

  const raw = fs.readFileSync('../firebase-env-value.txt', 'utf8').trim()
  const sa = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'))
  const app = initializeApp({ credential: cert(sa) }, 'testsend')

  // Mirrors fcm.ts dataOnly branch exactly: no `notification`, no
  // `android.notification`, copy carried in `data`.
  const id = await getMessaging(app).send({
    token: target.fcm_token,
    data: {
      type: 'sos_new_request',
      requestId: '00000000-0000-4000-8000-000000000000',
      patientName: 'Test Patient',
      title: '🚨 New SOS request (TEST)',
      body: 'Test Patient needs emergency transport. Tap to view and accept.',
    },
    android: { priority: 'high' },
  })
  console.log(`SENT data-only — message id: ${id}`)
  process.exit(0)
})().catch((e) => { console.error('FATAL', e.message); process.exit(1) })
