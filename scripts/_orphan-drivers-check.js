/**
 * Driver accounts left behind by the old transport-portal delete, which removed
 * only the `drivers` row: the `users` row stayed Active (counted on Admin > All
 * Users) and its login still worked.
 *
 *   node scripts/_orphan-drivers-check.js           (read-only: list them)
 *   node scripts/_orphan-drivers-check.js --apply   (delete login + users row)
 *
 * Only rows with role=driver, no drivers row and ZERO sos_requests are touched;
 * anything with trips is listed and skipped.
 */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const ROOT = path.resolve(__dirname, '..')
const ENV_FILE = ['.env.netlify', '.env.local', '.env'].find((f) => fs.existsSync(path.join(ROOT, f)))
const env = {}
for (const line of fs.readFileSync(path.join(ROOT, ENV_FILE), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const APPLY = process.argv.includes('--apply')

;(async () => {
  const { data: users, error: uErr } = await admin
    .from('users')
    .select('id, email, full_name, is_active, created_at, auth_user_id')
    .eq('role', 'driver')
  const { data: drivers, error: dErr } = await admin.from('drivers').select('user_id')
  if (uErr || dErr) throw uErr || dErr

  const hasDriverRow = new Set(drivers.map((d) => d.user_id))
  const orphans = users.filter((u) => !hasDriverRow.has(u.id))
  console.log(`${orphans.length} driver account(s) with no drivers row${APPLY ? '' : ' (dry run)'}`)

  for (const o of orphans) {
    const { count } = await admin
      .from('sos_requests')
      .select('id', { count: 'exact', head: true })
      .eq('driver_id', o.id)
    const label = `${o.created_at.slice(0, 10)}  ${o.full_name} <${o.email}>  trips=${count}`
    if (count) {
      console.log(`  SKIP  ${label}`)
      continue
    }
    if (!APPLY) {
      console.log(`  would delete  ${label}`)
      continue
    }
    if (o.auth_user_id) {
      const { error } = await admin.auth.admin.deleteUser(o.auth_user_id)
      if (error && error.status !== 404) {
        console.log(`  FAIL (login)  ${label}: ${error.message}`)
        continue
      }
    }
    const { error } = await admin.from('users').delete().eq('id', o.id)
    console.log(error ? `  FAIL (row)  ${label}: ${error.message}` : `  deleted  ${label}`)
  }
})()
