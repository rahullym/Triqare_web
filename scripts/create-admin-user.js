#!/usr/bin/env node
/**
 * Create (or repair) an ADMIN login in Supabase — auth identity + admin row + link.
 * Handy for the first admin, which the bulk migration doesn't cover if it has no
 * public.users row yet (e.g. triqare@gmail.com).
 *
 * Usage (from web-production/):
 *   ADMIN_EMAIL=triqare@gmail.com ADMIN_PASSWORD='ChooseAStrongOne!' node scripts/create-admin-user.js
 *
 * - Creates the auth user email-confirmed with the given password (or resets the
 *   password + confirms if it already exists).
 * - Ensures a public.users row with role='admin', linked via auth_user_id.
 * Idempotent. The password is read from the env var and never written to disk.
 */
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

const EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
const PASSWORD = process.env.ADMIN_PASSWORD || ''
if (!EMAIL || !PASSWORD) {
  console.error("Usage: ADMIN_EMAIL=you@x.com ADMIN_PASSWORD='...' node scripts/create-admin-user.js")
  process.exit(1)
}

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
    email: EMAIL, password: PASSWORD, email_confirm: true,
  })
  if (!e) {
    authId = created.user.id
    console.log('created auth user')
  } else {
    authId = await findAuthId(EMAIL)
    if (!authId) throw new Error('createUser failed and user not found: ' + e.message)
    const { error: e2 } = await supabase.auth.admin.updateUserById(authId, { password: PASSWORD, email_confirm: true })
    if (e2) throw new Error('reset password failed: ' + e2.message)
    console.log('auth user already existed — reset password + confirmed')
  }

  // 2. admin row, linked
  const { data: rows } = await supabase.from('users').select('id').ilike('email', EMAIL).limit(1)
  if (rows && rows.length) {
    const { error: eu } = await supabase.from('users')
      .update({ role: 'admin', auth_user_id: authId, is_active: true, updated_at: new Date().toISOString() })
      .eq('id', rows[0].id)
    if (eu) throw new Error('update row failed: ' + eu.message)
    console.log('promoted existing public.users row to admin + linked')
  } else {
    const { error: ei } = await supabase.from('users')
      .insert({ id: authId, auth_user_id: authId, email: EMAIL, role: 'admin', is_active: true })
    if (ei) throw new Error('insert row failed: ' + ei.message)
    console.log('inserted new admin public.users row + linked')
  }

  console.log(`\nDONE. Log in at https://triqare.com/sign-in as ${EMAIL}`)
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })
