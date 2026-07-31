#!/usr/bin/env node
/**
 * Create (or repair) a DRIVER login — Supabase auth identity + public.users row
 * (role='driver') + the drivers profile row the driver app reads.
 *
 * Usage (from web-production/):
 *   DRIVER_EMAIL=driver2@triqare.in DRIVER_NAME='Test Driver Two' \
 *   [DRIVER_PASSWORD='...'] [DRIVER_PHONE=9876543210] \
 *   [DRIVER_LICENSE=TEST-DL-0002] [DRIVER_COMPANY_ID=<transport_companies.user_id>] \
 *   node scripts/create-driver-user.js
 *
 * - Creates the auth user already email-confirmed (Supabase Auth is the identity
 *   provider since the Clerk migration), or resets the password + confirms if the
 *   email already exists. Password is generated and printed once if not supplied.
 * - Ensures public.users has role='driver' linked via auth_user_id. The
 *   on_auth_user_created trigger normally creates/links that row; this re-asserts
 *   role + names so the app routes to the (driver) group.
 * - Ensures a drivers row. New drivers start status='inactive' / is_available=false
 *   so they are not dispatched an SOS before they log in and tap GO ONLINE.
 * Idempotent — safe to re-run to reset a driver's password.
 */
const fs = require('fs')
const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

const EMAIL = (process.env.DRIVER_EMAIL || '').trim().toLowerCase()
if (!EMAIL) {
  console.error("Usage: DRIVER_EMAIL=driver2@triqare.in DRIVER_NAME='Test Driver Two' node scripts/create-driver-user.js")
  process.exit(1)
}
const NAME = (process.env.DRIVER_NAME || '').trim()
const PHONE = (process.env.DRIVER_PHONE || '').trim() || null
const LICENSE = (process.env.DRIVER_LICENSE || '').trim() || null
const COMPANY_ID = (process.env.DRIVER_COMPANY_ID || '').trim() || null

// Typable on a phone keyboard but still ~62 bits of entropy.
function generatePassword() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const pick = n => Array.from(crypto.randomBytes(n)).map(b => alphabet[b % alphabet.length]).join('')
  return `Triqare@${pick(10)}`
}
const PASSWORD = process.env.DRIVER_PASSWORD || generatePassword()
const GENERATED = !process.env.DRIVER_PASSWORD

const [first, ...rest] = NAME.split(/\s+/).filter(Boolean)
const FIRST = first || null
const LAST = rest.length ? rest.join(' ') : null

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })

async function findAuthId(email) {
  for (let page = 1; page < 50; page++) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    const u = data.users.find(x => (x.email || '').toLowerCase() === email)
    if (u) return u.id
    if (data.users.length < 1000) break
  }
  return null
}

;(async () => {
  // 1. auth identity (create, or reset password + confirm if it exists)
  let authId
  const { data: created, error: e } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { role: 'driver' },
    user_metadata: { full_name: NAME || undefined, first_name: FIRST || undefined, last_name: LAST || undefined },
  })
  if (!e) {
    authId = created.user.id
    console.log('created auth user')
  } else {
    authId = await findAuthId(EMAIL)
    if (!authId) throw new Error('createUser failed and user not found: ' + e.message)
    const { error: e2 } = await supabase.auth.admin.updateUserById(authId, {
      password: PASSWORD, email_confirm: true, app_metadata: { role: 'driver' },
    })
    if (e2) throw new Error('reset password failed: ' + e2.message)
    console.log('auth user already existed — reset password + confirmed')
  }

  // 2. public.users row with role='driver', linked
  const patch = {
    role: 'driver', auth_user_id: authId, is_active: true,
    updated_at: new Date().toISOString(),
    ...(NAME ? { full_name: NAME, first_name: FIRST, last_name: LAST } : {}),
    ...(PHONE ? { phone: PHONE } : {}),
  }
  const { data: rows } = await supabase.from('users').select('id').ilike('email', EMAIL).limit(1)
  let userId
  if (rows && rows.length) {
    userId = rows[0].id
    const { error: eu } = await supabase.from('users').update(patch).eq('id', userId)
    if (eu) throw new Error('update users row failed: ' + eu.message)
    console.log('public.users row updated to role=driver + linked')
  } else {
    userId = authId
    const { error: ei } = await supabase.from('users').insert({ id: authId, email: EMAIL, ...patch })
    if (ei) throw new Error('insert users row failed: ' + ei.message)
    console.log('inserted new driver public.users row + linked')
  }

  // 3. drivers profile row (user_id is the PK -> upsert is the idempotent path)
  const { data: existingDriver } = await supabase.from('drivers').select('user_id').eq('user_id', userId).maybeSingle()
  if (existingDriver) {
    console.log('drivers row already existed — left status/location untouched')
  } else {
    const { error: ed } = await supabase.from('drivers').insert({
      user_id: userId,
      transport_company_id: COMPANY_ID,
      license_number: LICENSE,
      is_verified: true,
      status: 'inactive',
      is_available: false,
      firstname: FIRST,
      lastname: LAST,
    })
    if (ed) throw new Error('insert drivers row failed: ' + ed.message)
    console.log('inserted drivers profile row (status=inactive until they GO ONLINE)')
  }

  console.log('\nDONE — driver login')
  console.log(`  username (email): ${EMAIL}`)
  console.log(`  password:         ${PASSWORD}${GENERATED ? '  <- generated, save it now' : ''}`)
  console.log(`  users.id:         ${userId}`)
  console.log('  Log in on the Triqare mobile app (email + password).')
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })
