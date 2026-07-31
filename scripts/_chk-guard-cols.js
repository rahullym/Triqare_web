#!/usr/bin/env node
/**
 * The guard in HARDENING_GATED_2026-07-31.sql reads users.is_active. If that
 * column does not exist the guard fails with 42703 and the file is unusable.
 * Verify it, and re-check the guard's own verdict against live.
 */
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')
const env = {}
for (const line of fs.readFileSync('.env.netlify', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

;(async () => {
  const { error } = await svc.from('users').select('is_active').limit(1)
  console.log('users.is_active:', error ? `ABSENT — ${error.code} ${error.message}` : 'present')
  if (error) { console.log('\n-> guard would fail; rewrite it without is_active'); return }

  // Exactly what the guard computes.
  const { count } = await svc
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .is('auth_user_id', null)
  console.log(`guard expression (is_active AND auth_user_id IS NULL): ${count} row(s)`)
  console.log(count === 0 ? '-> guard PASSES on live today' : '-> guard would RAISE and block hardening (correctly)')
})().catch(e => console.error('FATAL', e.message))
