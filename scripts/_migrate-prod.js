#!/usr/bin/env node
/**
 * ONE-TIME: give every existing public.users row a Supabase Auth identity.
 *
 * The Clerk->Supabase migration created the public.users rows but NOT the
 * auth.users identities, so existing users cannot log in. This script:
 *   - creates a Supabase auth user for each public.users email that has none
 *     (email-confirmed, with a random temp password),
 *   - links it back: public.users.auth_user_id = <new auth id>,
 *   - if an auth identity already exists for the email, just links it (no new pw),
 *   - skips rows that are already linked.
 *
 * Idempotent. Safe to re-run. OAuth still works afterwards: a later Google/Apple
 * sign-in on the same verified email auto-links to the same account.
 *
 * Usage (run from web-production/):
 *   DRY_RUN=1 node scripts/migrate-users-to-supabase-auth.js   # preview only
 *   node scripts/migrate-users-to-supabase-auth.js             # do it
 *
 * Output: ./migrated-users.csv  (email, role, status, temp_password)
 *   -> distribute temp passwords securely, then DELETE this file. Never commit it.
 */
const fs = require('fs')
const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

const DRY_RUN = !!process.env.DRY_RUN

// --- load URL + service role key from .env.netlify ---
const env = {}
for (const line of fs.readFileSync('.env.netlify', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('Missing SUPABASE URL / SERVICE_ROLE_KEY in .env.netlify'); process.exit(1) }

const supabase = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

function tempPassword() {
  const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', L = 'abcdefghijkmnpqrstuvwxyz', D = '23456789', S = '!@#$%*?'
  const ALL = U + L + D + S
  const pick = s => s[crypto.randomInt(s.length)]
  let pw = pick(U) + pick(L) + pick(D) + pick(S)
  for (let i = 0; i < 10; i++) pw += pick(ALL)
  return pw.split('').sort(() => crypto.randomInt(2) ? 1 : -1).join('')
}

const isEmail = e => typeof e === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)

async function listAllAuthUsers() {
  const map = new Map() // lowercase email -> auth id
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error('listUsers: ' + error.message)
    for (const u of data.users) if (u.email) map.set(u.email.toLowerCase(), u.id)
    if (data.users.length < 1000) break
  }
  return map
}

;(async () => {
  console.log(DRY_RUN ? '### DRY RUN (no changes) ###\n' : '### LIVE RUN ###\n')

  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, role, auth_user_id')
    .order('created_at', { ascending: true })
  if (error) { console.error('fetch users:', error.message); process.exit(1) }

  const authByEmail = await listAllAuthUsers()
  const csv = [['email', 'role', 'status', 'temp_password']]
  const counts = { created: 0, linked_existing: 0, already_linked: 0, skipped: 0, error: 0 }

  for (const u of users) {
    const email = (u.email || '').trim()
    if (!isEmail(email)) { counts.skipped++; csv.push([email, u.role, 'skipped_bad_email', '']); continue }
    if (u.auth_user_id) { counts.already_linked++; csv.push([email, u.role, 'already_linked', '']); continue }

    const existingAuthId = authByEmail.get(email.toLowerCase())
    try {
      if (existingAuthId) {
        // Auth identity already exists — just link it.
        if (!DRY_RUN) {
          const { error: e } = await supabase.from('users').update({ auth_user_id: existingAuthId }).eq('id', u.id)
          if (e) throw new Error(e.message)
        }
        counts.linked_existing++; csv.push([email, u.role, 'linked_existing', '(existing auth user)'])
        console.log(`link  ${email}  (${u.role})`)
      } else {
        // Create a fresh, email-confirmed auth user with a temp password, then link.
        const pw = tempPassword()
        if (!DRY_RUN) {
          const { data: created, error: e } = await supabase.auth.admin.createUser({
            email, password: pw, email_confirm: true,
          })
          if (e) throw new Error(e.message)
          const { error: e2 } = await supabase.from('users').update({ auth_user_id: created.user.id }).eq('id', u.id)
          if (e2) throw new Error('created but link failed: ' + e2.message)
        }
        counts.created++; csv.push([email, u.role, 'created', pw])
        console.log(`create ${email}  (${u.role})`)
      }
    } catch (e) {
      counts.error++; csv.push([email, u.role, 'ERROR: ' + e.message, ''])
      console.error(`ERROR ${email}: ${e.message}`)
    }
  }

  if (!DRY_RUN) {
    const out = csv.map(r => r.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',')).join('\n')
    fs.writeFileSync('migrated-users.csv', out)
    console.log('\nWrote migrated-users.csv (contains temp passwords — distribute securely, then delete).')
  }
  console.log('\nSummary:', JSON.stringify(counts, null, 2))
})().catch(e => { console.error('FATAL', e.message); process.exit(1) })
