#!/usr/bin/env node
/**
 * Build the paste-ready RLS fix-forward bundle.
 *
 * Concatenates the two existing migrations VERBATIM rather than restating them,
 * so the bundle can never drift from the files under version control:
 *
 *   1. supabase_auth_migration.sql             — Phase 1: current_app_user_id(),
 *                                                 the provisioning trigger, and the
 *                                                 "my own rows" policies
 *   2. RESTORE_2026-07-29_rls_supplemental.sql — the five cross-user read patterns
 *
 * Deliberately EXCLUDES HARDENING_GATED_2026-07-31.sql. Both files above are inert
 * while RLS is disabled, which is what makes the bundle safe to paste today; the
 * hardening is the only step with a blast radius and is applied separately.
 *
 * Output goes outside the repo — webapp_v2.0 is public, and although neither of
 * these files carries a secret, generated artefacts stay out of the tree on
 * principle after the PUSH_DISPATCH_SECRET leak.
 */
const fs = require('fs')
const path = require('path')

const OUT_DIR = process.argv[2]
if (!OUT_DIR) { console.error('usage: node scripts/_prep-rls-bundle.js <output-dir-outside-repo>'); process.exit(1) }

const BASE = 'migrations/99_updates'
const PARTS = [
  ['PART 1 of 2 — Phase 1: identity helper, provisioning trigger, own-row policies', `${BASE}/supabase_auth_migration.sql`],
  ['PART 2 of 2 — supplemental: the five cross-user read patterns', `${BASE}/RESTORE_2026-07-29_rls_supplemental.sql`],
]

const rule = '-- ' + '='.repeat(77)
const header = [
  rule,
  '-- RLS FIX-FORWARD BUNDLE — generated, do not edit by hand',
  rule,
  '-- Paste this WHOLE file into the Supabase SQL editor and run it.',
  '--',
  '-- SAFE TO RUN NOW. RLS is currently DISABLED on all six core tables, so every',
  '-- policy created here is INERT until the separate hardening step enables RLS.',
  '-- Nothing below changes what any client can currently see.',
  '--',
  '-- Both parts are idempotent (CREATE OR REPLACE / DROP POLICY IF EXISTS /',
  '-- ADD COLUMN IF NOT EXISTS), so re-running is safe.',
  '--',
  '-- Verified against live 2026-07-31:',
  '--   * every column these policies reference exists',
  '--   * 30 of 30 users have auth_user_id set — nobody is locked out later',
  '--   * current_app_user_id() is absent, i.e. Part 1 has genuinely not been applied',
  '--',
  '-- AFTER this, the exposure is still open. Closing it =',
  `--   ${BASE}/HARDENING_GATED_2026-07-31.sql`,
  '-- which is blocked on migrating 75 anon-key call sites. Read its header first.',
  rule,
  '',
].join('\n')

let out = header
for (const [label, file] of PARTS) {
  const body = fs.readFileSync(file, 'utf8')
  out += `\n${rule}\n-- ${label}\n-- source: ${file}\n${rule}\n\n${body}\n`
}

const dest = path.join(OUT_DIR, 'READY_rls_fix_forward.sql')
fs.writeFileSync(dest, out)

// Assert the bundle is what it claims to be.
const checks = [
  ['creates current_app_user_id()',        /CREATE OR REPLACE FUNCTION public\.current_app_user_id/],
  ['creates the 5 cross-user helpers',     /can_read_user_profile/],
  ['driver sees unassigned SOS',           /sos select unassigned for drivers/],
  ['EC reciprocal lookup',                 /emergency_contacts select naming me/],
  ['EC reads allocated patient SOS',       /sos select for allocated contact/],
  ['cross-user identity reads',            /users select counterparty/],
  ['assigned driver reads medical record', /patients select for assigned driver/],
]
console.log('wrote:', dest, `(${out.split('\n').length} lines)\n`)
let ok = true
for (const [label, re] of checks) {
  const hit = re.test(out)
  if (!hit) ok = false
  console.log(`  ${hit ? 'OK  ' : 'MISS'}  ${label}`)
}

// The bundle must NOT contain the destructive statements.
const forbidden = [
  ['ENABLE ROW LEVEL SECURITY', /^\s*ALTER TABLE[^\n]*ENABLE ROW LEVEL SECURITY/m],
  ['REVOKE ... FROM anon',      /^\s*REVOKE[^\n]*FROM anon/m],
]
console.log('')
for (const [label, re] of forbidden) {
  const hit = re.test(out)
  if (hit) ok = false
  console.log(`  ${hit ? 'PRESENT — BUNDLE IS NOT SAFE' : 'absent (correct)'}  ${label}`)
}
console.log(ok ? '\nOK — safe to paste.' : '\nDO NOT USE — check above.')
