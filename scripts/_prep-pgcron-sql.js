#!/usr/bin/env node
/**
 * Emit a ready-to-paste copy of FIX_2026-07-30_sos_expiry_pgcron.sql with the real
 * CRON_SECRET filled in, written OUTSIDE the repo.
 *
 * webapp_v2.0 is a PUBLIC GitHub repo, so the filled-in file must never land in the
 * working tree — that is how the PUSH_DISPATCH_SECRET ended up published.
 *
 * The substitution is deliberately anchored to the ASSIGNMENT line only. A naive
 * global replace also rewrites the guard three lines below:
 *
 *     sweep_secret text := 'PASTE_CRON_SECRET_HERE';      <- must be replaced
 *     IF sweep_secret = 'PASTE_CRON_SECRET_HERE' THEN     <- must NOT be replaced
 *
 * Replace both and the guard becomes `IF <real> = <real>`, which is always true, so
 * the function raises on every single run and the backstop is dead on arrival.
 */
const fs = require('fs')
const path = require('path')

const OUT_DIR = process.argv[2]
if (!OUT_DIR) { console.error('usage: node scripts/_prep-pgcron-sql.js <output-dir-outside-repo>'); process.exit(1) }

const env = {}
for (const line of fs.readFileSync('.env.netlify', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const secret = env.CRON_SECRET
if (!secret) { console.error('CRON_SECRET missing from .env.netlify'); process.exit(1) }

const SRC = 'migrations/99_updates/FIX_2026-07-30_sos_expiry_pgcron.sql'
const src = fs.readFileSync(SRC, 'utf8')

// Anchor on the assignment only.
const ASSIGN = /(sweep_secret\s+text\s*:=\s*')PASTE_CRON_SECRET_HERE(')/
if (!ASSIGN.test(src)) { console.error('assignment line not found — file changed shape, aborting'); process.exit(1) }
const out = src.replace(ASSIGN, `$1${secret}$2`)

// Verify the guard survived untouched.
const guardIntact = out.includes("IF sweep_secret = 'PASTE_CRON_SECRET_HERE' THEN")
const assignFilled = new RegExp(`sweep_secret\\s+text\\s*:=\\s*'${secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(out)
const leaks = (out.match(/PASTE_CRON_SECRET_HERE/g) || []).length

const dest = path.join(OUT_DIR, 'READY_sos_expiry_pgcron.sql')
fs.writeFileSync(dest, out, { mode: 0o600 })

console.log('wrote:', dest)
console.log('  assignment filled with real secret :', assignFilled ? 'YES' : 'NO  <-- BROKEN')
console.log('  guard placeholder left intact      :', guardIntact ? 'YES' : 'NO  <-- BROKEN, would raise every run')
console.log('  placeholder occurrences remaining  :', leaks, '(expect exactly 1 — the guard)')
console.log('  secret present in repo working tree:', fs.readFileSync(SRC, 'utf8').includes(secret) ? 'YES <-- DO NOT COMMIT' : 'no')
console.log(assignFilled && guardIntact && leaks === 1 ? '\nOK — safe to paste into the Supabase SQL editor.' : '\nDO NOT USE — check above.')
